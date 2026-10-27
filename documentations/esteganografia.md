# Esteganografia Espacial por Bit Menos Significativo (LSB)

A esteganografia espacial permite ocultar mensagens de texto no plano de bits menos significativo (LSB - *Least Significant Bit*) dos canais de cor de uma imagem digital, preservando a fidelidade visual perceptual humana.

---

## 1. Função `encode` (Ocultação de Mensagem)

### Funcionamento em Blocos

* **Bloco 1: Preparação da Mensagem e Validação de Capacidade**
  Adiciona o caractere terminador nulo (`\0`) ao final do texto a ser transmitido. Converte a quantidade de caracteres em bits necessários ($8 \times \text{comprimento}$). Verifica se a capacidade total da imagem ($largura \times altura \times 3$ canais) suporta a mensagem.
* **Bloco 2: Injeção de Bits no LSB**
  Itera pelos pixels nos canais R, G e B sequencialmente. Para cada canal:
  1. Extrai o bit correspondente do caractere da mensagem ($0$ ou $1$).
  2. Zera o bit menos significativo do byte da cor com a máscara `& 0xFE`.
  3. Insere o bit da mensagem através da operação lógica `| bit`.

---

## 2. Função `decode` (Extração de Mensagem)

### Funcionamento em Blocos

* **Bloco 1: Leitura Sequencial dos Bits**
  Itera pelos bytes dos canais R, G e B do buffer da imagem. Isola o bit menos significativo com a operação `& 1`.
* **Bloco 2: Reconstrução dos Bytes e Verificação de Parada**
  Acumula os bits lidos por deslocamento à esquerda (`(currentByte << 1) | bit`). A cada 8 bits acumulados:
  1. Se o byte resultante for $0$ (caractere nulo `\0`), o processo é encerrado imediatamente.
  2. Caso contrário, converte o byte para caractere via `String.fromCharCode` e concatena à mensagem recuperada.

---

## Dicionário de Variáveis

| Variável | Tipo | Descrição |
| :--- | :--- | :--- |
| `img` | Objeto (Jimp) | Objeto da imagem que atuará como hospedeira (*carrier*) da mensagem. |
| `message` | String | Texto em formato texto puro a ser codificado na imagem. |
| `messageWithNull` | String | Mensagem concatenada com o caractere delimitador `\0` (código ASCII 0). |
| `maxBits` | Inteiro | Capacidade máxima de armazenamento em bits da imagem ($W \times H \times 3$). |
| `totalBits` | Inteiro | Quantidade total de bits a serem injetados. |
| `bitIndex` | Inteiro | Ponteiro do bit corrente da mensagem em processo de injeção. |
| `charCode` | Inteiro | Código numérico ASCII do caractere atual. |
| `bit` | Inteiro ($0$ ou $1$) | Bit individual a ser gravado ou lido no canal de cor. |
| `currentByte` | Inteiro | Acumulador de 8 bits em processo de decodificação. |
| `bitsCount` | Inteiro | Contador de bits lidos para o byte atual ($0$ a $8$). |
