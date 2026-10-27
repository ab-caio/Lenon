# Operações Espaciais Geométricas

As transformações geométricas alteram a disposição espacial dos pixels em uma imagem através de transformações de coordenadas afins, empregando o mapeamento reverso (*backward mapping*) para evitar buracos (*aliasing* de amostragem) na imagem resultante.

---

## 1. Função `scaleImage` (Escalonamento Espacial)

### Funcionamento em Blocos

* **Bloco 1: Determinação das Novas Dimensões**
  Calcula a nova largura e altura a partir dos fatores multiplicativos:
  $$W_{novo} = \text{round}(W_{orig} \times scaleX), \quad H_{novo} = \text{round}(H_{orig} \times scaleY)$$
  Aloca a imagem de destino com essas dimensões.
* **Bloco 2: Mapeamento Reverso**
  Para cada coordenada inteira $(x', y')$ do grid de destino, calcula o ponto contínuo de origem correspondente:
  $$x = \frac{x'}{scaleX}, \quad y = \frac{y'}{scaleY}$$
* **Bloco 3: Interpolação**
  - **Vizinho Mais Próximo (*Nearest Neighbor*):** Arredonda $(x, y)$ para os inteiros mais próximos $(\text{round}(x), \text{round}(y))$ com proteção de borda e transfere os 4 canais RGBA.
  - **Interpolação Bilinear:** Obtém as 4 posições adjacentes na grade original $(x_0, y_0)$, $(x_1, y_0)$, $(x_0, y_1)$, $(x_1, y_1)$ e suas frações $dx = x - x_0$, $dy = y - y_0$. Calcula a média ponderada pelas áreas dos retângulos opostos:
    $$f(x, y) = (1 - dx)(1 - dy)f_{00} + dx(1 - dy)f_{10} + (1 - dx)dyf_{01} + dx\,dyf_{11}$$

---

## 2. Função `rotateImage` (Rotação com Especificação de Pivô)

### Funcionamento em Blocos

* **Bloco 1: Parametrização Trigonométrica e Centro de Giro**
  Converte o ângulo de graus para radianos ($\theta = \text{angleDegrees} \times \pi / 180$).
  Se o pivô $(p_x, p_y)$ for omitido, assume o centro geométrico da imagem $((W - 1) / 2, (H - 1) / 2)$.
* **Bloco 2: Mapeamento Inverso da Rotação**
  Aplica a matriz inversa de rotação 2D transladada para o pivô em cada ponto $(x', y')$ do destino:
  $$x = \cos(\theta) \cdot (x' - p_x) + \sin(\theta) \cdot (y' - p_y) + p_x$$
  $$y = -\sin(\theta) \cdot (x' - p_x) + \cos(\theta) \cdot (y' - p_y) + p_y$$
* **Bloco 3: Verificação de Limites e Amostragem**
  Se $(x, y)$ recair dentro da área válida $[0, W - 1] \times [0, H - 1]$, amostra as cores via Vizinho Mais Próximo ou Interpolação Bilinear. Se recair fora da área da imagem de origem, atribui fundo nulo (preto transparente).

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `scaleX` / `scaleY` | Número | Fatores multiplicativos de escala nos eixos horizontal e vertical ($> 0$). |
| `angleDegrees` | Número | Ângulo de rotação em graus (positivo para sentido anti-horário). |
| `pivotX` / `pivotY` | Número | Coordenadas do centro de rotação (pivô). |
| `interpolation` | String | Método de interpolação: `'nearest'` ou `'bilinear'`. |
| `newWidth` / `newHeight` | Inteiro | Dimensões da imagem de saída após redimensionamento. |
| `srcX` / `srcY` | Número | Coordenadas contínuas projetadas de volta no espaço da imagem original. |
| `x0`, `y0`, `x1`, `y1` | Inteiro | Índices dos 4 pixels vizinhos inteiros na grade original. |
| `dx` / `dy` | Número | Distâncias fracionárias normalizadas entre a coordenada contínua e a grade inferior. |
| `w00`, `w10`, `w01`, `w11` | Número | Pesos de área da interpolação bilinear associados aos 4 vértices adjacentes. |
