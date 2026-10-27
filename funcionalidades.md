### 1. Transformações de Intensidade Básicas e Esteganografia *(Prazo/Aula: 12/08/2026)*

* **Limiarização** ok
* **Negativo** ok
* **Brilho** ok
* **Potência (correção de gama)** ok
* **Transformação linear definida por partes** ok
* **Esteganografia** ok

---

### 2. Histograma, Equalização e Convolução Genérica *(Prazo/Aula: 24/08/2026)*

* **Exibição do histograma** ok
* **Equalização de histograma** ok
* **Aplicação de filtro genérico por convolução:** ok
  * O usuário deve poder escolher o tamanho do filtro. ok
  * Filtros quadrados de dimensões ímpares (3x3, 5x5, 7x7, 9x9 ou maiores, com tamanho máximo de pelo menos 9x9). ok
  * A imagem processada deve ter o mesmo tamanho da imagem original. ok

---

### 3. Filtros Espaciais de Suavização, Mediana e Aguçamento *(Prazo/Aula: 26/08/2026)*

* **Filtros de suavização da média** (simples e ponderado/Gaussiano) ok
* **Filtragem pela mediana** ok
* **Aguçamento (nitidez):** Filtros Laplaciano e High-Boost ok
* *(Observação: Implementar normalização de valores para exibição em tons acinzentados quando a convolução gerar valores negativos ou maiores que 255).* ok

---

### 4. Filtros de Gradiente e Sobel *(Prazo/Aula: 31/08/2026)*

* **Filtros de Sobel** – eixos X e Y separados (com normalização para tons acinzentados nos resultados de cada filtro) ok
* **Detecção não linear de bordas pelo gradiente** (magnitude) ok

---

### 5. Operações Espaciais (Geométricas) *(Prazo/Aula: 02/09/2026)*

* **Escala e Rotação** com interpolação pelo **vizinho mais próximo** e **bilinear** ok
* **Rotação com especificação de pivô** ok
* Funções/módulos correspondentes (`scaleImage`, `rotateImage`) ok

---

### 6. Filtragem no Domínio da Frequência *(Prazo/Aula: 16/09/2026)*

* **Cálculo da Transformada Discreta de Fourier (TDF):** ok
  * *Implementação própria da Transformada Rápida de Fourier (FFT) Cooley-Tukey Radix-2 2D* ok
* **Exibição do espectro (deslocado/centralizado)** ok
* **Ferramenta de edição do espectro:** máscara de ponderação multiplicativa / pincel suave ok
* **Cálculo da transformada inversa (IFFT 2D)** a partir das modificações do espectro para obter a imagem filtrada ok

---

### 7. Processamento de Imagens Coloridas *(Prazo/Aula: 30/09/2026)*

* **Ferramenta de conversão entre sistemas de cores:** RGB $\leftrightarrow$ HSI ok
* **Algoritmos de escala de cinza:** média aritmética simples e média ponderada ok
* **Negativo** para imagens coloridas ok
* **Chroma-Key:** seleção da "distância" da cor verde e da imagem substituta ok
* **Histograma** (Canais R, G, B e Intensidade I) ok
* **Equalização de Histograma** em imagens coloridas (no espaço HSI) ok
* **Ajuste de Matiz, Saturação e Brilho** ok
* **Ajuste de Canal** (C/R, M/G, Y/B) ok
* **Efeito Sépia** ("escala de cinza amarelada") ok
* *(Observação: Garantir que todos os processamentos anteriores feitos para escala de cinza também funcionem corretamente com imagens coloridas).* ok
