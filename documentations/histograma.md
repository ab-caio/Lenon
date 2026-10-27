# Histograma e Equalização

O histograma de uma imagem digital expressa a distribuição de frequências relativas dos níveis de intensidade. A equalização redistribui essas intensidades com o objetivo de obter uma função de densidade de probabilidade uniforme, expandindo o contraste dinâmico.

---

## 1. Funções `getHistogram` e `getColorHistogram`

### Funcionamento em Blocos

* **Bloco 1: Alocação dos Contadores**
  Instancia vetores tipados `Uint32Array(256)` inicializados com zeros para registrar a contagem de ocorrências de cada intensidade discreta $k \in [0, 255]$.
* **Bloco 2: Amostragem e Contabilização**
  Itera sobre cada pixel da imagem:
  - Para `channel === 'gray'`: calcula a luminância $0.299R + 0.587G + 0.114B$ e incrementa o índice correspondente.
  - Para `getColorHistogram` ou `channel === 'all'`: incrementa simultaneamente os canais R, G, B e a intensidade média $I = (R + G + B) / 3$.

---

## 2. Função `equalizeHistogram` (Equalização em Tons de Cinza)

### Funcionamento em Blocos

* **Bloco 1: Obtenção do Histograma e Cálculo da CDF**
  Calcula o histograma de luminância da imagem. Determina o fator normalizador $\frac{L - 1}{M \times N} = \frac{255}{largura \times altura}$.
  Acumula a soma das probabilidades discretas (Função de Distribuição Acumulada - CDF) e mapeia para a tabela `lut`:
  $$s_k = T(r_k) = \text{round}\left( \frac{255}{MN} \sum_{j=0}^k n_j \right)$$
* **Bloco 2: Mapeamento dos Pixels**
  Itera sobre os pixels, substituindo a luminância original pelo valor equalizado correspondente da `lut` nos três canais R, G e B.

---

## 3. Função `equalizeHistogramHSI` (Equalização Colorida no Espaço HSI)

### Funcionamento em Blocos

* **Bloco 1: Decomposição e Conversão para HSI**
  Converte cada pixel do espaço RGB para coordenadas HSI ($H, S, I$). Armazena os valores e constrói o histograma do canal de Intensidade $I \in [0, 1]$.
* **Bloco 2: Construção da CDF Normalizada da Intensidade**
  Gera a tabela acumulada normalizada $\text{lutI}$ para o canal de intensidade ($0$ a $1$).
* **Bloco 3: Reconstrução em RGB com Matiz e Saturação Preservados**
  Aplica o novo valor equalizado apenas à componente $I$, mantendo $H$ e $S$ originais inalterados. Converte cada ponto $(H, S, I_{novo})$ de volta para RGB, impedindo artefatos de distorção de cores.

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `img` | Objeto (Jimp) | Imagem de entrada a ter seu histograma analisado ou equalizado. |
| `channel` | String | Canal alvo para extração: `'gray'`, `'r'`, `'g'`, `'b'` ou `'all'`. |
| `histogram` / `histI` | `Uint32Array(256)` | Vetor de contagem das frequências de cada intensidade discreta. |
| `totalPixels` | Inteiro | Número total de pixels contidos na imagem ($largura \times altura$). |
| `factor` | Número | Razão entre a escala máxima de saída e o total de pixels. |
| `sum` | Inteiro | Acumulador da soma de frequências na construção da CDF. |
| `lut` | `Uint8ClampedArray(256)` | Tabela de busca com o mapeamento cumulativo das intensidades equalizadas. |
| `lutI` | `Float64Array(256)` | Tabela de busca contendo intensidades equalizadas no intervalo $[0, 1]$ para HSI. |
| `hsiArray` | `Array<Object>` | Vetor intermediário contendo as tuplas HSI de cada pixel da imagem. |
