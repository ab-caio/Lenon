# Filtragem no Domínio da Frequência (TDF / FFT 2D)

A Transformada de Fourier decompõe uma imagem espacial em suas componentes senoidais e cossenoidais de frequência. A filtragem no domínio da frequência consiste em modificar o espectro complexo e reconstruir a imagem no domínio espacial pela transformada inversa.

---

## 1. Função `fft2D` (Transformada Rápida de Fourier 2D)

### Funcionamento em Blocos

* **Bloco 1: Ajuste de Dimensões e Centralização do Espectro**
  Expande a largura e altura da imagem para a próxima potência de 2 ($M = 2^{\lceil \log_2 W \rceil}, N = 2^{\lceil \log_2 H \rceil}$) por meio de preenchimento com zeros (*zero-padding*).
  Converte a imagem para luminância e multiplica cada pixel espacial por $(-1)^{x + y}$, propriedade clássica que translada a frequência zero (DC) para o centro geométrico $(M/2, N/2)$ do espectro.
* **Bloco 2: Transformada 1D Separável nas Linhas**
  Aplica a FFT 1D de Cooley-Tukey Radix-2 com reversão de bits (*bit-reversal permutation*) em cada linha horizontal da imagem.
* **Bloco 3: Transformada 1D Separável nas Colunas**
  Aplica a FFT 1D de Cooley-Tukey sobre as colunas complexas resultantes da etapa anterior. Retorna a estrutura com partes reais e imaginárias `Float64Array`.

---

## 2. Função `getFourierSpectrum` (Exibição do Espectro de Fourier)

### Funcionamento em Blocos

* **Bloco 1: Cálculo da Magnitude Complexa**
  Para cada coeficiente de frequência $(u, v)$, calcula o módulo do vetor complexo:
  $$|F(u, v)| = \sqrt{R(u, v)^2 + I(u, v)^2}$$
* **Bloco 2: Compressão de Faixa Dinâmica em Escala Logarítmica**
  Como a componente DC central concentra uma magnitude ordens de grandeza superior às altas frequências, aplica a transformação logarítmica para visualização:
  $$D(u, v) = \ln(1 + |F(u, v)|)$$
* **Bloco 3: Normalização Min-Max**
  Projeta a matriz logarítmica no intervalo $[0, 255]$, gerando uma imagem Jimp em escala de cinza que exibe o mapa espectral de frequências com a origem no centro.

---

## 3. Função `applyFourierMask` (Edição e Filtragem no Espectro)

### Funcionamento em Blocos

* **Bloco 1: Atenuação ou Bloqueio de Frequências**
  Recebe uma máscara de ponderação $H(u, v)$ (definida por função analítica, array ou imagem desenhada).
  Multiplica os coeficientes complexos correspondentes:
  $$R'(u, v) = R(u, v) \cdot H(u, v), \quad I'(u, v) = I(u, v) \cdot H(u, v)$$
  Permite implementar filtros passa-baixas (suavização), passa-altas (realce de bordas), rejeita-faixa e edições interativas via pincel.

---

## 4. Função `ifft2D` (Transformada Rápida de Fourier Inversa 2D)

### Funcionamento em Blocos

* **Bloco 1: IFFT 1D Separável nas Colunas e Linhas**
  Aplica a transformada inversa 1D (com conjugado de fase $+\frac{2\pi}{len}$ e divisão pelo tamanho do vetor) sucessivamente nas colunas e depois nas linhas.
* **Bloco 2: Descentralização e Restauração Espacial**
  Multiplica a parte real por $(-1)^{x + y}$ para desfazer o deslocamento espectral inicial.
  Descarta as regiões preenchidas pelo *zero-padding*, recortando a matriz para as dimensões originais da imagem $(W_{orig}, H_{orig})$ e saturando os valores em $[0, 255]$.

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `real` | `Float64Array` | Vetor linearizado com a componente real dos coeficientes espectrais. |
| `imag` | `Float64Array` | Vetor linearizado com a componente imaginária dos coeficientes espectrais. |
| `M` / `N` | Inteiro | Dimensões da grade de Fourier expandidas para potências de 2. |
| `origWidth` / `origHeight` | Inteiro | Resolução original da imagem antes do preenchimento por potência de 2. |
| `mag` | Número | Magnitude da frequência $|F(u, v)| = \sqrt{R^2 + I^2}$. |
| `logMag` | `Float64Array` | Magnitude comprimida em escala logarítmica. |
| `mask` | Função / Array / Imagem | Máscara de transferência de frequências $H(u, v)$ aplicada ao espectro. |
| `sign` | Inteiro ($\pm 1$) | Fator de modulação espacial $(-1)^{x + y}$ para centralização e descentralização. |
