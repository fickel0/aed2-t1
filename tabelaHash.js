// tabela hash com encadeamento: cada balde é uma lista de pares [chave, valor].
// a chave sempre vira texto (os ids também), por causa do hash polinomial.
// precisa do hash.js carregado antes
class TabelaHash {
    constructor() {
        this.capacidade = 16;
        this.tamanho = 0;
        this.baldes = this.criarBaldes(this.capacidade);
    }

    criarBaldes(quantos) {
        const baldes = [];
        for (let i = 0; i < quantos; i++) baldes.push([]);
        return baldes;
    }

    // em qual balde a chave cai.
    // capacidade em potência de 2 funciona porque a base 31 é ímpar (o HashMap do Java faz igual)
    baldeDa(chave) {
        return this.baldes[hashPolinomial(chave) % this.capacidade];
    }

    buscar(chave) {
        chave = String(chave);
        for (const par of this.baldeDa(chave)) {
            if (par[0] === chave) return par[1];
        }
        return undefined;
    }

    // se a chave já existe, só troca o valor
    inserir(chave, valor) {
        chave = String(chave);
        const balde = this.baldeDa(chave);
        for (const par of balde) {
            if (par[0] === chave) {
                par[1] = valor;
                return;
            }
        }
        balde.push([chave, valor]);
        this.tamanho++;
        if (this.tamanho / this.capacidade > 0.75) this.aumentar();
    }

    remover(chave) {
        chave = String(chave);
        const balde = this.baldeDa(chave);
        for (let i = 0; i < balde.length; i++) {
            if (balde[i][0] === chave) {
                balde.splice(i, 1);
                this.tamanho--;
                return true;
            }
        }
        return false;
    }

    // passou de 0,75 de carga: dobra a capacidade e coloca tudo de novo (rehash)
    aumentar() {
        const antigos = this.baldes;
        this.capacidade *= 2;
        this.baldes = this.criarBaldes(this.capacidade);
        this.tamanho = 0;
        for (const balde of antigos) {
            for (const [chave, valor] of balde) this.inserir(chave, valor);
        }
    }

    chaves() {
        const chaves = [];
        for (const balde of this.baldes) {
            for (const par of balde) chaves.push(par[0]);
        }
        return chaves;
    }

    valores() {
        const valores = [];
        for (const balde of this.baldes) {
            for (const par of balde) valores.push(par[1]);
        }
        return valores;
    }
}
