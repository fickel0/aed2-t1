// a página: carrega o CSV e faz a busca por período

const POR_PAGINA = 50;

let ocorrencias = new ArvoreBMais();
let resultado = [];
let pagina = 0;

// atalho pra pegar um elemento pelo id
function el(id) {
    return document.getElementById(id);
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

// carga

el("arquivo").addEventListener("change", async () => {
    const arquivo = el("arquivo").files[0];
    if (arquivo) carregar(await arquivo.text());
});

// linha com campo vazio, id inválido, categoria desconhecida ou id repetido fica de fora
function carregar(texto) {
    ocorrencias = new ArvoreBMais();
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
        ocorrencias.inserir(id, linha);
    }
    el("infoCarga").textContent = `${ocorrencias.tamanho} ocorrências carregadas, ${ignoradas} linhas ignoradas`;
    buscar();
}

// busca por período

el("busca").addEventListener("submit", (evento) => {
    evento.preventDefault(); // senão o formulário recarrega a página
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

// período é um intervalo de ids: do primeiro sufixo do segundo inicial até o último
// sufixo do segundo final. sem data, vai do começo ao fim.
// a B+ devolve do mais velho pro mais novo, então é só inverter
function buscar() {
    const de = el("de").value;
    const ate = el("ate").value;
    const menor = de ? criarId(paraSegundos(de), 0) : 0;
    const maior = ate ? criarId(paraSegundos(ate), 255) : Number.MAX_SAFE_INTEGER;
    resultado = ocorrencias.intervalo(menor, maior).reverse();
    el("contagem").textContent = `${resultado.length} ocorrências`;
    pagina = 0;
    mostrar();
}

// tabela e páginas

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
        for (const valor of [idParaTexto(o.id), data, o.categoria, o.tipo, o.regiao, o.endereco, situacao]) {
            tr.insertCell().textContent = valor;
        }
    }
    const totalPaginas = Math.max(1, Math.ceil(resultado.length / POR_PAGINA));
    el("pagina").textContent = `página ${pagina + 1} de ${totalPaginas}`;
    el("anterior").disabled = pagina === 0;
    el("proxima").disabled = pagina >= totalPaginas - 1;
}

mostrar();
