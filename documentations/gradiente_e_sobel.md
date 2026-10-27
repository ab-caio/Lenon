# Filtros de Gradiente e Operadores de Sobel

O vetor gradiente $\nabla f = \begin{bmatrix} G_x \\ G_y \end{bmatrix}$ de uma imagem aponta na direção de máxima taxa de variação de intensidade, sendo a base matemática fundamental para a detecção de bordas espaciais.

---

## 1. Funções `sobelX` e `sobelY` (Gradientes Direcionais)

### Funcionamento em Blocos

* **Bloco 1: Definição dos Kernels de Diferenças Finitas**
  - **Sobel Horizontal ($G_x$):** Detecta descontinuidades no sentido horizontal (bordas verticais):
    $$S_x = \begin{bmatrix} -1 & 0 & 1 \\ -2 & 0 & 2 \\ -1 & 0 & 1 \end{bmatrix}$$
  - **Sobel Vertical ($G_y$):** Detecta descontinuidades no sentido vertical (bordas horizontais):
    $$S_y = \begin{bmatrix} -1 & -2 & -1 \\ 0 & 0 & 0 \\ 1 & 2 & 1 \end{bmatrix}$$
* **Bloco 2: Convolução e Normalização para Visualização**
  Executa `convolve2D` com `divisor = 1` e `normalize = true`. Mapeia derivadas negativas e positivas para a escala $[0, 255]$, onde o nível $128$ indica áreas de intensidade constante e desvios para $0$ ou $255$ indicam bordas com transições opostas.

---

## 2. Função `sobelMagnitude` (Magnitude do Gradiente)

### Funcionamento em Blocos

* **Bloco 1: Cálculo Simultâneo dos Componentes Ortogonais**
  Em uma única passagem sobre a imagem, calcula as componentes $G_x$ e $G_y$ em cada pixel $(x, y)$ para os três canais de cor, utilizando replicação de borda nas extremidades.
* **Bloco 2: Composição Não-Linear da Magnitude**
  Calcula a magnitude vetorial euclidiana:
  $$M(x, y) = \sqrt{G_x(x, y)^2 + G_y(x, y)^2}$$
* **Bloco 3: Normalização Dinâmica**
  Armazena a magnitude de cada canal em um buffer temporário `Float32Array`. Localiza o valor máximo e mínimo em toda a imagem e projeta a resposta para $[0, 255]$, destacando com alta clareza o mapa completo de contornos da imagem.

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `img` | Objeto (Jimp) | Imagem de entrada a ser filtrada pelo operador de Sobel. |
| `kx` / `ky` | `Array<Array<Number>>` | Matrizes $3 \times 3$ dos operadores diferenciais de Sobel nos eixos X e Y. |
| `gxR`, `gxG`, `gxB` | Número | Componentes da derivada parcial no eixo horizontal para cada canal de cor. |
| `gyR`, `gyG`, `gyB` | Número | Componentes da derivada parcial no eixo vertical para cada canal de cor. |
| `magR`, `magG`, `magB` | Número | Módulo (magnitude euclidiana) do vetor gradiente para cada canal. |
| `tempBuffer` | `Float32Array` | Vetor de armazenamento das magnitudes reais antes da normalização linear. |
| `minVal` / `maxVal` | Número | Limites inferior e superior das magnitudes obtidas para reescalonamento $[0, 255]$. |
