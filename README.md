# Central de Emergências: Operação Resgate

Sistema web CRUD de ocorrências de emergência (chamadas do 911). As três estruturas centrais (árvore B+, Trie e tabela hash) foram feitas do zero em JavaScript.

Repositório: https://github.com/fickel0/aed2-t1

## Como executar

1. Abra o `index.html` no navegador.
2. Em **Carregar CSV**, escolha o `dados.csv`.

O botão **Salvar CSV** baixa o estado atual.

Para gerar o `dados.csv` de novo (opcional): `python preparar_dados.py 911.csv dados.csv`.

## Dados

**Fonte:** [911 Calls, Montgomery County (Kaggle)](https://www.kaggle.com/datasets/mchirico/montcoalert).

São usadas as 10.000 chamadas válidas mais recentes.

**Campos usados:**

| Original | No sistema |
|---|---|
| `title` (`Traffic: VEHICLE ACCIDENT -`) | `categoria` (`Traffic`) e `tipo` (`Vehicle accident`) |
| `twp` | `regiao` |
| `addr` | `endereco` |
| `zip` | `zip` |
| `timeStamp` | dentro do `id` |

Ficaram de fora `lat`, `lng`, `e` e `desc` (que só repete endereço e região).

**Campos derivados ou acrescentados:**

- **`id`:** segundos desde 1970 × 256 + um sufixo para chamadas no mesmo segundo. Na tela, ele aparece em base 36: `TMI7LR`, `TMI7LR-1`. Ordenar por id é ordenar por data.
- **`atendido`:** sorteado com semente fixa. Só as chamadas das últimas 48 h podem estar pendentes, com chance e^(−idade/12), o que dá 153 pendentes.
- **`hash`:** o hash de integridade de cada linha.
- **Nível de prioridade (1 a 5):** sai do tipo, por uma tabela própria (`prioridades.js`) que cobre os 64 tipos da base. Ex.: Cardiac arrest = 5, Fall victim = 3, Disabled vehicle = 1.

**Adaptações:**

As datas foram deslocadas para o último chamado cair no momento em que o script rodou.

Tipo e região perderam as maiúsculas do original. O endereço continua em maiúsculas.

## Estruturas

| Estrutura | Arquivo | Onde é usada |
|---|---|---|
| Árvore B+ | `arvoreBMais.js` | `ocorrencias` (id → ocorrência): consulta por id, período, listagem em ordem de data, Salvar CSV |
| Trie (TST) | `tst.js` | `palavras` (palavra do endereço → ocorrências): busca por prefixo e sugestões |
| Tabela hash | `tabelaHash.js` | índices de tipo e região, pendentes, prioridades, integridade e todo conjunto de ocorrências |

### Árvore B+

Guarda todas as ocorrências, ordenadas pelo id. Como o id é a data, um período vira um intervalo de ids: a árvore desce até o início uma vez e anda pelas folhas encadeadas.

- **M = 5:** cada nó interno ocupa 64 bytes, uma linha de cache, num pool (`ArrayBuffer`): 4 chaves × 8 B + 5 filhos × 4 B + a contagem. Descer um nível é ler uma linha só.
- **L = 64:** descer um nível é um salto para qualquer lugar da memória, enquanto as chaves de uma folha ficam em sequência, e ler ou deslocar uma sequência é barato (o processador já busca as linhas seguintes). Por isso a folha pode ser bem maior que o nó interno: 64 × 8 B = 512 B, 8 linhas de cache.

### Trie (árvore de busca ternária, TST)

Cada palavra do endereço aponta para as ocorrências que a contêm. `W MAIN ST & N YORK RD` entra por `MAIN` e por `YORK`. Tipos de via e direções (`ST`, `RD`, `W`, `N`…) ficam de fora, porque quase todo endereço tem um deles.

Escolhemos a TST pela simplicidade. É mais eficiente que a R-way e na Patricia um prefixo pode terminar no meio de um nó.

### Tabela hash

Hash polinomial base 31 (método de Horner, módulo 2^32), com encadeamento. A capacidade dobra quando a carga passa de 0,75. O código não usa `Set` nem `Map` do JavaScript, usa somente nossa tabela.

## Como funciona

- **Gerenciamento:** carregar, cadastrar, editar, remover e salvar o CSV.
- **Consulta:** por id (B+), por endereço com prefixo (Trie), por região e por tipo (hash), por categoria, só pendentes e por período (B+). A busca roda em três etapas:
  1. **caminho:** uma estrutura gera as candidatas. Com endereço, é a Trie. Senão, entre os conjuntos dos campos preenchidos (região, tipo, pendentes), o menor, já que cada um sabe o próprio tamanho. Sem nenhum deles, o período na B+;
  2. **filtro:** cada candidata é conferida contra todos os campos;
  3. **ordem:** recentes, antigos ou prioridade.
- **Prioridade:** do nível 5 ao 1 e, no empate, a mais antiga primeiro. A tela abre em "só pendentes, por prioridade", que é a fila de atendimento.
- **Integridade:** cada ocorrência vira um texto, `categoria|tipo|data_hora|zip|regiao|endereco|atendido`, e o SHA-256 dele vai na coluna `hash`. O SHA-256 vem pronto (`crypto.subtle` no navegador, `hashlib` no Python).
  - **incompleta:** campo vazio ou inválido.
  - **alterada:** o hash do arquivo não bate com o recalculado, ou seja, alguém mexeu fora do sistema.
  - **duplicada:** mesmo conteúdo de outra linha, com o mesmo id ou com outro.
  - **conflito de versão:** mesmo id, mas com conteúdo diferente; fica a primeira.

  Com o `dados.csv`: 4 incompletas, 0 alteradas, 5 duplicadas (pares idênticos no mesmo segundo) e 0 conflitos.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `tabelaHash.js`, `tst.js`, `arvoreBMais.js` | as estruturas |
| `ocorrencia.js` | id e hash de integridade |
| `prioridades.js` | tabela tipo → nível |
| `central.js` | o sistema: índices, carga, integridade, busca e edição (sem nada de tela) |
| `pagina.js`, `index.html` | a tela |
| `preparar_dados.py`, `dados.csv` | o script dos dados e o CSV gerado |
