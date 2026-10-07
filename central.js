// o sistema: as estruturas, a carga do CSV com a integridade, a busca e a edição.
// aqui não tem nada de tela, quem cuida dela é o pagina.js

// as estruturas. cada ocorrência existe uma vez só, na B+. os índices guardam
// referências pro mesmo objeto, não cópias
let ocorrencias = new ArvoreBMais(); // B+: id → ocorrência
let palavras = new TST(); // TST: palavra do endereço → conjunto (hash id → ocorrência)
let idxTipo = new TabelaHash(); // tipo → conjunto (hash id → ocorrência)
let idxRegiao = new TabelaHash(); // região → conjunto (hash id → ocorrência)
let pendentes = new TabelaHash(); // id → ocorrência, só as não atendidas

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

// as chaves de um índice que ainda têm alguma ocorrência, em ordem alfabética
function chavesUsadas(indice) {
    return indice
        .chaves()
        .filter((chave) => indice.buscar(chave).tamanho > 0)
        .sort();
}

// carga

// cada linha vira um objeto { id: ..., categoria: ..., ... } usando o cabeçalho.
// nenhum campo tem vírgula (a edição troca por espaço), então o split basta
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

// monta tudo de novo a partir do CSV, conferindo a integridade de cada linha.
// devolve o relatório:
// - incompleta: campo vazio ou valor inválido. não entra
// - alterada: o hash do CSV não bate com o recalculado (alguém mexeu fora do sistema). entra
// - duplicada: mesmo conteúdo de outra linha. com o mesmo id não entra, com outro id entra
// - conflito: mesmo id de outra linha, mas conteúdo diferente. fica a primeira
function carregarCsv(texto) {
    ocorrencias = new ArvoreBMais();
    palavras = new TST();
    idxTipo = new TabelaHash();
    idxRegiao = new TabelaHash();
    pendentes = new TabelaHash();

    const relatorio = { incompletas: [], alteradas: [], duplicadas: [], conflitos: [] };
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
            relatorio.incompletas.push(`linha ${numero} (${linha.id})`);
            continue;
        }
        linha.id = id;
        linha.atendido = Number(linha.atendido);
        const canonico = textoCanonico(linha);

        const mesmoId = ocorrencias.buscar(id);
        if (mesmoId !== undefined) {
            if (textoCanonico(mesmoId) === canonico) {
                relatorio.duplicadas.push(`linha ${numero}: cópia de ${idParaTexto(id)}`);
            } else {
                relatorio.conflitos.push(`linha ${numero}: ${idParaTexto(id)} já existe com outro conteúdo`);
            }
            continue;
        }

        const mesmoConteudo = vistos.buscar(canonico);
        if (mesmoConteudo !== undefined) {
            relatorio.duplicadas.push(`${idParaTexto(id)}: mesmo conteúdo de ${idParaTexto(mesmoConteudo)}`);
        } else {
            vistos.inserir(canonico, id);
        }

        if (linha.hash !== hashDaOcorrencia(linha)) relatorio.alteradas.push(idParaTexto(id));
        indexar(linha);
    }
    return relatorio;
}

// o CSV pra salvar: o mesmo formato do preparar_dados.py, em ordem de id
function gerarCsv() {
    const linhas = [COLUNAS.join(",")];
    for (const o of ocorrencias.intervalo(0, Number.MAX_SAFE_INTEGER)) {
        linhas.push(COLUNAS.map((coluna) => (coluna === "id" ? idParaTexto(o.id) : o[coluna])).join(","));
    }
    return linhas.join("\n") + "\n";
}

// busca

// consultar por id vai direto na B+
function consultarId(texto) {
    const id = textoParaId(texto);
    return id === null ? undefined : ocorrencias.buscar(id);
}

// as palavras da TST que começam com o prefixo e quantas ocorrências cada uma tem.
// as mais curtas vêm primeiro (são as mais perto do que foi digitado), e no empate a
// ordem alfabética da TST se mantém, porque o sort é estável
function sugestoes(prefixo) {
    const lista = [];
    palavras.paraCadaChave(prefixo, (palavra, conjunto) => {
        if (conjunto.tamanho > 0) lista.push({ palavra, quantidade: conjunto.tamanho });
    });
    return lista.sort((a, b) => a.palavra.length - b.palavra.length);
}

// a busca é feita em três etapas, como num banco de dados:
// - caminho: o primeiro campo preenchido, nesta ordem, usa a sua estrutura pra gerar as
//   candidatas. a ordem é de quem costuma devolver menos linhas
// - filtro: cada candidata é conferida contra todos os campos preenchidos
// - ordem: recentes, antigos ou prioridade
// c tem os campos da busca: endereco (lista de palavras), regiao, categoria, tipo,
// soPendentes, ordem e o período como intervalo de ids (menor e maior)
function buscarOcorrencias(c) {
    const { lista, emOrdem } = candidatas(c);
    const filtradas = lista.filter((o) => passa(o, c));
    ordenar(filtradas, emOrdem, c.ordem);
    return filtradas;
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

// cria (se o for null) ou altera uma ocorrência com os campos dados.
// alterar é tirar dos índices, mudar os campos e colocar de novo. o id não muda
function salvarOcorrencia(o, campos) {
    if (o === null) o = { id: idDeAgora() };
    else desindexar(o);
    o.categoria = campos.categoria;
    o.tipo = semVirgula(campos.tipo);
    o.regiao = semVirgula(campos.regiao);
    o.zip = semVirgula(campos.zip);
    o.endereco = semVirgula(campos.endereco).toUpperCase();
    o.atendido = campos.atendido ? 1 : 0;
    o.hash = hashDaOcorrencia(o);
    indexar(o);
    return o;
}

function removerOcorrencia(o) {
    desindexar(o);
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
