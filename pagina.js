// a página: carrega o CSV, monta as estruturas, faz as buscas e edita as ocorrências

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
// nenhum campo tem vírgula (a janela de edição troca por espaço), então o split basta
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

// o contrário do indexar. os conjuntos que ficam vazios continuam lá (a TST nem tem
// remoção), e quem lista os índices pula eles
function desindexar(o) {
    ocorrencias.remover(o.id);
    for (const palavra of palavrasDe(o.endereco)) palavras.buscar(palavra).remover(o.id);
    idxTipo.buscar(o.tipo).remover(o.id);
    idxRegiao.buscar(o.regiao).remover(o.id);
    pendentes.remover(o.id);
}

// carga

// tudo fica só na memória: um F5 apaga os dados e a escolha do arquivo
el("arquivo").addEventListener("change", async () => {
    const arquivo = el("arquivo").files[0];
    if (arquivo) carregar(await arquivo.text());
});

// a carga também confere a integridade de cada linha e mostra um relatório no fim:
// - incompleta: campo vazio ou valor inválido. não entra
// - alterada: o hash do CSV não bate com o recalculado (alguém mexeu fora do sistema). entra
// - duplicada: mesmo conteúdo de outra linha. com o mesmo id não entra, com outro id entra
// - conflito: mesmo id de outra linha, mas conteúdo diferente. fica a primeira
function carregar(texto) {
    ocorrencias = new ArvoreBMais();
    palavras = new TST();
    idxTipo = new TabelaHash();
    idxRegiao = new TabelaHash();
    pendentes = new TabelaHash();

    const incompletas = [];
    const alteradas = [];
    const duplicadas = [];
    const conflitos = [];
    // texto canônico → id da primeira ocorrência com esse conteúdo. o canônico não tem o
    // sufixo do id, então duas ocorrências iguais no mesmo segundo caem na mesma chave
    const vistos = new TabelaHash();

    let numero = 1; // número da linha no arquivo (a 1 é o cabeçalho)
    for (const linha of lerCsv(texto)) {
        numero++;
        const id = textoParaId(linha.id);
        const temVazio = COLUNAS.some((coluna) => linha[coluna].trim() === "");
        const valido = CATEGORIAS.includes(linha.categoria) && (linha.atendido === "0" || linha.atendido === "1");
        if (id === null || temVazio || !valido) {
            incompletas.push(`linha ${numero} (${linha.id})`);
            continue;
        }
        linha.id = id;
        linha.atendido = Number(linha.atendido);
        const canonico = textoCanonico(linha);

        const mesmoId = ocorrencias.buscar(id);
        if (mesmoId !== undefined) {
            if (textoCanonico(mesmoId) === canonico) duplicadas.push(`linha ${numero}: cópia de ${idParaTexto(id)}`);
            else conflitos.push(`linha ${numero}: ${idParaTexto(id)} já existe com outro conteúdo`);
            continue;
        }

        const mesmoConteudo = vistos.buscar(canonico);
        if (mesmoConteudo !== undefined) {
            duplicadas.push(`${idParaTexto(id)}: mesmo conteúdo de ${idParaTexto(mesmoConteudo)}`);
        } else {
            vistos.inserir(canonico, id);
        }

        if (linha.hash !== hashDaOcorrencia(linha)) alteradas.push(idParaTexto(id));
        indexar(linha);
    }

    el("infoCarga").textContent = `${ocorrencias.tamanho} ocorrências carregadas`;
    el("textoRelatorio").textContent = [
        `${ocorrencias.tamanho} ocorrências carregadas.`,
        parteDoRelatorio("Incompletas ou inválidas (não carregadas)", incompletas),
        parteDoRelatorio("Alteradas fora do sistema (o hash não bate)", alteradas),
        parteDoRelatorio("Duplicadas", duplicadas),
        parteDoRelatorio("Conflitos de versão (ficou a primeira)", conflitos),
    ].join("\n\n");
    el("relatorio").showModal();

    preencherListas();
    buscar();
}

// o título com a quantidade e as 20 primeiras, pra janela não ficar enorme
function parteDoRelatorio(titulo, lista) {
    const linhas = [`${titulo}: ${lista.length}`];
    for (const item of lista.slice(0, 20)) linhas.push("  " + item);
    if (lista.length > 20) linhas.push(`  ... e mais ${lista.length - 20}`);
    return linhas.join("\n");
}

// as listas de região e de tipo saem das chaves dos próprios índices. o que estava
// escolhido continua escolhido (depois de salvar uma ocorrência, por exemplo)
function preencherListas() {
    const regiaoEscolhida = el("regiao").value;
    const tipoEscolhido = el("tipo").value;

    el("regiao").replaceChildren(novaOpcao("todas", ""));
    el("regioesConhecidas").replaceChildren();
    for (const regiao of idxRegiao.chaves().sort()) {
        if (idxRegiao.buscar(regiao).tamanho === 0) continue;
        el("regiao").append(novaOpcao(regiao, regiao));
        el("regioesConhecidas").append(novaOpcao(regiao, regiao));
    }

    el("tipo").replaceChildren(novaOpcao("todos", ""));
    for (const tipo of idxTipo.chaves().sort()) {
        if (idxTipo.buscar(tipo).tamanho > 0) el("tipo").append(novaOpcao(tipo, tipo));
    }

    // na janela de edição, a sugestão de tipo são os da tabela de prioridades
    el("tiposConhecidos").replaceChildren();
    for (const tipo of prioridades.chaves().sort()) el("tiposConhecidos").append(novaOpcao(tipo, tipo));

    el("regiao").value = regiaoEscolhida;
    el("tipo").value = tipoEscolhido;
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

// cadastro, edição e remoção

// a mesma janela serve pra criar e editar. editando é a ocorrência aberta, ou null se for nova
let editando = null;

el("nova").addEventListener("click", () => abrirJanela(null));

function abrirJanela(o) {
    editando = o;
    const f = el("editor");
    f.reset();
    el("botaoRemover").hidden = o === null;
    if (o === null) {
        el("tituloJanela").textContent = "Nova ocorrência (com a data e hora de agora)";
    } else {
        el("tituloJanela").textContent = `Ocorrência ${idParaTexto(o.id)}, de ${dataNaTela(o.id)}`;
        f.categoria.value = o.categoria;
        f.tipo.value = o.tipo;
        f.regiao.value = o.regiao;
        f.zip.value = o.zip;
        f.endereco.value = o.endereco;
        f.atendido.checked = o.atendido === 1;
    }
    el("janela").returnValue = ""; // o Esc fecha sem mudar isso, então conta como cancelar
    el("janela").showModal();
}

// o form da janela é method="dialog": qualquer botão fecha a janela, e o value do botão
// vira o returnValue
el("janela").addEventListener("close", () => {
    const acao = el("janela").returnValue;
    if (acao === "salvar") salvar();
    else if (acao === "remover") desindexar(editando);
    else return;
    preencherListas();
    // refaz o que estava na tela: a consulta por id, se tinha uma, ou a busca pelos filtros
    if (el("id").value !== "") el("consulta").requestSubmit();
    else buscar();
});

// editar é tirar dos índices, mudar os campos e colocar de novo. o id não muda
function salvar() {
    const f = el("editor");
    let o = editando;
    if (o === null) o = { id: idDeAgora() };
    else desindexar(o);
    o.categoria = f.categoria.value;
    o.tipo = semVirgula(f.tipo.value);
    o.regiao = semVirgula(f.regiao.value);
    o.zip = semVirgula(f.zip.value);
    o.endereco = semVirgula(f.endereco.value).toUpperCase();
    o.atendido = f.atendido.checked ? 1 : 0;
    o.hash = hashDaOcorrencia(o);
    indexar(o);
}

// vírgula vira espaço, senão quebraria a coluna no CSV
function semVirgula(texto) {
    return texto.replaceAll(",", " ").trim();
}

// o segundo atual com o primeiro sufixo que ninguém usou
function idDeAgora() {
    const segundos = Math.floor(Date.now() / 1000);
    let sufixo = 0;
    while (ocorrencias.buscar(criarId(segundos, sufixo)) !== undefined) sufixo++;
    return criarId(segundos, sufixo);
}

// salvar CSV: o mesmo formato do preparar_dados.py, em ordem de id
el("salvarCsv").addEventListener("click", () => {
    const linhas = [COLUNAS.join(",")];
    for (const o of ocorrencias.intervalo(0, Number.MAX_SAFE_INTEGER)) {
        linhas.push(COLUNAS.map((coluna) => (coluna === "id" ? idParaTexto(o.id) : o[coluna])).join(","));
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([linhas.join("\n") + "\n"], { type: "text/csv" }));
    link.download = "dados.csv";
    link.click();
});

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

function dataNaTela(id) {
    return new Date(segundosDoId(id) * 1000).toLocaleString("pt-BR");
}

function mostrar() {
    const tabela = el("linhas");
    tabela.replaceChildren();
    for (const o of resultado.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA)) {
        const data = dataNaTela(o.id);
        const situacao = o.atendido ? "atendida" : "pendente";
        const tr = tabela.insertRow();
        const valores = [idParaTexto(o.id), data, o.categoria, o.tipo, nivelDe(o), o.regiao, o.endereco, situacao];
        for (const valor of valores) tr.insertCell().textContent = valor;
        const editar = document.createElement("button");
        editar.textContent = "editar";
        editar.addEventListener("click", () => abrirJanela(o));
        tr.insertCell().append(editar);
    }
    const totalPaginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));
    el("pagina").textContent = `página ${pagina + 1} de ${totalPaginas}`;
    el("anterior").disabled = pagina === 0;
    el("proxima").disabled = pagina >= totalPaginas - 1;
}

mostrar();
