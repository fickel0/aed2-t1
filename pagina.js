// a página: carrega o CSV, monta as estruturas e faz as buscas

const POR_PAGINA = 50;

// as estruturas. cada ocorrência existe uma vez só, na B+. os índices guardam
// referências pro mesmo objeto, não cópias
let ocorrencias = new ArvoreBMais(); // B+: id → ocorrência
let palavras = new TST(); // TST: palavra do endereço → conjunto (hash id → ocorrência)
let idxTipo = new TabelaHash(); // tipo → conjunto (hash id → ocorrência)
let idxRegiao = new TabelaHash(); // região → conjunto (hash id → ocorrência)
let pendentes = new TabelaHash(); // id → ocorrência, só as não atendidas

let resultado = [];
let pagina = 0;

// atalho pra pegar um elemento pelo id
function el(id) {
    return document.getElementById(id);
}

function novaOpcao(texto, valor) {
    const opcao = document.createElement("option");
    opcao.textContent = texto;
    opcao.value = valor;
    return opcao;
}

// leitura do CSV

// cada linha vira um objeto { id: ..., categoria: ..., ... } usando o cabeçalho.
// nenhum campo do dados.csv tem vírgula, então o split basta
function lerCsv(texto) {
    const linhas = texto.split(/\r?\n/).filter((linha) => linha !== "");
    const cabecalho = linhas[0].split(",");
    const objetos = [];
    for (const linha of linhas.slice(1)) {
        const campos = linha.split(",");
        const objeto = {};
        cabecalho.forEach((nome, i) => (objeto[nome] = campos[i] ?? ""));
        objetos.push(objeto);
    }
    return objetos;
}

// índices

// palavras que não ajudam a achar nada: tipo de via e direção.
// quase todo endereço tem RD, ST ou AVE, então buscar por elas devolveria a base toda.
// a lista é fixa, então procurar nela custa sempre o mesmo
const TIPOS_DE_VIA = "RD ST AVE DR PIKE LN BLVD CIR WAY CT ALY PL TER TRL EXPY TPKE HWY ROAD PKWY LANE SQ PLZ";
const DIRECOES = "N S E W NB SB EB WB";
const IGNORADAS = (TIPOS_DE_VIA + " " + DIRECOES).split(" ");

// as palavras de um endereço, em maiúsculas, sem as ignoradas e sem o "&".
// "W MAIN ST & N YORK RD" vira ["MAIN", "YORK"]
function palavrasDe(endereco) {
    const lista = endereco.toUpperCase().split(/[\s&]+/);
    return lista.filter((p) => /[A-Z0-9]/.test(p) && !IGNORADAS.includes(p));
}

// coloca a ocorrência no conjunto da chave (cria o conjunto se for o primeiro)
function colocarNoConjunto(indice, chave, o) {
    let conjunto = indice.buscar(chave);
    if (conjunto === undefined) {
        conjunto = new TabelaHash();
        indice.inserir(chave, conjunto);
    }
    conjunto.inserir(o.id, o);
}

function indexar(o) {
    ocorrencias.inserir(o.id, o);
    for (const palavra of palavrasDe(o.endereco)) colocarNoConjunto(palavras, palavra, o);
    colocarNoConjunto(idxTipo, o.tipo, o);
    colocarNoConjunto(idxRegiao, o.regiao, o);
    if (o.atendido === 0) pendentes.inserir(o.id, o);
}

// carga

// tudo fica só na memória: um F5 apaga os dados e a escolha do arquivo
el("arquivo").addEventListener("change", async () => {
    const arquivo = el("arquivo").files[0];
    if (arquivo) carregar(await arquivo.text());
});

// linha com campo vazio, id inválido, categoria desconhecida ou id repetido fica de fora
function carregar(texto) {
    ocorrencias = new ArvoreBMais();
    palavras = new TST();
    idxTipo = new TabelaHash();
    idxRegiao = new TabelaHash();
    pendentes = new TabelaHash();

    let ignoradas = 0;
    for (const linha of lerCsv(texto)) {
        const id = textoParaId(linha.id);
        const temVazio = COLUNAS.some((coluna) => linha[coluna].trim() === "");
        if (id === null || temVazio || !CATEGORIAS.includes(linha.categoria) || ocorrencias.buscar(id)) {
            ignoradas++;
            continue;
        }
        linha.id = id;
        linha.atendido = Number(linha.atendido);
        indexar(linha);
    }
    el("infoCarga").textContent = `${ocorrencias.tamanho} ocorrências carregadas, ${ignoradas} linhas ignoradas`;
    preencherListas();
    buscar();
}

// as listas de região e de tipo saem dos próprios índices
function preencherListas() {
    el("regiao").replaceChildren(novaOpcao("todas", ""));
    for (const regiao of idxRegiao.chaves().sort()) {
        el("regiao").append(novaOpcao(regiao, regiao));
    }

    el("tipo").replaceChildren(novaOpcao("todos", ""));
    for (const tipo of idxTipo.chaves().sort()) el("tipo").append(novaOpcao(tipo, tipo));
}

// sugestões: a cada letra digitada, a TST devolve as palavras que começam com a última
// palavra do campo. as palavras de antes ficam como estão.
// as mais curtas vêm primeiro (são as mais perto do que foi digitado), e no empate a
// ordem alfabética da TST se mantém, porque o sort é estável
el("endereco").addEventListener("input", () => {
    el("sugestoes").replaceChildren();
    const texto = el("endereco").value.toUpperCase();
    const antes = texto.slice(0, texto.lastIndexOf(" ") + 1);
    const ultima = texto.slice(antes.length);
    if (ultima === "") return;
    const lista = [];
    palavras.paraCadaChave(ultima, (palavra, conjunto) => {
        if (conjunto.tamanho > 0) lista.push({ palavra, quantidade: conjunto.tamanho });
    });
    lista.sort((a, b) => a.palavra.length - b.palavra.length);
    for (const s of lista.slice(0, 20)) {
        el("sugestoes").append(novaOpcao(`${s.palavra} (${s.quantidade})`, antes + s.palavra));
    }
});

// campos da busca

// consultar por id vai direto na B+. o id não combina com os filtros, então eles são
// limpos (e, no contrário, buscar pelos filtros apaga o id)
el("consulta").addEventListener("submit", (evento) => {
    evento.preventDefault(); // senão o formulário recarrega a página
    el("endereco").value = "";
    el("regiao").value = "";
    el("categoria").value = "";
    el("tipo").value = "";
    el("de").value = "";
    el("ate").value = "";
    el("soPendentes").checked = false;
    const id = textoParaId(el("id").value);
    const o = id === null ? undefined : ocorrencias.buscar(id);
    mostrarResultado(o === undefined ? [] : [o]);
});

// qualquer mudança num filtro (digitar, escolher, marcar) já refaz a busca.
// escolher uma sugestão do endereço também conta como mudança
el("busca").addEventListener("input", buscar);

// o Enter não pode enviar o formulário, senão a página recarrega
el("busca").addEventListener("submit", (evento) => evento.preventDefault());

// volta tudo pro padrão: só pendentes, por prioridade, sem endereço, região, tipo nem período
el("limpar").addEventListener("click", () => {
    el("busca").reset();
    buscar();
});

el("qualquerPeriodo").addEventListener("click", () => {
    el("de").value = "";
    el("ate").value = "";
    buscar();
});

// os atalhos preenchem de (agora - x minutos) até agora
for (const botao of document.querySelectorAll("[data-minutos]")) {
    botao.addEventListener("click", () => {
        const agora = Date.now();
        el("de").value = paraCampo(agora - botao.dataset.minutos * 60 * 1000);
        el("ate").value = paraCampo(agora);
        buscar();
    });
}

// o campo datetime-local quer "2026-10-05T14:30:00" no horário local
function paraCampo(ms) {
    const fuso = new Date(ms).getTimezoneOffset() * 60 * 1000;
    return new Date(ms - fuso).toISOString().slice(0, 19);
}

function paraSegundos(valorDoCampo) {
    return Math.floor(new Date(valorDoCampo).getTime() / 1000);
}

function lerCampos() {
    const de = el("de").value;
    const ate = el("ate").value;
    return {
        endereco: palavrasDe(el("endereco").value), // lista de palavras
        regiao: el("regiao").value,
        categoria: el("categoria").value,
        tipo: el("tipo").value,
        soPendentes: el("soPendentes").checked,
        ordem: el("busca").ordem.value, // recentes, antigos ou prioridade
        // o período vira um intervalo de ids: do primeiro sufixo do segundo inicial até
        // o último sufixo do segundo final. sem data, vai do começo ao fim
        menor: de ? criarId(paraSegundos(de), 0) : 0,
        maior: ate ? criarId(paraSegundos(ate), 255) : Number.MAX_SAFE_INTEGER,
    };
}

// busca

// a busca é feita em três etapas, como num banco de dados:
// - caminho: o primeiro campo preenchido, nesta ordem, usa a sua estrutura pra gerar as
//   candidatas. a ordem é de quem costuma devolver menos linhas
// - filtro: cada candidata é conferida contra todos os campos preenchidos
// - ordem: recentes, antigos ou prioridade
function buscar() {
    el("id").value = "";
    const c = lerCampos();
    const { lista, emOrdem } = candidatas(c);
    const filtradas = lista.filter((o) => passa(o, c));
    ordenar(filtradas, emOrdem, c.ordem);
    mostrarResultado(filtradas);
}

// emOrdem diz se a lista já veio na ordem de data pedida (só a B+ entrega assim)
function candidatas(c) {
    if (c.endereco.length > 0) {
        // a TST usa só a primeira palavra. as outras ficam pro filtro
        return { lista: comPrefixo(c.endereco[0]), emOrdem: false };
    }
    if (c.regiao !== "") return { lista: valoresDoConjunto(idxRegiao, c.regiao), emOrdem: false };
    if (c.tipo !== "") return { lista: valoresDoConjunto(idxTipo, c.tipo), emOrdem: false };
    if (c.soPendentes) return { lista: pendentes.valores(), emOrdem: false };
    // sem nenhum dos de cima: o período (ou a base inteira, se ele estiver vazio).
    // a B+ devolve do mais velho pro mais novo, então pros recentes é só inverter
    const lista = ocorrencias.intervalo(c.menor, c.maior);
    if (c.ordem === "recentes") lista.reverse();
    return { lista, emOrdem: true };
}

// as ocorrências de todas as palavras que começam com o prefixo, sem repetir
// (MILL e MILLER começam com MIL, e um endereço pode ter as duas)
function comPrefixo(prefixo) {
    const juntas = new TabelaHash();
    palavras.paraCadaChave(prefixo, (palavra, conjunto) => {
        for (const o of conjunto.valores()) juntas.inserir(o.id, o);
    });
    return juntas.valores();
}

function valoresDoConjunto(indice, chave) {
    const conjunto = indice.buscar(chave);
    return conjunto === undefined ? [] : conjunto.valores();
}

function passa(o, c) {
    // cada palavra buscada tem que ser começo de alguma palavra do endereço
    const doEndereco = palavrasDe(o.endereco);
    for (const p of c.endereco) {
        if (!doEndereco.some((q) => q.startsWith(p))) return false;
    }
    if (c.regiao !== "" && o.regiao !== c.regiao) return false;
    if (c.categoria !== "" && o.categoria !== c.categoria) return false;
    if (c.tipo !== "" && o.tipo !== c.tipo) return false;
    if (c.soPendentes && o.atendido !== 0) return false;
    return o.id >= c.menor && o.id <= c.maior;
}

// recentes e antigos: se veio da B+, já está em ordem e não precisa ordenar.
// senão ordena por id, que é o mesmo que ordenar por data.
// prioridade: o sort do JS é estável (empate mantém a ordem de antes). então primeiro
// põe do mais velho pro mais novo e depois ordena só pelo nível: no empate, o mais
// velho fica na frente
function ordenar(lista, emOrdem, ordem) {
    if (ordem === "prioridade") {
        lista.sort((a, b) => a.id - b.id);
        lista.sort((a, b) => nivelDe(b) - nivelDe(a));
    } else if (emOrdem) {
        return;
    } else if (ordem === "antigos") {
        lista.sort((a, b) => a.id - b.id);
    } else {
        lista.sort((a, b) => b.id - a.id);
    }
}

// tabela e páginas

// só a exibição é dividida em páginas: o resultado inteiro já foi calculado (a tela mostra
// o total e a ordem por prioridade precisa de todo mundo). é só pra não desenhar
// 10 mil linhas de uma vez

function mostrarResultado(lista) {
    resultado = lista;
    el("contagem").textContent = `${resultado.length} ocorrências`;
    pagina = 0;
    mostrar();
}

el("anterior").addEventListener("click", () => {
    pagina--;
    mostrar();
});

el("proxima").addEventListener("click", () => {
    pagina++;
    mostrar();
});

function mostrar() {
    const tabela = el("linhas");
    tabela.replaceChildren();
    for (const o of resultado.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)) {
        const data = new Date(segundosDoId(o.id) * 1000).toLocaleString("pt-BR");
        const situacao = o.atendido ? "atendida" : "pendente";
        const tr = tabela.insertRow();
        const valores = [idParaTexto(o.id), data, o.categoria, o.tipo, nivelDe(o), o.regiao, o.endereco, situacao];
        for (const valor of valores) tr.insertCell().textContent = valor;
    }
    const totalPaginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));
    el("pagina").textContent = `página ${pagina + 1} de ${totalPaginas}`;
    el("anterior").disabled = pagina === 0;
    el("proxima").disabled = pagina >= totalPaginas - 1;
}

mostrar();
