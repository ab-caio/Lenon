# Processamento de Imagens Coloridas

O processamento de imagens coloridas aborda a manipulação nos espaços de cores primárias aditivas (RGB) e perceptuais (HSI - Matiz, Saturação e Intensidade), além de operações multicanais como croma-chave, ajustes de tonalidade e sépia.

---

## 1. Funções `rgbToHsi` e `hsiToRgb` (Conversão entre Modelos de Cores)

### Funcionamento em Blocos

* **Bloco 1: Normalização e Cálculo da Intensidade e Saturação ($RGB \to HSI$)**
  Normaliza as componentes $r, g, b \in [0, 1]$.
  - Intensidade: $I = \frac{r + g + b}{3}$.
  - Saturação: $S = 1 - \frac{3}{r + g + b} \min(r, g, b)$ (com $S = 0$ caso $r + g + b = 0$).
* **Bloco 2: Determinação Angular do Matiz ($H$)**
  Calcula o ângulo $\theta$ através da formulação canônica de Gonzalez & Woods:
  $$\theta = \arccos\left( \frac{\frac{1}{2}[(r - g) + (r - b)]}{\sqrt{(r - g)^2 + (r - b)(g - b)}} \right)$$
  Se $b \le g \implies H = \theta$; se $b > g \implies H = 360^\circ - \theta$.
* **Bloco 3: Mapeamento Inverso por Setores ($HSI \to RGB$)**
  Segmenta o ângulo $H$ em três setores circulares de $120^\circ$:
  - Setor RG ($0^\circ \le H < 120^\circ$): calcula $B$, $R$ e $G$.
  - Setor GB ($120^\circ \le H < 240^\circ$): calcula $R$, $G$ e $B$ com $H' = H - 120^\circ$.
  - Setor BR ($240^\circ \le H < 360^\circ$): calcula $G$, $B$ e $R$ com $H' = H - 240^\circ$.
  Reconverte as componentes para inteiros em $[0, 255]$.

---

## 2. Função `convertToGrayscale` (Conversão para Escala de Cinza)

### Funcionamento em Blocos

* **Bloco 1: Ponderação Aritmética ou Perceptual**
  - `'average'`: Média aritmética simples das intensidades: $\frac{R + G + B}{3}$.
  - `'luminance'`: Média ponderada pela sensibilidade do sistema visual humano (ITU-R BT.601): $0.299R + 0.587G + 0.114B$.
* **Bloco 2: Atribuição Homogênea**
  Atribui o mesmo valor monocromático resultante simultaneamente aos três canais R, G e B de cada pixel.

---

## 3. Função `colorInversion` (Negativo Colorido)

### Funcionamento em Blocos

* **Bloco 1: Complementar de Cores por Canal**
  Substitui cada canal primário pelo seu respectivo complementar: $R' = 255 - R$, $G' = 255 - G$, $B' = 255 - B$.

---

## 4. Função `chromaKey` (Substituição de Fundo / Croma-Chave)

### Funcionamento em Blocos

* **Bloco 1: Distância Euclidiana no Espaço de Cores**
  Para cada pixel $(x, y)$, calcula a distância tridimensional euclidiana entre a cor atual do primeiro plano e a cor de referência `targetColor`:
  $$d = \sqrt{(R - R_{alvo})^2 + (G - G_{alvo})^2 + (B - B_{alvo})^2}$$
* **Bloco 2: Substituição Condicional**
  Se $d \le tolerance$, o pixel é substituído pelo pixel da imagem de fundo `bgImg` na mesma coordenada (ou com clamp de borda caso as dimensões sejam distintas). Caso contrário, a cor original é mantida.

---

## 5. Função `adjustHSI` (Ajuste de Matiz, Saturação e Intensidade)

### Funcionamento em Blocos

* **Bloco 1: Deslocamento em Coordenadas Cilíndricas**
  Converte cada pixel para HSI. Aplica deslocamento angular no matiz com rotação circular $H' = (H + \Delta H) \pmod{360^\circ}$, saturação $S' = \text{clamp}(S + \Delta S, 0, 1)$ e intensidade $I' = \text{clamp}(I + \Delta I, 0, 1)$.
* **Bloco 2: Conversão de Retorno para RGB**
  Transforma $(H', S', I')$ de volta para RGB e grava na imagem.

---

## 6. Função `adjustColorChannels` (Ajuste de Canais Complementares)

### Funcionamento em Blocos

* **Bloco 1: Balanço de Canais Antagônicos**
  Adiciona desvios individuais $\Delta R$, $\Delta G$ e $\Delta B$ a cada pixel com saturação clamp em $[0, 255]$, permitindo controle de balanço entre Cyan/Red, Magenta/Green e Yellow/Blue.

---

## 7. Função `sepia` (Efeito Fotográfico Sépia)

### Funcionamento em Blocos

* **Bloco 1: Transformação por Combinação Linear**
  Mapeia cada pixel RGB através da matriz clássica de pigmentação sépia:
  $$R' = \text{clamp}(0.393R + 0.769G + 0.189B)$$
  $$G' = \text{clamp}(0.349R + 0.686G + 0.168B)$$
  $$B' = \text{clamp}(0.272R + 0.534G + 0.131B)$$

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `r`, `g`, `b` | Inteiro ($0$ a $255$) | Componentes de cor no espaço cartesiano RGB. |
| `h` | Número ($0^\circ$ a $360^\circ$) | Matiz (*Hue*), representando a cor espectral pura dominante. |
| `s` | Número ($0$ a $1$) | Saturação (*Saturation*), indicando o grau de diluição da cor por luz branca. |
| `i` | Número ($0$ a $1$) | Intensidade luminosa média (*Intensity*). |
| `targetColor` | `Array<Number>` | Vetor $[R, G, B]$ com a cor de fundo a ser mascarada no croma-chave. |
| `tolerance` | Número | Raio da esfera de tolerância no espaço de cores RGB para substituição. |
| `deltaH`, `deltaS`, `deltaI` | Número | Variações adicionadas respectivamente ao matiz, saturação e intensidade. |
| `deltaR`, `deltaG`, `deltaB` | Inteiro | Variações diretas de intensidade somadas a cada canal de cor. |
