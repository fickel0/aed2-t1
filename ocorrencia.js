// o id e o hash de integridade de uma ocorrência.
// o preparar_dados.py faz as mesmas contas em python: se mudar aqui, muda lá também

const COLUNAS = ["id", "categoria", "tipo", "zip", "regiao", "endereco", "atendido", "hash"];
const CATEGORIAS = ["EMS", "Fire", "Traffic"];

// o id é o momento do chamado: segundos desde 1970 (UTC) × 256 + sufixo.
// o sufixo (0 a 255) separa chamados que caem no mesmo segundo.
// ordenar por id é o mesmo que ordenar por data.
// nada de << e >> aqui: em JS eles cortam em 32 bits e estragam o id

function criarId(segundos, sufixo) {
    return segundos * 256 + sufixo;
}

function segundosDoId(id) {
    return Math.floor(id / 256);
}

function sufixoDoId(id) {
    return id % 256;
}

// na tela e no CSV: os segundos em base 36 e, se o sufixo não for 0, "-sufixo".
// ex.: QE8MR7, QE8MR7-1
function idParaTexto(id) {
    const texto = segundosDoId(id).toString(36).toUpperCase();
    const sufixo = sufixoDoId(id);
    if (sufixo === 0) return texto;
    return texto + "-" + sufixo;
}

// o caminho contrário. devolve null se o texto não for um id válido.
// a regex é necessária porque o parseInt ignora lixo no fim: "QE8MR7!" viraria QE8MR7
function textoParaId(texto) {
    const partes = /^([0-9A-Z]+)(-(\d{1,3}))?$/.exec(texto.trim().toUpperCase());
    if (partes === null) return null;
    const segundos = parseInt(partes[1], 36);
    const sufixo = partes[3] ? Number(partes[3]) : 0;
    if (sufixo > 255) return null;
    if (segundos * 256 > Number.MAX_SAFE_INTEGER) return null; // grande demais, o Number perde precisão
    return criarId(segundos, sufixo);
}

// "AAAA-MM-DD HH:MM:SS", em UTC
function dataHoraDoId(id) {
    const data = new Date(segundosDoId(id) * 1000);
    return data.toISOString().slice(0, 19).replace("T", " ");
}

// o hash de integridade

// a ocorrência vira um texto só, e o hash é calculado em cima dele.
// o sufixo do id fica de fora: assim duas ocorrências iguais no mesmo segundo dão o
// mesmo hash, e a carga do CSV pega como duplicata
function textoCanonico(o) {
    return [o.categoria, o.tipo, dataHoraDoId(o.id), o.zip, o.regiao, o.endereco, o.atendido].join("|");
}

// SHA-256 do texto, em hexadecimal (64 dígitos), que é como vai pro CSV.
// não dá pra usar o hash polinomial da tabela: ele é linear, então dá pra trocar letras e
// manter o mesmo número ("RT309" e "RSR09" dão igual). o SHA-256 vem pronto do navegador
// (crypto.subtle), e por isso a função é async
async function hashDaOcorrencia(o) {
    const bytes = new TextEncoder().encode(textoCanonico(o));
    const resumo = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    return Array.from(resumo, (b) => b.toString(16).padStart(2, "0")).join("");
}
