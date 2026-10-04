// árvore B+, do jeito do livro do Weiss:
// - nó interno: até M filhos (M - 1 chaves). só guia a busca, não guarda ocorrência
// - folha: até L ocorrências. todas as folhas ficam no mesmo nível e cada uma aponta
//   pra vizinha da direita (prox)
//
// os nós internos ficam todos num pool, que é um ArrayBuffer só, com 64 bytes por nó.
// 64 bytes é o tamanho de uma linha de cache, então ler um nó custa uma leitura só:
//    bytes  0 a 31   chaves    4 × 8 B (Float64, guarda inteiro exato até 2^53)
//    bytes 32 a 51   filhos    5 × 4 B (Uint32, a posição do filho no pool)
//    bytes 52 a 55   quantas chaves estão em uso
//    bytes 56 a 63   sobra
// não cabem 8 chaves: cada chave a mais custa 8 B + 4 B do filho, e com 5 chaves já
// seriam 68 B. por isso M = 5.
//
// a folha pode ser bem maior (L = 64): descer um nível é um salto pra um lugar qualquer
// da memória, mas as chaves da folha ficam em sequência, e ler ou deslocar uma sequência
// é barato (o processador já vai buscando as linhas seguintes). 64 chaves × 8 B = 512 B,
// 8 linhas de cache. um L maior deixa a árvore mais baixa; acima de 64 o ganho é pequeno
//
// "ponteiro" aqui é só a posição do nó no pool. e como todas as folhas estão no mesmo
// nível (a altura), não precisa marcar se um nó é folha: no último nível interno, os
// filhos são folhas.

const M = 5;
const MAX_CHAVES = M - 1;
const MIN_CHAVES = Math.ceil(M / 2) - 1; // interno precisa de pelo menos ⌈M/2⌉ filhos
const NADA = 0xffffffff; // o "ponteiro nulo"

class Folha {
    constructor() {
        this.chaves = []; // ids, em ordem
        this.ocorrencias = []; // ocorrencias[i] é a do id chaves[i]
        this.prox = NADA;
    }
}

class ArvoreBMais {
    constructor(L = 64) {
        this.L = L;
        this.minFolha = Math.ceil(L / 2);

        // pool dos nós internos. livres guarda os nós que sobraram de uma fusão
        this.capacidade = 64;
        this.criarPool(null);
        this.usados = 0;
        this.livres = [];

        // as folhas ficam num array normal, e o "ponteiro" é a posição nele
        this.folhas = [];
        this.folhasLivres = [];

        this.raiz = this.novaFolha();
        this.altura = 0; // quantos níveis de nó interno. 0 = a raiz é uma folha
        this.tamanho = 0;
    }

    // o pool

    // cria o buffer e as duas "visões" dele: uma pra ler as chaves (8 B cada) e
    // outra pra ler filhos e quantidade (4 B cada). se tiver um buffer antigo, copia
    criarPool(antigo) {
        this.pool = new ArrayBuffer(this.capacidade * 64);
        if (antigo !== null) new Uint8Array(this.pool).set(new Uint8Array(antigo));
        this.pool64 = new Float64Array(this.pool);
        this.pool32 = new Uint32Array(this.pool);
    }

    novoInterno() {
        if (this.livres.length > 0) return this.livres.pop();
        if (this.usados === this.capacidade) {
            // lotou: dobra o pool
            this.capacidade *= 2;
            this.criarPool(this.pool);
        }
        this.usados++;
        return this.usados - 1;
    }

    novaFolha() {
        if (this.folhasLivres.length > 0) {
            const i = this.folhasLivres.pop();
            this.folhas[i] = new Folha();
            return i;
        }
        this.folhas.push(new Folha());
        return this.folhas.length - 1;
    }

    // ler e escrever um nó interno.
    // o nó n começa no byte n × 64, que é a posição n × 8 no pool64 e n × 16 no pool32

    quantas(no) {
        return this.pool32[no * 16 + 13];
    }

    chave(no, i) {
        return this.pool64[no * 8 + i];
    }

    filho(no, i) {
        return this.pool32[no * 16 + 8 + i];
    }

    // copia o nó pra arrays normais, que são mais fáceis de mexer (splice, push...)
    lerNo(no) {
        const chaves = [];
        const filhos = [];
        for (let i = 0; i < this.quantas(no); i++) chaves.push(this.chave(no, i));
        for (let i = 0; i <= this.quantas(no); i++) filhos.push(this.filho(no, i));
        return { chaves, filhos };
    }

    gravarNo(no, chaves, filhos) {
        this.pool32[no * 16 + 13] = chaves.length;
        for (let i = 0; i < chaves.length; i++) this.pool64[no * 8 + i] = chaves[i];
        for (let i = 0; i < filhos.length; i++) this.pool32[no * 16 + 8 + i] = filhos[i];
    }

    // busca

    // em qual filho o id está: no filho i ficam os ids com chaves[i - 1] <= id < chaves[i]
    qualFilho(no, id) {
        let i = 0;
        while (i < this.quantas(no) && id >= this.chave(no, i)) i++;
        return i;
    }

    // desce da raiz até a folha onde o id está (ou estaria)
    acharFolha(id) {
        let no = this.raiz;
        for (let nivel = 0; nivel < this.altura; nivel++) {
            no = this.filho(no, this.qualFilho(no, id));
        }
        return no;
    }

    buscar(id) {
        const folha = this.folhas[this.acharFolha(id)];
        const i = folha.chaves.indexOf(id);
        if (i === -1) return undefined;
        return folha.ocorrencias[i];
    }

    // intervalos: desce uma vez só e depois anda pelas folhas vizinhas

    // ocorrências com de <= id <= ate, do mais velho pro mais novo
    intervalo(de, ate) {
        const resultado = [];
        let f = this.acharFolha(de);
        while (f !== NADA) {
            const folha = this.folhas[f];
            for (let i = 0; i < folha.chaves.length; i++) {
                if (folha.chaves[i] > ate) return resultado;
                if (folha.chaves[i] >= de) resultado.push(folha.ocorrencias[i]);
            }
            f = folha.prox;
        }
        return resultado;
    }

    // inserção

    // se o id já existe, só troca a ocorrência
    inserir(id, ocorrencia) {
        const divisao = this.inserirEm(this.raiz, 0, id, ocorrencia);
        if (divisao !== null) {
            // a raiz dividiu: cria uma raiz nova em cima das duas metades
            const raiz = this.novoInterno();
            this.gravarNo(raiz, [divisao.chave], [this.raiz, divisao.no]);
            this.raiz = raiz;
            this.altura++;
        }
    }

    // insere embaixo do nó. se o nó dividir, devolve { chave, no }: a chave que sobe e
    // o nó novo da direita, pro pai encaixar. senão devolve null.
    // assim nenhum nó precisa saber quem é o pai
    inserirEm(no, nivel, id, ocorrencia) {
        if (nivel === this.altura) return this.inserirNaFolha(no, id, ocorrencia);

        const { chaves, filhos } = this.lerNo(no);
        const i = this.qualFilho(no, id);
        const divisao = this.inserirEm(filhos[i], nivel + 1, id, ocorrencia);
        if (divisao === null) return null;

        // o filho dividiu: encaixa a chave e o nó novo aqui
        chaves.splice(i, 0, divisao.chave);
        filhos.splice(i + 1, 0, divisao.no);
        if (chaves.length <= MAX_CHAVES) {
            this.gravarNo(no, chaves, filhos);
            return null;
        }

        // estourou: a chave do meio sobe e cada metade fica num nó
        const meio = Math.floor(chaves.length / 2);
        const direita = this.novoInterno();
        this.gravarNo(no, chaves.slice(0, meio), filhos.slice(0, meio + 1));
        this.gravarNo(direita, chaves.slice(meio + 1), filhos.slice(meio + 1));
        return { chave: chaves[meio], no: direita };
    }

    inserirNaFolha(f, id, ocorrencia) {
        const folha = this.folhas[f];
        let i = 0;
        while (i < folha.chaves.length && folha.chaves[i] < id) i++;
        if (folha.chaves[i] === id) {
            folha.ocorrencias[i] = ocorrencia;
            return null;
        }
        folha.chaves.splice(i, 0, id);
        folha.ocorrencias.splice(i, 0, ocorrencia);
        this.tamanho++;
        if (folha.chaves.length <= this.L) return null;

        // estourou: a metade da direita vai pra uma folha nova, que entra na lista
        // entre essa folha e a próxima
        const meio = Math.ceil(folha.chaves.length / 2);
        const d = this.novaFolha();
        const direita = this.folhas[d];
        direita.chaves = folha.chaves.splice(meio);
        direita.ocorrencias = folha.ocorrencias.splice(meio);
        direita.prox = folha.prox;
        folha.prox = d;
        // na folha, sobe só uma cópia da chave (ela continua na folha)
        return { chave: direita.chaves[0], no: d };
    }

    // remoção

    remover(id) {
        if (!this.removerEm(this.raiz, 0, id)) return false;
        this.tamanho--;
        // a raiz ficou sem chave (com um filho só): o filho vira a raiz
        if (this.altura > 0 && this.quantas(this.raiz) === 0) {
            this.livres.push(this.raiz);
            this.raiz = this.filho(this.raiz, 0);
            this.altura--;
        }
        return true;
    }

    // tira o id de baixo do nó. na volta, se o filho ficou pequeno demais, conserta
    removerEm(no, nivel, id) {
        if (nivel === this.altura) {
            const folha = this.folhas[no];
            const i = folha.chaves.indexOf(id);
            if (i === -1) return false;
            folha.chaves.splice(i, 1);
            folha.ocorrencias.splice(i, 1);
            return true;
        }

        const { chaves, filhos } = this.lerNo(no);
        const i = this.qualFilho(no, id);
        if (!this.removerEm(filhos[i], nivel + 1, id)) return false;

        if (nivel + 1 === this.altura) this.consertarFolha(chaves, filhos, i);
        else this.consertarInterno(chaves, filhos, i);
        this.gravarNo(no, chaves, filhos);
        return true;
    }

    // a folha filhos[i] ficou com menos que o mínimo. tenta, nessa ordem:
    // pegar emprestado da irmã da esquerda, da irmã da direita, ou juntar com uma delas.
    // chaves e filhos são do pai, e são alterados aqui
    consertarFolha(chaves, filhos, i) {
        const folha = this.folhas[filhos[i]];
        if (folha.chaves.length >= this.minFolha) return;
        const esq = i > 0 ? this.folhas[filhos[i - 1]] : null;
        const dir = i < filhos.length - 1 ? this.folhas[filhos[i + 1]] : null;

        if (esq !== null && esq.chaves.length > this.minFolha) {
            // a última da esquerda passa pra cá
            folha.chaves.unshift(esq.chaves.pop());
            folha.ocorrencias.unshift(esq.ocorrencias.pop());
            chaves[i - 1] = folha.chaves[0];
        } else if (dir !== null && dir.chaves.length > this.minFolha) {
            // a primeira da direita passa pra cá
            folha.chaves.push(dir.chaves.shift());
            folha.ocorrencias.push(dir.ocorrencias.shift());
            chaves[i] = dir.chaves[0];
        } else if (esq !== null) {
            // junta essa folha na da esquerda
            this.juntarFolhas(filhos[i - 1], filhos[i]);
            chaves.splice(i - 1, 1);
            filhos.splice(i, 1);
        } else {
            // junta a da direita nessa
            this.juntarFolhas(filhos[i], filhos[i + 1]);
            chaves.splice(i, 1);
            filhos.splice(i + 1, 1);
        }
    }

    // passa tudo da folha d pra folha e (vizinhas) e tira d da lista de folhas
    juntarFolhas(e, d) {
        const esq = this.folhas[e];
        const dir = this.folhas[d];
        esq.chaves.push(...dir.chaves);
        esq.ocorrencias.push(...dir.ocorrencias);
        esq.prox = dir.prox;
        this.folhas[d] = null;
        this.folhasLivres.push(d);
    }

    // a mesma ideia pro nó interno filhos[i]. a diferença é que a chave passa pelo pai:
    // no empréstimo, a chave do pai desce pro nó e a do irmão sobe pro pai;
    // na junção, a chave do pai desce pro nó juntado
    consertarInterno(chaves, filhos, i) {
        if (this.quantas(filhos[i]) >= MIN_CHAVES) return;
        const no = this.lerNo(filhos[i]);
        const esq = i > 0 ? this.lerNo(filhos[i - 1]) : null;
        const dir = i < filhos.length - 1 ? this.lerNo(filhos[i + 1]) : null;

        if (esq !== null && esq.chaves.length > MIN_CHAVES) {
            no.chaves.unshift(chaves[i - 1]);
            no.filhos.unshift(esq.filhos.pop());
            chaves[i - 1] = esq.chaves.pop();
            this.gravarNo(filhos[i - 1], esq.chaves, esq.filhos);
            this.gravarNo(filhos[i], no.chaves, no.filhos);
        } else if (dir !== null && dir.chaves.length > MIN_CHAVES) {
            no.chaves.push(chaves[i]);
            no.filhos.push(dir.filhos.shift());
            chaves[i] = dir.chaves.shift();
            this.gravarNo(filhos[i + 1], dir.chaves, dir.filhos);
            this.gravarNo(filhos[i], no.chaves, no.filhos);
        } else if (esq !== null) {
            const juntas = [...esq.chaves, chaves[i - 1], ...no.chaves];
            this.gravarNo(filhos[i - 1], juntas, [...esq.filhos, ...no.filhos]);
            this.livres.push(filhos[i]);
            chaves.splice(i - 1, 1);
            filhos.splice(i, 1);
        } else {
            const juntas = [...no.chaves, chaves[i], ...dir.chaves];
            this.gravarNo(filhos[i], juntas, [...no.filhos, ...dir.filhos]);
            this.livres.push(filhos[i + 1]);
            chaves.splice(i, 1);
            filhos.splice(i + 1, 1);
        }
    }
}
