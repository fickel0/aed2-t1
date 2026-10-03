// árvore de busca ternária (TST): um dicionário de texto → valor, como a tabela hash,
// mas que também sabe achar as chaves que começam com um prefixo.
//
// cada nó tem uma letra e três filhos:
// - esq: letras menores que a do nó
// - meio: a próxima letra da chave
// - dir: letras maiores
// valor só existe no nó onde uma chave termina (nos outros fica undefined).
// não tem remoção: quem usa a árvore esvazia o valor em vez de apagar a chave
class NoTST {
    constructor(letra) {
        this.letra = letra;
        this.esq = null;
        this.meio = null;
        this.dir = null;
        this.valor = undefined;
    }
}

class TST {
    constructor() {
        this.raiz = null;
    }

    // busca

    // o nó da última letra da chave, ou null se a chave não está na árvore
    buscarNo(chave) {
        let no = this.raiz;
        let i = 0;
        while (no !== null && chave !== "") {
            const letra = chave[i];
            if (letra < no.letra) no = no.esq;
            else if (letra > no.letra) no = no.dir;
            else if (i === chave.length - 1) return no;
            else {
                no = no.meio;
                i++;
            }
        }
        return null;
    }

    // o valor da chave, ou undefined se ela não está na árvore
    buscar(chave) {
        const no = this.buscarNo(chave);
        return no === null ? undefined : no.valor;
    }

    // inserção

    // se a chave já existe, só troca o valor
    inserir(chave, valor) {
        if (chave === "") return;
        this.raiz = this.inserirEm(this.raiz, chave, 0, valor);
    }

    // desce letra por letra criando o que faltar. devolve o nó, pro pai se ligar nele
    inserirEm(no, chave, i, valor) {
        const letra = chave[i];
        if (no === null) no = new NoTST(letra);

        if (letra < no.letra) no.esq = this.inserirEm(no.esq, chave, i, valor);
        else if (letra > no.letra) no.dir = this.inserirEm(no.dir, chave, i, valor);
        else if (i < chave.length - 1) no.meio = this.inserirEm(no.meio, chave, i + 1, valor);
        else no.valor = valor;
        return no;
    }

    // prefixo

    // chama fazer(chave, valor) pra cada chave que começa com o prefixo, em ordem alfabética
    paraCadaChave(prefixo, fazer) {
        const no = this.buscarNo(prefixo);
        if (no === null) return;
        if (no.valor !== undefined) fazer(prefixo, no.valor);
        this.emOrdem(no.meio, prefixo, fazer);
    }

    // percurso em ordem: esq, o próprio nó, meio, dir. é isso que deixa em ordem alfabética
    emOrdem(no, antes, fazer) {
        if (no === null) return;
        this.emOrdem(no.esq, antes, fazer);
        const chave = antes + no.letra;
        if (no.valor !== undefined) fazer(chave, no.valor);
        this.emOrdem(no.meio, chave, fazer);
        this.emOrdem(no.dir, antes, fazer);
    }
}
