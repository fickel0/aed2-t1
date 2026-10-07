// a tela: liga os formulários, as janelas e a tabela ao central.js

const POR_PAGINA = 50;

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

// carga

// tudo fica só na memória: um F5 apaga os dados e a escolha do arquivo
el("arquivo").addEventListener("change", async () => {
    const arquivo = el("arquivo").files[0];
    if (arquivo) carregar(await arquivo.text());
});

function carregar(texto) {
    const relatorio = carregarCsv(texto);
    el("infoCarga").textContent = `${ocorrencias.tamanho} ocorrências carregadas`;
    el("textoRelatorio").textContent = [
        `${ocorrencias.tamanho} ocorrências carregadas.`,
        parteDoRelatorio("Incompletas ou inválidas (não carregadas)", relatorio.incompletas),
        parteDoRelatorio("Alteradas fora do sistema (o hash não bate)", relatorio.alteradas),
        parteDoRelatorio("Duplicadas", relatorio.duplicadas),
        parteDoRelatorio("Conflitos de versão (ficou a primeira)", relatorio.conflitos),
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
    for (const regiao of chavesUsadas(idxRegiao)) {
        el("regiao").append(novaOpcao(regiao, regiao));
        el("regioesConhecidas").append(novaOpcao(regiao, regiao));
    }

    el("tipo").replaceChildren(novaOpcao("todos", ""));
    for (const tipo of chavesUsadas(idxTipo)) el("tipo").append(novaOpcao(tipo, tipo));

    // na janela de edição, a sugestão de tipo são os da tabela de prioridades
    el("tiposConhecidos").replaceChildren();
    for (const tipo of prioridades.chaves().sort()) el("tiposConhecidos").append(novaOpcao(tipo, tipo));

    el("regiao").value = regiaoEscolhida;
    el("tipo").value = tipoEscolhido;
}

// salvar CSV: baixa o arquivo
el("salvarCsv").addEventListener("click", () => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([gerarCsv()], { type: "text/csv" }));
    link.download = "dados.csv";
    link.click();
});

// busca

// a cada letra digitada, sugere as palavras que começam com a última palavra do campo.
// as palavras de antes ficam como estão
el("endereco").addEventListener("input", () => {
    el("sugestoes").replaceChildren();
    const texto = el("endereco").value.toUpperCase();
    const antes = texto.slice(0, texto.lastIndexOf(" ") + 1);
    const ultima = texto.slice(antes.length);
    if (ultima === "") return;
    for (const s of sugestoes(ultima).slice(0, 20)) {
        el("sugestoes").append(novaOpcao(`${s.palavra} (${s.quantidade})`, antes + s.palavra));
    }
});

// o id não combina com os filtros, então eles são limpos (e, no contrário, buscar pelos
// filtros apaga o id)
el("consulta").addEventListener("submit", (evento) => {
    evento.preventDefault(); // senão o formulário recarrega a página
    el("endereco").value = "";
    el("regiao").value = "";
    el("categoria").value = "";
    el("tipo").value = "";
    el("de").value = "";
    el("ate").value = "";
    el("soPendentes").checked = false;
    const o = consultarId(el("id").value);
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

function buscar() {
    el("id").value = "";
    const de = el("de").value;
    const ate = el("ate").value;
    const lista = buscarOcorrencias({
        endereco: palavrasDe(el("endereco").value),
        regiao: el("regiao").value,
        categoria: el("categoria").value,
        tipo: el("tipo").value,
        soPendentes: el("soPendentes").checked,
        ordem: el("busca").ordem.value, // recentes, antigos ou prioridade
        // o período vira um intervalo de ids: do primeiro sufixo do segundo inicial até
        // o último sufixo do segundo final. sem data, vai do começo ao fim
        menor: de ? criarId(paraSegundos(de), 0) : 0,
        maior: ate ? criarId(paraSegundos(ate), 255) : Number.MAX_SAFE_INTEGER,
    });
    mostrarResultado(lista);
}

// janela de cadastro e edição

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
    const f = el("editor");
    if (acao === "salvar") {
        salvarOcorrencia(editando, {
            categoria: f.categoria.value,
            tipo: f.tipo.value,
            regiao: f.regiao.value,
            zip: f.zip.value,
            endereco: f.endereco.value,
            atendido: f.atendido.checked,
        });
    } else if (acao === "remover") {
        removerOcorrencia(editando);
    } else {
        return;
    }
    preencherListas();
    // refaz o que estava na tela: a consulta por id, se tinha uma, ou a busca pelos filtros
    if (el("id").value !== "") el("consulta").requestSubmit();
    else buscar();
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
