# Transformações de Intensidade no Domínio Espacial

As transformações de intensidade operam diretamente sobre o valor numérico de cada pixel individualmente (operações pontuais), mapeando a intensidade de entrada $r$ para uma intensidade de saída $s = T(r)$ no intervalo $[0, 255]$, sem considerar a vizinhança espacial.

---

## 1. Função `inversion` (Negativo da Imagem)

### Funcionamento em Blocos

* **Bloco 1: Pré-cálculo da Tabela de Busca (LUT)**
  Gera uma tabela `lut` de 256 elementos onde cada entrada $i$ armazena o complemento $255 - i$. Essa abordagem reduz a complexidade de cálculo em tempo de execução para $O(1)$ por pixel.
* **Bloco 2: Mapeamento dos Pixels**
  Itera sobre os canais R, G e B do buffer da imagem, substituindo a intensidade atual pelo valor pré-calculado na `lut`. O canal de transparência (Alpha) é preservado inalterado.

---

## 2. Função `threshold` (Limiarização)

### Funcionamento em Blocos

* **Bloco 1: Geração da LUT de Binarização**
  Cria uma tabela binária na qual intensidades estritamente menores que `limit` recebem 0 e intensidades maiores ou iguais recebem 255.
* **Bloco 2: Conversão em Escala de Cinza e Binarização**
  Para cada pixel, calcula a luminância perceptual ponderada segundo a norma ITU-R BT.601 ($Y = 0.299R + 0.587G + 0.114B$). O valor de $Y$ é consultado na `lut` e atribuído simultaneamente aos canais R, G e B.

---

## 3. Função `brightness` (Ajuste de Brilho)

### Funcionamento em Blocos

* **Bloco 1: Validação e Construção da LUT**
  Se o deslocamento `value` for zero, a imagem é retornada imediatamente. Caso contrário, preenche a `lut` com a soma $i + \text{value}$, saturando os valores no intervalo $[0, 255]$ através da função `clamp`.
* **Bloco 2: Aplicação Pontual nos Canais**
  Aplica a `lut` diretamente sobre os três canais de cor (R, G, B) de cada pixel.

---

## 4. Função `gammaCorrection` (Correção de Gama / Potência)

### Funcionamento em Blocos

* **Bloco 1: Validação Matemática**
  Garante que o expoente $\gamma > 0$. Para o caso trivial $\gamma = 1$ e $c = 1$, retorna a imagem sem modificações.
* **Bloco 2: Mapeamento Não-Linear por LUT**
  Normaliza a intensidade $i \in [0, 255]$ para o intervalo $[0, 1]$, eleva à potência $\gamma$, multiplica pela constante $c$ e reescala para $[0, 255]$:
  $$s = \text{clamp}(c \cdot (r / 255)^\gamma \cdot 255)$$
* **Bloco 3: Aplicação nos Pixels**
  Aplica a transformação exponencial via `lut` em todos os canais R, G e B.

---

## 5. Função `pieceWise` (Transformação Linear por Partes)

### Funcionamento em Blocos

* **Bloco 1: Validação dos Pontos Âncora**
  Verifica se os vetores `rPoints` e `sPoints` possuem o mesmo comprimento e contêm pelo menos 2 pontos.
* **Bloco 2: Interpolação Linear Segmentada (LUT)**
  Para cada intensidade $i \in [0, 255]$, localiza o intervalo $[r_j, r_{j+1}]$ correspondente e calcula a interpolação linear:
  $$s = s_j + \frac{s_{j+1} - s_j}{r_{j+1} - r_j} \cdot (i - r_j)$$
  Valores fora dos extremos assumem os limites $s_0$ ou $s_k$.
* **Bloco 3: Aplicação nos Pixels**
  Mapeia cada canal de cor com a curva calculada na `lut`.

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `img` | Objeto (Jimp) | Instância da imagem de entrada contendo largura, altura e buffer de dados. |
| `lut` | `Uint8ClampedArray(256)` | Tabela de busca de 256 bytes para mapeamento $O(1)$ de intensidades. |
| `data` | `Uint8ClampedArray` | Buffer unidimensional contínuo de bytes RGBA da imagem. |
| `limit` | Número | Valor escalar de corte para binarização na limiarização. |
| `value` | Inteiro | Valor escalar somado à intensidade para ajuste de brilho. |
| `gamma` | Número | Expoente estritamente positivo da curva de potência. |
| `constant` | Número | Fator de ganho multiplicativo $c$ na correção de gama. |
| `rPoints` | `Array<Number>` | Coordenadas no domínio de entrada dos pontos âncora. |
| `sPoints` | `Array<Number>` | Coordenadas no domínio de saída dos pontos âncora correspondentes. |
| `luminance` | Número | Intensidade de cinza ponderada ($0.299R + 0.587G + 0.114B$). |
| `slope` | Número | Coeficiente angular da reta no segmento $[r_j, r_{j+1}]$. |
