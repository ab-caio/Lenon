# Convolução Espacial Genérica e Filtros Espaciais

A filtragem no domínio espacial opera sobre uma vizinhança pré-definida de pixels ao redor de cada ponto da imagem através de máscaras ou janelas deslizantes (kernels).

---

## 1. Função `convolve2D` (Convolução Espacial Genérica)

### Funcionamento em Blocos

* **Bloco 1: Validação do Kernel e Parâmetros**
  Valida se a matriz `kernel` é estritamente quadrada e possui dimensão ímpar ($3\times3, 5\times5, \dots$). Determina o raio $half = \lfloor kSize / 2 \rfloor$.
  Calcula o `divisor`: se omitido, calcula a soma de todos os coeficientes da máscara (se a soma for zero, define 1 para evitar divisão por zero).
* **Bloco 2: Clonagem da Imagem e Alocação de Buffers**
  Cria uma cópia independente da imagem original (`cloneImage`) para armazenar o resultado sem contaminar leituras subsequentes da vizinhança.
  Se `options.normalize` estiver ativo, aloca um buffer auxiliar `Float32Array` para reter valores brutos (incluindo números negativos e decimais) e inicializa `minVal` e `maxVal`.
* **Bloco 3: Varredura Espacial e Tratamento de Bordas**
  Percorre cada pixel $(x, y)$ da imagem. Para cada elemento da máscara $(ky, kx)$, calcula a coordenada vizinha com proteção por replicação de borda (*clamp-to-edge*):
  $$px = \text{clamp}(x + kx - half, 0, width - 1)$$
  $$py = \text{clamp}(y + ky - half, 0, height - 1)$$
  Acumula o somatório ponderado $\sum (pixel \times peso)$ independentemente para os canais R, G e B.
* **Bloco 4: Escalonamento e Normalização Min-Max**
  Divide cada soma pelo divisor e adiciona o deslocamento `offset`.
  - Se `normalize === false`: satura com `clamp` entre $[0, 255]$ e grava no buffer de saída.
  - Se `normalize === true`: rastreia o menor (`minVal`) e o maior (`maxVal`) valor gerados em toda a imagem. Em uma segunda passagem, reescala linearmente para o intervalo visível $[0, 255]$:
    $$s = \text{round}\left( \frac{v - minVal}{maxVal - minVal} \times 255 \right)$$

---

## 2. Funções `boxBlur` e `gaussianBlur` (Filtros de Suavização)

### Funcionamento em Blocos

* **Bloco 1: Geração da Máscara**
  - **`boxBlur`**: Gera matriz $size \times size$ preenchida uniformemente com o valor $1$. O divisor é definido automaticamente como $size^2$.
  - **`gaussianBlur`**: Gera matriz analítica 2D a partir da função contínua de Gauss:
    $$G(x, y) = \exp\left( -\frac{(x - half)^2 + (y - half)^2}{2\sigma^2} \right)$$
* **Bloco 2: Aplicação via Convolução**
  Executa a função `convolve2D`, atenuando componentes de alta frequência e ruídos aditivos.

---

## 3. Função `medianFilter` (Filtragem pela Mediana)

### Funcionamento em Blocos

* **Bloco 1: Coleta da Vizinhança Espacial**
  Para cada pixel $(x, y)$, coleta os $size \times size$ vizinhos de cada canal em vetores tipados `Uint8Array`. Trata as margens por replicação de borda (*clamp-to-edge*).
* **Bloco 2: Ordenação e Seleção do Valor Central**
  Ordena os vetores de cada canal em ordem não decrescente e atribui o elemento central (índice $\lfloor (size^2) / 2 \rfloor$) ao pixel de saída. Remove eficientemente ruídos impulsivos (*sal e pimenta*) sem borrar bordas nítidas.

---

## 4. Função `laplacianFilter` (Filtro Laplaciano)

### Funcionamento em Blocos

* **Bloco 1: Seleção da Máscara Derivativa**
  - Variante de 4 vizinhos: $[[0, 1, 0], [1, -4, 1], [0, 1, 0]]$
  - Variante de 8 vizinhos: $[[1, 1, 1], [1, -8, 1], [1, 1, 1]]$
* **Bloco 2: Modo de Resposta Pura vs. Aguçamento**
  - Se `sharpen === false`: calcula a derivada de segunda ordem pura com normalização min-max para exibição em tons de cinza.
  - Se `sharpen === true`: subtrai a resposta do Laplaciano da imagem original ($g = f - \nabla^2 f$), gerando realce e aguçamento de transições e detalhes finos.

---

## 5. Função `highBoostFilter` (Filtragem High-Boost)

### Funcionamento em Blocos

* **Bloco 1: Obtenção do Sinal Suavizado**
  Gera a versão borrada $f_{smooth}$ da imagem através do filtro da média.
* **Bloco 2: Ponderação e Realce das Altas Frequências**
  Aplica a formulação de Gonzalez & Woods para cada canal de cada pixel:
  $$f_{hb}(x, y) = \text{clamp}(A \cdot f(x, y) - f_{smooth}(x, y))$$
  Quando o fator de amplificação $A = 1$, opera como máscara de desfoque unsharp (*unsharp masking*); para $A > 1$, parte da imagem base é preservada com contraste ampliado.

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `kernel` | `Array<Array<Number>>` | Matriz bidimensional de pesos da máscara de convolução. |
| `kSize` | Inteiro | Comprimento do lado da máscara quadrada ímpar. |
| `half` | Inteiro | Raio do kernel a partir do elemento central ($\lfloor kSize / 2 \rfloor$). |
| `divisor` | Número | Fator de divisão normalizador da soma de convolução. |
| `offset` | Número | Valor constante somado ao resultado da convolução. |
| `normalize` | Booleano | Flag indicando se a normalização Min-Max deve ser ativada. |
| `tempBuffer` | `Float32Array` | Buffer auxiliar para armazenamento de valores reais intermediários antes de normalizar. |
| `minVal` / `maxVal` | Número | Menor e maior valor numérico calculados em toda a imagem para reescalonamento. |
| `sigma` | Número | Desvio padrão da distribuição Gaussiana para controle da abertura do filtro. |
| `A` | Número | Fator de amplificação da imagem base no filtro High-Boost ($A \ge 1$). |
| `midIndex` | Inteiro | Posição central do vetor de vizinhos ordenados na filtragem por mediana. |
