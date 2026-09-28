// ================================================================================================================
// Variáveis
// ================================================================================================================

const mainImage = document.getElementById("main-img");
const canvas = document.getElementById("canvas");
const emptyCanvas = document.getElementById("empty-canvas");
const imgInput = document.getElementById("img-input");
const saveBtn = document.getElementById("save-btn");
const negativeBtn = document.getElementById("negative");
const thresholdBtn = document.getElementById("threshold");
const brightnessBtn = document.getElementById("brightness");
const gammaBtn = document.getElementById("gama");
const linearBtn = document.getElementById("linear-func");
const histogramBtn = document.getElementById("histogram");
const histogramEqBtn = document.getElementById("histogram-eq");
const steganographyBtn = document.getElementById("esteganography");
const smoothingBtn = document.getElementById("smoothing");
const medianBtn = document.getElementById("median");
const laplacianSharpenBtn = document.getElementById("laplacian-sharpen");
const highBoostBtn = document.getElementById("high-boost");
const sobelBtn = document.getElementById("sobel");
const sobelMagnitudeBtn = document.getElementById("sobel-magnitude");
const convolutionBtn = document.getElementById("convolution");
const scaleToolBtn = document.getElementById("tool-scale");
const rotateToolBtn = document.getElementById("tool-rotate");

const layersList = document.getElementById("layers-list");
const layersEmpty = document.querySelector(".layers-empty");


let originalImg = null;
let imgName = "";
let layers = [];

// Estado da rotação "ativa" nesta sessão. rotationState.preImg é a
// imagem exatamente como estava ANTES da rotação atualmente aplicada em
// originalImg (null enquanto a imagem carregada nunca foi rotacionada,
// caso em que a base é o próprio originalImg). rotationState.angle é o
// ângulo hoje "embutido" em originalImg a partir dessa base.
//
// Isso é o que permite reabrir a janela de Rotação, ver o slider já no
// ângulo aplicado da última vez (ex: 90°), e girar a partir dali sem
// degradar a imagem: toda mudança de ângulo (inclusive voltar a 0°)
// sempre recalcula a partir de preImg, nunca a partir da originalImg já
// rotacionada. Ao aplicar uma nova rotação, preImg e angle são
// atualizados para o novo resultado, viram a base da próxima vez.
//
// pivotX/pivotY são relativos a preImg (não à imagem final rotacionada);
// null significa "centro de preImg" e é o valor inicial antes de
// qualquer arrasto do indicador visual. Assim como o ângulo, só em
// memória - reseta ao carregar uma nova imagem ou recarregar a página
let rotationState = {
    preImg: null,
    angle: 0,
    pivotX: null,
    pivotY: null,
    interpolation: "nearest",
};




// ================================================================================================================
// Funções utilitárias genéricas
// ================================================================================================================


// restringe value ao intervalo [min, max];
// bug corrigido: um NaN (ex: campo numérico temporariamente vazio
// enquanto o usuário digita) passava direto por Math.min/Math.max sem
// cair em nenhum dos dois ramos, vazando NaN para o slider e, dali,
// para o cálculo de pixels - por isso NaN é tratado à parte e cai no
// mínimo do intervalo

function clamp(value, min, max) {
    if (Number.isNaN(value)) return min;
    return Math.min(max, Math.max(min, value));
}




// ================================================================================================================
// Funções auxiliares de interface
// ================================================================================================================




// ativa ou desativa os botões que exigem uma imagem carregada

function setControlEnable(enabled) {
    saveBtn.disabled = !enabled;
    negativeBtn.disabled = !enabled;
    thresholdBtn.disabled = !enabled;
    brightnessBtn.disabled = !enabled;
    gammaBtn.disabled = !enabled;
    linearBtn.disabled = !enabled;
    histogramBtn.disabled = !enabled;
    histogramEqBtn.disabled = !enabled;
    steganographyBtn.disabled = !enabled;
    smoothingBtn.disabled = !enabled;
    medianBtn.disabled = !enabled;
    laplacianSharpenBtn.disabled = !enabled;
    highBoostBtn.disabled = !enabled;
    sobelBtn.disabled = !enabled;
    sobelMagnitudeBtn.disabled = !enabled;
    convolutionBtn.disabled = !enabled;

    // Escala e Rotação são <div>, não <button>, então não têm a
    // propriedade "disabled" nativa; o mesmo efeito visual/funcional é
    // obtido com a classe tool-item-disabled (ver styles.css)
    scaleToolBtn.classList.toggle("tool-item-disabled", !enabled);
    rotateToolBtn.classList.toggle("tool-item-disabled", !enabled);
}




// reordena a seção de camadas de acordo com o array layers;
// é chamada sempre que uma camada é adicionada, removida ou deslocada

function updateLayersPanel() {
    layersList.innerHTML = "";

    if (layers.length === 0) {
        layersEmpty.style.display = "block";
        return;
    }

    layersEmpty.style.display = "none";

    layers.forEach((layer, index) => {
        const row = createLayerRow(layer, index);
        layersList.appendChild(row);
    });
}




// cria o elemento HTML de uma linha da lista de camadas

function createLayerRow(layer, index) {
    const row = document.createElement("div");
    row.className = "layer-row";
    row.draggable = true;

    const number = document.createElement("span");
    number.className = "num";
    number.textContent = `${index + 1}`;

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = layer.label;

    const removeBtn = document.createElement("button");
    removeBtn.textContent = "x";
    removeBtn.title = "Remover camada";
    removeBtn.addEventListener("click", () => {
        layers.splice(index, 1);
        updateLayersPanel();
        rebuildImageFromLayers();
    });

    enableLayerDragAndDrop(row, index);

    row.appendChild(number);
    row.appendChild(name);
    row.appendChild(removeBtn);
    return row;
}




// habilita o arrasto de uma linha de camada para reordenar o array layers

function enableLayerDragAndDrop(row, index) {
    row.addEventListener("dragstart", () => {
        row.classList.add("dragging");
        row.dataset.fromIndex = index;
    });

    row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
    });

    row.addEventListener("dragover", (event) => {
        event.preventDefault();
        row.classList.add("drag-over");
    });

    row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over");
    });

    row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("drag-over");

        const draggedRow = document.querySelector(".dragging");
        if (!draggedRow) return;

        const fromIndex = Number(draggedRow.dataset.fromIndex);
        if (fromIndex === index) return;

        const [movedLayer] = layers.splice(fromIndex, 1);
        layers.splice(index, 0, movedLayer);

        updateLayersPanel();
        rebuildImageFromLayers();
    });
}




// ================================================================================================================
// Efeitos
// ================================================================================================================




// aplica um filtro por vez na imagem, de acordo com o tipo da camada

function applyFilter(jimpImg, layer) {
    if (layer.type === "negative") {
        applyInversion(jimpImg);
    }

    else if (layer.type === "threshold") {
        applyThreshold(jimpImg, layer);
    }

    else if (layer.type === "brightness") {
        changeBrightness(jimpImg, layer);
    }

    else if (layer.type === "gamma") {
        gamaCorrection(jimpImg, layer);
    }

    else if (layer.type === "linear") {
        applyPiecewiseLinear(jimpImg, layer);
    }

    else if (layer.type === "histogram-eq") {
        applyHistogramEqualization(jimpImg, layer);
    }

    else if (layer.type === "steganography") {
        hideMessage(jimpImg, layer);
    }

    else if (layer.type === "convolution") {
        applyConvolution(jimpImg, layer);
    }

    else if (layer.type === "smoothing") {
        applySmoothing(jimpImg, layer);
    }

    else if (layer.type === "median") {
        applyMedian(jimpImg, layer);
    }

    else if (layer.type === "laplacian-sharpen") {
        applyLaplacianSharpen(jimpImg, layer);
    }

    else if (layer.type === "high-boost") {
        applyHighBoost(jimpImg, layer);
    }

    else if (layer.type === "sobel") {
        applySobel(jimpImg, layer);
    }

    else if (layer.type === "sobel-magnitude") {
        applySobelMagnitude(jimpImg, layer);
    }


    return jimpImg;
}




// refaz a imagem do zero, aplicando os efeitos na ordem em que
// estão no array layers

async function rebuildImageFromLayers() {
    const working = originalImg.clone();
    layers.forEach((layer) => applyFilter(working, layer));

    const base64 = await working.getBase64Async(Jimp.MIME_PNG);
    mainImage.src = base64;
}




// ------------------------------
// Função de inversão (Negativo)

async function applyInversion(jimpImg) {
    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        this.bitmap.data[idx + 0] = 255 - this.bitmap.data[idx + 0];
        this.bitmap.data[idx + 1] = 255 - this.bitmap.data[idx + 1];
        this.bitmap.data[idx + 2] = 255 - this.bitmap.data[idx + 2];
    });
    return jimpImg;
}




// ------------------------------
// Função de limiarização

async function applyThreshold(jimpImg, layer) {
    const limit = layer.value;

    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        const red = this.bitmap.data[idx + 0];
        const green = this.bitmap.data[idx + 1];
        const blue = this.bitmap.data[idx + 2];
        const mean = (red + green + blue) / 3;

        const output = mean >= limit ? 255 : 0;

        this.bitmap.data[idx + 0] = output;
        this.bitmap.data[idx + 1] = output;
        this.bitmap.data[idx + 2] = output;
    });
    return jimpImg;
}




// ------------------------------
// Função de brilho

async function changeBrightness(jimpImg, layer) {
    const amount = layer.value;

    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        const red = this.bitmap.data[idx + 0] + amount;
        const green = this.bitmap.data[idx + 1] + amount;
        const blue = this.bitmap.data[idx + 2] + amount;

        this.bitmap.data[idx + 0] = clamp(red, 0, 255);
        this.bitmap.data[idx + 1] = clamp(green, 0, 255);
        this.bitmap.data[idx + 2] = clamp(blue, 0, 255);
    });
    return jimpImg;
}




// ------------------------------
// Função de correção de gama

async function gamaCorrection(jimpImg, layer) {
    const invGamma = 1 / layer.value;

    // lookup table para facilitar o cálculo
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
        const normalized = i / 255;
        const corrected = Math.pow(normalized, invGamma);
        lut[i] = Math.round(corrected * 255);
    }

    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        this.bitmap.data[idx + 0] = lut[this.bitmap.data[idx + 0]];
        this.bitmap.data[idx + 1] = lut[this.bitmap.data[idx + 1]];
        this.bitmap.data[idx + 2] = lut[this.bitmap.data[idx + 2]];
    });
    return jimpImg;
}




// ------------------------------
// Função linear definida por partes


// constrói uma LUT de 256 posições a partir de uma lista de pontos
// de controle {x, y}, interpolando linearmente entre pontos vizinhos

function buildPiecewiseLut(points) {
    const sortedPoints = [...points].sort((a, b) => a.x - b.x);
    const lut = new Uint8ClampedArray(256);

    for (let i = 0; i < 256; i++) {
        // encontra o segmento [start, end] que contém i
        let start = sortedPoints[0];
        let end = sortedPoints[sortedPoints.length - 1];

        for (let j = 0; j < sortedPoints.length - 1; j++) {
            if (i >= sortedPoints[j].x && i <= sortedPoints[j + 1].x) {
                start = sortedPoints[j];
                end = sortedPoints[j + 1];
                break;
            }
        }

        if (end.x === start.x) {
            lut[i] = start.y;
        } else {
            const t = (i - start.x) / (end.x - start.x);
            lut[i] = Math.round(start.y + t * (end.y - start.y));
        }
    }

    return lut;
}


async function applyPiecewiseLinear(jimpImg, layer) {
    const lutR = buildPiecewiseLut(layer.pointsR);
    const lutG = buildPiecewiseLut(layer.pointsG);
    const lutB = buildPiecewiseLut(layer.pointsB);

    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        this.bitmap.data[idx + 0] = lutR[this.bitmap.data[idx + 0]];
        this.bitmap.data[idx + 1] = lutG[this.bitmap.data[idx + 1]];
        this.bitmap.data[idx + 2] = lutB[this.bitmap.data[idx + 2]];
    });
    return jimpImg;
}


// ------------------------------
// Histograma e equalização de histograma


// calcula os histogramas de R, G, B (256 posições cada, contagem de
// pixels por nível de intensidade) e o histograma de luminância (média
// dos três canais), usado como base tanto para a exibição quanto para
// a equalização

function computeHistograms(jimpImg) {
    const r = new Array(256).fill(0);
    const g = new Array(256).fill(0);
    const b = new Array(256).fill(0);
    const luminance = new Array(256).fill(0);

    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        const red = this.bitmap.data[idx + 0];
        const green = this.bitmap.data[idx + 1];
        const blue = this.bitmap.data[idx + 2];

        r[red]++;
        g[green]++;
        b[blue]++;
        luminance[Math.round((red + green + blue) / 3)]++;
    });

    return { r, g, b, luminance };
}




// constrói a LUT de equalização a partir de um histograma: acumula as
// contagens (CDF), normaliza para a faixa 0-255 e ignora o menor valor
// de CDF (cdfMin) para que o nível mais escuro da imagem continue em 0,
// como na equalização de histograma clássica

function buildEqualizationLut(histogram, totalPixels) {
    const lut = new Uint8ClampedArray(256);

    if (totalPixels === 0) {
        return lut;
    }

    const cdf = new Array(256).fill(0);
    let cumulative = 0;
    for (let i = 0; i < 256; i++) {
        cumulative += histogram[i];
        cdf[i] = cumulative;
    }

    // cdfMin é a menor contagem acumulada não-nula; se a imagem tiver
    // um único nível de intensidade, cdfMin === totalPixels e a divisão
    // abaixo daria zero no denominador, então esse caso é tratado à parte
    const cdfMin = cdf.find((value) => value > 0) ?? 0;

    if (cdfMin === totalPixels) {
        // imagem com um só nível de tom: não há o que equalizar,
        // mantém a identidade para não gerar ruído artificial
        for (let i = 0; i < 256; i++) lut[i] = i;
        return lut;
    }

    for (let i = 0; i < 256; i++) {
        lut[i] = Math.round(((cdf[i] - cdfMin) / (totalPixels - cdfMin)) * 255);
    }

    return lut;
}




// aplica a equalização de histograma. modo "luminance" (padrão) equaliza
// a média dos canais e aplica a mesma LUT aos três, preservando a matiz;
// modo "channels" equaliza R, G e B de forma independente, o que corrige
// mais contraste porém pode alterar as cores da imagem

async function applyHistogramEqualization(jimpImg, layer) {
    const mode = layer.mode || "luminance";
    const totalPixels = jimpImg.bitmap.width * jimpImg.bitmap.height;
    const { r, g, b, luminance } = computeHistograms(jimpImg);

    if (mode === "channels") {
        const lutR = buildEqualizationLut(r, totalPixels);
        const lutG = buildEqualizationLut(g, totalPixels);
        const lutB = buildEqualizationLut(b, totalPixels);

        jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
            this.bitmap.data[idx + 0] = lutR[this.bitmap.data[idx + 0]];
            this.bitmap.data[idx + 1] = lutG[this.bitmap.data[idx + 1]];
            this.bitmap.data[idx + 2] = lutB[this.bitmap.data[idx + 2]];
        });
    } else {
        const lutLuminance = buildEqualizationLut(luminance, totalPixels);

        jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
            const red = this.bitmap.data[idx + 0];
            const green = this.bitmap.data[idx + 1];
            const blue = this.bitmap.data[idx + 2];
            const level = Math.round((red + green + blue) / 3);
            const equalized = lutLuminance[level];

            // desloca cada canal pela mesma diferença aplicada à
            // luminância, preservando a proporção de cor original
            const delta = equalized - level;

            this.bitmap.data[idx + 0] = clamp(red + delta, 0, 255);
            this.bitmap.data[idx + 1] = clamp(green + delta, 0, 255);
            this.bitmap.data[idx + 2] = clamp(blue + delta, 0, 255);
        });
    }

    return jimpImg;
}




// desenha um histograma (um único canal de contagens) num canvas 2D,
// normalizando as barras pela maior contagem encontrada; usado tanto
// para o histograma "cru" quanto para o histograma pós-equalização

function drawHistogramBars(canvasEl, histogram, color) {
    const ctx = canvasEl.getContext("2d");
    const width = canvasEl.width;
    const height = canvasEl.height;

    ctx.clearRect(0, 0, width, height);

    const maxCount = Math.max(...histogram);
    if (maxCount === 0) return;

    const barWidth = width / 256;

    ctx.fillStyle = color;
    for (let i = 0; i < 256; i++) {
        const barHeight = (histogram[i] / maxCount) * height;
        ctx.fillRect(i * barWidth, height - barHeight, Math.max(barWidth, 1), barHeight);
    }
}




// ------------------------------
// Função de esteganografia (ocultar/revelar texto)


// converte um texto para uma sequência de bits (8 bits por caractere,
// UTF-8), seguida de um terminador de 16 bits em zero, que marca o
// fim da mensagem na hora de revelar

function textToBits(text) {
    const bytes = new TextEncoder().encode(text);
    const bits = [];

    bytes.forEach((byte) => {
        for (let i = 7; i >= 0; i--) {
            bits.push((byte >> i) & 1);
        }
    });

    // terminador: 16 zeros seguidos, que não ocorrem no meio de um
    // texto UTF-8 válido, pois todo byte de texto tem ao menos um bit 1
    for (let i = 0; i < 16; i++) {
        bits.push(0);
    }

    return bits;
}




// embute os bits de um texto no bit menos significativo do canal
// azul de cada pixel, em ordem de varredura; a imagem precisa ter
// pixels suficientes para conter a mensagem inteira

async function hideMessage(jimpImg, layer) {
    const bits = textToBits(layer.value);
    const totalPixels = jimpImg.bitmap.width * jimpImg.bitmap.height;

    if (bits.length > totalPixels) {
        throw new Error("Mensagem longa demais para esta imagem.");
    }

    let bitIndex = 0;

    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        if (bitIndex >= bits.length) return;

        const blue = this.bitmap.data[idx + 2];
        this.bitmap.data[idx + 2] = (blue & 0xfe) | bits[bitIndex];
        bitIndex++;
    });

    return jimpImg;
}




// lê o bit menos significativo do canal azul de cada pixel, em ordem
// de varredura, até encontrar o terminador (16 zeros seguidos) ou
// esgotar a imagem, e decodifica os bits lidos de volta para texto

function revealMessage(jimpImg) {
    const bits = [];
    let zeroStreak = 0;

    jimpImg.scan(0, 0, jimpImg.bitmap.width, jimpImg.bitmap.height, function(x, y, idx) {
        if (zeroStreak >= 16) return;

        const bit = this.bitmap.data[idx + 2] & 1;
        bits.push(bit);
        zeroStreak = bit === 0 ? zeroStreak + 1 : 0;
    });

    // remove o terminador de 16 zeros antes de decodificar
    const messageBits = zeroStreak >= 16 ? bits.slice(0, bits.length - 16) : bits;

    const byteCount = Math.floor(messageBits.length / 8);
    const bytes = new Uint8Array(byteCount);

    for (let i = 0; i < byteCount; i++) {
        let byte = 0;
        for (let b = 0; b < 8; b++) {
            byte = (byte << 1) | messageBits[i * 8 + b];
        }
        bytes[i] = byte;
    }

    return new TextDecoder().decode(bytes);
}




// ------------------------------
// Função de convolução genérica


// aplica um kernel de convolução quadrado (dimensão ímpar, ex: 3, 5, 7, 9)
// à imagem inteira. o kernel é um array plano de size*size pesos, lido em
// ordem de varredura (linha a linha, esquerda para direita). a soma dos
// pesos é usada como fator de normalização automática (como no Gimp),
// exceto quando essa soma é zero (ex: detecção de bordas), caso em que
// a normalização é 1, para não dividir por zero e para preservar o
// contraste do resultado
//
// como a convolução de cada pixel depende dos pixels vizinhos, a leitura
// tem que ser feita sobre uma cópia congelada dos dados originais (source)
// enquanto a escrita vai para jimpImg.bitmap.data; se a leitura fosse
// feita diretamente em jimpImg durante o próprio scan, pixels já
// processados (com o novo valor) contaminariam o cálculo dos pixels
// vizinhos seguintes
//
// pixels fora da borda da imagem são tratados por extensão do pixel mais
// próximo (clamping das coordenadas), técnica também chamada de "edge
// replication": evita tanto o escurecimento artificial da borda (que
// ocorreria se pixels fora da imagem fossem tratados como pretos/zero)
// quanto qualquer mudança no tamanho da imagem de saída

async function applyConvolution(jimpImg, layer) {
    const size = layer.size;
    const kernel = layer.kernel;
    const width = jimpImg.bitmap.width;
    const height = jimpImg.bitmap.height;
    const half = Math.floor(size / 2);

    // fator de normalização: soma dos pesos do kernel, ou 1 se essa
    // soma for zero (kernels de detecção de borda somam zero e não
    // devem ser normalizados, ou o resultado colapsaria para preto)
    const weightSum = kernel.reduce((total, weight) => total + weight, 0);
    const normalization = weightSum !== 0 ? weightSum : 1;

    // cópia congelada dos dados de origem: Uint8ClampedArray comum é
    // mais rápido de indexar aqui do que continuar chamando jimpImg.clone()
    const source = Uint8ClampedArray.from(jimpImg.bitmap.data);

    jimpImg.scan(0, 0, width, height, function(x, y, idx) {
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;

        // percorre cada posição do kernel, somando o produto peso *
        // pixel-vizinho; ky/kx variam de -half a +half, cobrindo toda
        // a vizinhança size x size ao redor do pixel (x, y)
        for (let ky = -half; ky <= half; ky++) {
            // clamp: pixels fora da imagem repetem a linha/coluna
            // válida mais próxima da borda
            const sampleY = clamp(y + ky, 0, height - 1);

            for (let kx = -half; kx <= half; kx++) {
                const sampleX = clamp(x + kx, 0, width - 1);
                const sampleIdx = (sampleY * width + sampleX) * 4;

                // índice do peso correspondente dentro do array plano
                // do kernel (linha ky+half, coluna kx+half)
                const weight = kernel[(ky + half) * size + (kx + half)];

                sumR += source[sampleIdx + 0] * weight;
                sumG += source[sampleIdx + 1] * weight;
                sumB += source[sampleIdx + 2] * weight;
            }
        }

        this.bitmap.data[idx + 0] = clamp(Math.round(sumR / normalization), 0, 255);
        this.bitmap.data[idx + 1] = clamp(Math.round(sumG / normalization), 0, 255);
        this.bitmap.data[idx + 2] = clamp(Math.round(sumB / normalization), 0, 255);
        // canal alfa (idx + 3) não é alterado: mantém a transparência original
    });

    return jimpImg;
}




// ------------------------------
// Função de suavização (filtro da média simples e ponderado/Gaussiano)


// gera a linha do triângulo de Pascal de tamanho size (ex: size=3 ->
// [1, 2, 1], size=5 -> [1, 4, 6, 4, 1]); esses valores são os mesmos
// coeficientes binomiais que aproximam uma gaussiana discreta, e o
// kernel 2D é obtido pelo produto externo dessa linha por ela mesma,
// já que a gaussiana é separável (kernel[y][x] = row[y] * row[x])

function pascalRow(size) {
    const row = [1];
    for (let i = 1; i < size; i++) {
        row.push(row[i - 1] * (size - i) / i);
    }
    return row;
}


// monta o kernel gaussiano size x size a partir do produto externo da
// linha de Pascal; para size=3 dá o kernel clássico 1-2-1 / 2-4-2 / 1-2-1

function buildGaussianKernel(size) {
    const row = pascalRow(size);
    const kernel = new Array(size * size);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            kernel[y * size + x] = row[y] * row[x];
        }
    }

    return kernel;
}


// kernel da média simples: todos os pesos iguais a 1, size x size;
// a normalização pela soma dos pesos (feita dentro de applyConvolution)
// já divide pelo total de vizinhos, resultando na média aritmética

function buildMeanKernel(size) {
    return new Array(size * size).fill(1);
}


// a suavização é apenas uma convolução com um kernel específico (média
// ou gaussiano), então delega o cálculo inteiro para applyConvolution
// em vez de duplicar a lógica de borda/normalização

async function applySmoothing(jimpImg, layer) {
    const kernel = layer.mode === "gaussian"
        ? buildGaussianKernel(layer.size)
        : buildMeanKernel(layer.size);

    return applyConvolution(jimpImg, { size: layer.size, kernel });
}




// ------------------------------
// Filtragem pela mediana


// não é uma convolução (não existe combinação linear de pesos que
// produza uma mediana), então tem sua própria função: para cada pixel,
// cada canal R/G/B recebe o valor mediano da vizinhança size x size
// daquele canal, calculado de forma independente entre os canais

async function applyMedian(jimpImg, layer) {
    const size = layer.size;
    const width = jimpImg.bitmap.width;
    const height = jimpImg.bitmap.height;
    const half = Math.floor(size / 2);
    const windowLength = size * size;
    const medianIndex = Math.floor(windowLength / 2);

    // cópia congelada dos dados de origem, pelo mesmo motivo da
    // convolução: a leitura não pode enxergar pixels já processados
    const source = Uint8ClampedArray.from(jimpImg.bitmap.data);

    // buffers reaproveitados a cada pixel para não realocar um array
    // novo por iteração do scan
    const windowR = new Uint8ClampedArray(windowLength);
    const windowG = new Uint8ClampedArray(windowLength);
    const windowB = new Uint8ClampedArray(windowLength);

    jimpImg.scan(0, 0, width, height, function(x, y, idx) {
        let n = 0;

        for (let ky = -half; ky <= half; ky++) {
            // clamp: mesma extensão de borda (edge replication) usada
            // na convolução, para não encolher nem escurecer a borda
            const sampleY = clamp(y + ky, 0, height - 1);

            for (let kx = -half; kx <= half; kx++) {
                const sampleX = clamp(x + kx, 0, width - 1);
                const sampleIdx = (sampleY * width + sampleX) * 4;

                windowR[n] = source[sampleIdx + 0];
                windowG[n] = source[sampleIdx + 1];
                windowB[n] = source[sampleIdx + 2];
                n++;
            }
        }

        // ordena cada janela e pega o elemento central; como size é
        // sempre ímpar, windowLength também é ímpar e o índice central
        // é exato, sem precisar de média entre dois valores
        windowR.sort();
        windowG.sort();
        windowB.sort();

        this.bitmap.data[idx + 0] = windowR[medianIndex];
        this.bitmap.data[idx + 1] = windowG[medianIndex];
        this.bitmap.data[idx + 2] = windowB[medianIndex];
        // canal alfa (idx + 3) não é alterado
    });

    return jimpImg;
}




// ------------------------------
// Aguçamento (nitidez) por Laplaciano e por High-Boost


// kernels do Laplaciano, fixos em 3x3: a variante 4-conectada usa
// apenas os vizinhos ortogonais (cima/baixo/esquerda/direita) e a
// 8-conectada inclui também as diagonais, resultando numa borda mais
// realçada. os dois somam zero (regiões de tom constante geram
// resultado zero), por isso não passam pela normalização automática
// da convolução: a soma zero já é tratada em applyConvolution como
// "sem normalização" (divide por 1)

const LAPLACIAN_KERNELS = {
    "4": [
        0, -1,  0,
       -1,  4, -1,
        0, -1,  0,
    ],
    "8": [
       -1, -1, -1,
       -1,  8, -1,
       -1, -1, -1,
    ],
};


// aguçamento por Laplaciano: soma ao pixel original o resultado da
// convolução laplaciana, escalado por um fator de intensidade. como o
// laplaciano é zero em áreas planas e não-zero nas bordas, essa soma
// realça os detalhes sem alterar áreas uniformes da imagem. o fator de
// intensidade (0 a 3) permite controlar o quanto o realce é aplicado,
// sendo 1 o aguçamento clássico (original + laplaciano)

async function applyLaplacianSharpen(jimpImg, layer) {
    const kernel = LAPLACIAN_KERNELS[String(layer.connectivity)] || LAPLACIAN_KERNELS["4"];
    const amount = layer.amount;
    const width = jimpImg.bitmap.width;
    const height = jimpImg.bitmap.height;
    const half = 1; // kernel do laplaciano é sempre 3x3

    const source = Uint8ClampedArray.from(jimpImg.bitmap.data);

    jimpImg.scan(0, 0, width, height, function(x, y, idx) {
        let lapR = 0;
        let lapG = 0;
        let lapB = 0;

        for (let ky = -half; ky <= half; ky++) {
            const sampleY = clamp(y + ky, 0, height - 1);

            for (let kx = -half; kx <= half; kx++) {
                const sampleX = clamp(x + kx, 0, width - 1);
                const sampleIdx = (sampleY * width + sampleX) * 4;
                const weight = kernel[(ky + half) * 3 + (kx + half)];

                lapR += source[sampleIdx + 0] * weight;
                lapG += source[sampleIdx + 1] * weight;
                lapB += source[sampleIdx + 2] * weight;
            }
        }

        this.bitmap.data[idx + 0] = clamp(Math.round(source[idx + 0] + amount * lapR), 0, 255);
        this.bitmap.data[idx + 1] = clamp(Math.round(source[idx + 1] + amount * lapG), 0, 255);
        this.bitmap.data[idx + 2] = clamp(Math.round(source[idx + 2] + amount * lapB), 0, 255);
        // canal alfa (idx + 3) não é alterado
    });

    return jimpImg;
}




// aguçamento por High-Boost: fórmula clássica A*original - suavizada,
// em que "suavizada" é o resultado de um filtro de média ou gaussiano
// (a máscara borrada) e A >= 1 é o fator de amplificação. quando A=1,
// a fórmula se reduz a original - suavizada, que é a máscara de nitidez
// (unsharp mask) pura; valores de A maiores que 1 amplificam o
// componente de alta frequência realçado. reaproveita buildMeanKernel/
// buildGaussianKernel e applyConvolution para gerar a máscara borrada,
// em vez de duplicar a lógica de convolução

async function applyHighBoost(jimpImg, layer) {
    const amplification = layer.amplification;
    const blurKernel = layer.blurMode === "gaussian"
        ? buildGaussianKernel(layer.blurSize)
        : buildMeanKernel(layer.blurSize);

    // a imagem original precisa ser preservada antes de gerar a
    // versão borrada, já que applyConvolution modifica jimpImg no lugar
    const original = Uint8ClampedArray.from(jimpImg.bitmap.data);

    // applyConvolution não tem await interno de verdade (jimpImg.scan é
    // síncrono); chamá-la com await aqui introduziria um ponto de
    // suspensão real nesta função, e como applyFilter/rebuildImageFromLayers
    // não aguardam o retorno de applyHighBoost, o restante do processamento
    // (o scan abaixo) rodaria depois da imagem já ter sido lida para
    // exibição/salvamento — por isso a chamada é feita sem await
    const blurred = jimpImg.clone();
    applyConvolution(blurred, { size: layer.blurSize, kernel: blurKernel });

    const width = jimpImg.bitmap.width;
    const height = jimpImg.bitmap.height;

    jimpImg.scan(0, 0, width, height, function(x, y, idx) {
        const boostedR = amplification * original[idx + 0] - blurred.bitmap.data[idx + 0];
        const boostedG = amplification * original[idx + 1] - blurred.bitmap.data[idx + 1];
        const boostedB = amplification * original[idx + 2] - blurred.bitmap.data[idx + 2];

        this.bitmap.data[idx + 0] = clamp(Math.round(boostedR), 0, 255);
        this.bitmap.data[idx + 1] = clamp(Math.round(boostedG), 0, 255);
        this.bitmap.data[idx + 2] = clamp(Math.round(boostedB), 0, 255);
        // canal alfa (idx + 3) não é alterado
    });

    return jimpImg;
}




// ------------------------------
// Detecção de bordas por Sobel (Gx, Gy e magnitude do gradiente)


// kernels clássicos de Sobel 3x3: Gx reage a variações de intensidade
// na horizontal (bordas verticais) e Gy reage a variações na vertical
// (bordas horizontais). assim como o Laplaciano, os dois somam zero
// (regiões de tom constante geram gradiente zero), por isso não usam a
// normalização automática de applyConvolution - aqui a normalização de
// exibição é feita à parte (ver normalizeGradientToGray), já que o
// interesse não é preservar o brilho médio, e sim mapear o gradiente
// (que pode ser negativo) para uma faixa visível de cinza

const SOBEL_KERNEL_X = [
    -1, 0, 1,
    -2, 0, 2,
    -1, 0, 1,
];

const SOBEL_KERNEL_Y = [
    -1, -2, -1,
     0,  0,  0,
     1,  2,  1,
];


// converte um pixel RGB para um único valor de intensidade (luminância),
// usando a mesma média simples (r+g+b)/3 já usada em outras partes do
// programa (threshold, histograma); os filtros de Sobel operam sobre
// essa intensidade em vez de cada canal separadamente, já que gradiente
// de borda é um conceito de uma imagem em tons de cinza, não de cor

function toGrayscaleBuffer(source, width, height) {
    const gray = new Float32Array(width * height);

    for (let i = 0, p = 0; i < source.length; i += 4, p++) {
        gray[p] = (source[i + 0] + source[i + 1] + source[i + 2]) / 3;
    }

    return gray;
}


// convolui o buffer de cinza (gray, já em tons de cinza) com um kernel
// 3x3 e devolve um Float32Array do mesmo tamanho, com o valor bruto do
// gradiente (sem normalizar nem recortar) em cada posição; a mesma
// extensão de borda por clamping usada em applyConvolution é reaplicada
// aqui, pelo mesmo motivo (evitar escurecimento artificial na borda)

function convolveGrayscale(gray, width, height, kernel) {
    const output = new Float32Array(width * height);

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            let sum = 0;

            for (let ky = -1; ky <= 1; ky++) {
                const sampleY = clamp(y + ky, 0, height - 1);

                for (let kx = -1; kx <= 1; kx++) {
                    const sampleX = clamp(x + kx, 0, width - 1);
                    const weight = kernel[(ky + 1) * 3 + (kx + 1)];
                    sum += gray[sampleY * width + sampleX] * weight;
                }
            }

            output[y * width + x] = sum;
        }
    }

    return output;
}


// normaliza um buffer de valores de gradiente (que podem ser negativos
// e ultrapassar 255) para a faixa visível [0, 255], espalhando pelo
// mínimo e máximo encontrados (normalização min-max, como pedido no
// enunciado: o resultado de cada filtro de Sobel deve ficar em tons
// "acinzentados" em vez de estourar ou colapsar a maior parte da
// imagem em preto/branco). quando min === max (gradiente constante,
// ex: imagem toda uniforme), todo o buffer é mapeado para 0, já que
// não há variação nenhuma para espalhar

function normalizeGradientToGray(values) {
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < values.length; i++) {
        if (values[i] < min) min = values[i];
        if (values[i] > max) max = values[i];
    }

    const range = max - min;
    const gray = new Uint8ClampedArray(values.length);

    if (range === 0) {
        return gray; // já inicializado com zeros
    }

    for (let i = 0; i < values.length; i++) {
        gray[i] = Math.round(((values[i] - min) / range) * 255);
    }

    return gray;
}


// aplica o filtro de Sobel na direção escolhida (layer.direction: "x"
// ou "y") e escreve o resultado normalizado (tons de cinza) de volta
// nos três canais RGB, produzindo uma imagem acinzentada em que áreas
// de baixo contraste ficam num cinza médio e as bordas na direção
// detectada aparecem mais claras ou mais escuras

async function applySobel(jimpImg, layer) {
    const width = jimpImg.bitmap.width;
    const height = jimpImg.bitmap.height;
    const kernel = layer.direction === "y" ? SOBEL_KERNEL_Y : SOBEL_KERNEL_X;

    const gray = toGrayscaleBuffer(jimpImg.bitmap.data, width, height);
    const gradient = convolveGrayscale(gray, width, height, kernel);
    const normalized = normalizeGradientToGray(gradient);

    jimpImg.scan(0, 0, width, height, function(x, y, idx) {
        const value = normalized[y * width + x];
        this.bitmap.data[idx + 0] = value;
        this.bitmap.data[idx + 1] = value;
        this.bitmap.data[idx + 2] = value;
        // canal alfa (idx + 3) não é alterado
    });

    return jimpImg;
}


// detecção de bordas pelo gradiente completo: calcula Gx e Gy e combina
// os dois pela magnitude do vetor gradiente, sqrt(Gx² + Gy²). essa
// combinação é não linear (ao contrário de uma simples soma ou média de
// Gx e Gy), e é o que torna o resultado sensível a bordas em qualquer
// orientação, não só horizontal ou vertical. a magnitude também é
// normalizada para tons de cinza pelo mesmo método usado nos filtros
// Gx/Gy separados, para exibição consistente entre os três

async function applySobelMagnitude(jimpImg, layer) {
    const width = jimpImg.bitmap.width;
    const height = jimpImg.bitmap.height;

    const gray = toGrayscaleBuffer(jimpImg.bitmap.data, width, height);
    const gradientX = convolveGrayscale(gray, width, height, SOBEL_KERNEL_X);
    const gradientY = convolveGrayscale(gray, width, height, SOBEL_KERNEL_Y);

    const magnitude = new Float32Array(width * height);
    for (let i = 0; i < magnitude.length; i++) {
        magnitude[i] = Math.sqrt(gradientX[i] * gradientX[i] + gradientY[i] * gradientY[i]);
    }

    const normalized = normalizeGradientToGray(magnitude);

    jimpImg.scan(0, 0, width, height, function(x, y, idx) {
        const value = normalized[y * width + x];
        this.bitmap.data[idx + 0] = value;
        this.bitmap.data[idx + 1] = value;
        this.bitmap.data[idx + 2] = value;
        // canal alfa (idx + 3) não é alterado
    });

    return jimpImg;
}




// ------------------------------
// Escala e Rotação (ferramentas, não filtros: alteram originalImg
// diretamente e permanentemente, em vez de virarem uma camada da lista
// de filtros - ver replaceOriginalImage)


// amostra um pixel de um buffer RGBA pelo vizinho mais próximo: as
// coordenadas fracionárias (srcX, srcY) são arredondadas para o pixel
// inteiro mais perto. É a interpolação mais simples e mais barata, mas
// produz serrilhado (aliasing) em bordas diagonais e no aumento de escala
//
// coordenadas fora da imagem de origem (pode acontecer na rotação, cujo
// canvas de saída é maior que o de entrada) resultam em um pixel
// totalmente transparente, em vez de repetir a borda como na convolução:
// aqui o "fora da imagem" é de fato fora da imagem rotacionada, e deve
// aparecer como área vazia, não como conteúdo esticado

function sampleNearest(source, srcWidth, srcHeight, srcX, srcY, out, outIdx) {
    const x = Math.round(srcX);
    const y = Math.round(srcY);

    if (x < 0 || x >= srcWidth || y < 0 || y >= srcHeight) {
        out[outIdx + 0] = 0;
        out[outIdx + 1] = 0;
        out[outIdx + 2] = 0;
        out[outIdx + 3] = 0;
        return;
    }

    const srcIdx = (y * srcWidth + x) * 4;
    out[outIdx + 0] = source[srcIdx + 0];
    out[outIdx + 1] = source[srcIdx + 1];
    out[outIdx + 2] = source[srcIdx + 2];
    out[outIdx + 3] = source[srcIdx + 3];
}


// amostra um pixel pela interpolação bilinear: combina os 4 pixels
// inteiros ao redor da coordenada fracionária (srcX, srcY), ponderados
// pela distância a cada um. produz um resultado mais suave que o vizinho
// mais próximo, sem o serrilhado característico
//
// os 4 vizinhos são obtidos por clamping (mesma técnica de "edge
// replication" usada na convolução) para os casos em que x0/y0 ou
// x1/y1 caem fora da imagem por estarem exatamente na borda; porém, se
// o pixel central (x0, y0) já está inteiramente fora da imagem de
// origem (rotação: canto do canvas expandido sem conteúdo correspondente),
// o pixel de saída é transparente, pelo mesmo motivo do vizinho mais
// próximo acima - clampar nesse caso "colaria" a borda da imagem
// original sobre a área vazia, em vez de deixá-la vazia

function sampleBilinear(source, srcWidth, srcHeight, srcX, srcY, out, outIdx) {
    if (srcX < -0.5 || srcX > srcWidth - 0.5 || srcY < -0.5 || srcY > srcHeight - 0.5) {
        out[outIdx + 0] = 0;
        out[outIdx + 1] = 0;
        out[outIdx + 2] = 0;
        out[outIdx + 3] = 0;
        return;
    }

    const x0 = Math.floor(srcX);
    const y0 = Math.floor(srcY);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    // peso fracionário de cada eixo: quanto mais perto de x1/y1, maior
    // o peso desses vizinhos em relação a x0/y0
    const fx = srcX - x0;
    const fy = srcY - y0;

    const cx0 = clamp(x0, 0, srcWidth - 1);
    const cx1 = clamp(x1, 0, srcWidth - 1);
    const cy0 = clamp(y0, 0, srcHeight - 1);
    const cy1 = clamp(y1, 0, srcHeight - 1);

    const idx00 = (cy0 * srcWidth + cx0) * 4;
    const idx10 = (cy0 * srcWidth + cx1) * 4;
    const idx01 = (cy1 * srcWidth + cx0) * 4;
    const idx11 = (cy1 * srcWidth + cx1) * 4;

    // peso bilinear de cada um dos 4 vizinhos (soma sempre 1)
    const w00 = (1 - fx) * (1 - fy);
    const w10 = fx * (1 - fy);
    const w01 = (1 - fx) * fy;
    const w11 = fx * fy;

    for (let channel = 0; channel < 4; channel++) {
        const value =
            source[idx00 + channel] * w00 +
            source[idx10 + channel] * w10 +
            source[idx01 + channel] * w01 +
            source[idx11 + channel] * w11;

        out[outIdx + channel] = Math.round(value);
    }
}


// redimensiona um buffer RGBA de srcWidth x srcHeight para
// dstWidth x dstHeight, usando a interpolação escolhida (interpolation:
// "nearest" ou "bilinear"). para cada pixel de destino, mapeia de volta
// para a coordenada correspondente na imagem de origem (mapeamento
// inverso) e amostra ali - o mapeamento inverso evita buracos no
// resultado, que apareceriam se o mapeamento fosse feito no sentido
// direto (origem -> destino) em uma ampliação

function resizeImageData(source, srcWidth, srcHeight, dstWidth, dstHeight, interpolation) {
    const output = new Uint8ClampedArray(dstWidth * dstHeight * 4);
    const sample = interpolation === "bilinear" ? sampleBilinear : sampleNearest;

    const scaleX = srcWidth / dstWidth;
    const scaleY = srcHeight / dstHeight;

    for (let y = 0; y < dstHeight; y++) {
        // +0.5 / -0.5: amostra o centro do pixel de destino, não o
        // canto superior esquerdo, o que evita um deslocamento de
        // meio pixel sistemático em toda a imagem redimensionada
        const srcY = (y + 0.5) * scaleY - 0.5;

        for (let x = 0; x < dstWidth; x++) {
            const srcX = (x + 0.5) * scaleX - 0.5;
            const outIdx = (y * dstWidth + x) * 4;
            sample(source, srcWidth, srcHeight, srcX, srcY, output, outIdx);
        }
    }

    return output;
}


// rotaciona um buffer RGBA por angleDegrees (sentido horário) ao redor
// do pivô (pivotX, pivotY), dado em coordenadas da imagem de origem. o
// canvas de saída é expandido para caber a imagem inteira, sem cortar
// os cantos: as dimensões de saída são calculadas a partir da caixa
// delimitadora (bounding box) dos 4 cantos da imagem já rotacionados
//
// como o pivô pode estar fora do centro, essa bounding box não é
// necessariamente simétrica ao redor da imagem original, então o
// próprio pivô também precisa ser rotacionado/deslocado junto para
// saber onde ele cai no canvas de saída (outPivotX/outPivotY) - é a
// partir desse pivô de saída que o mapeamento inverso é ancorado

// normaliza um ângulo em graus para cos/sin "limpos": Math.cos/sin de
// múltiplos exatos de 90 graus não retorna 0 e 1 redondos em ponto
// flutuante (ex: cos(90°) ≈ 6.12e-17, não 0), o que faria a bounding
// box calculada em computeRotationGeometry ter um resíduo residual e
// arredondar para 1px a mais em rotações de 90/180/270 graus. o snap
// elimina esse resíduo sem afetar ângulos que não são múltiplos de 90

function snapAngleTrig(angleDegrees) {
    const angleRad = (angleDegrees * Math.PI) / 180;
    let cos = Math.cos(angleRad);
    let sin = Math.sin(angleRad);
    const EPS = 1e-10;
    if (Math.abs(cos) < EPS) cos = 0;
    if (Math.abs(sin) < EPS) sin = 0;
    if (Math.abs(cos - 1) < EPS) cos = 1;
    if (Math.abs(cos + 1) < EPS) cos = -1;
    if (Math.abs(sin - 1) < EPS) sin = 1;
    if (Math.abs(sin + 1) < EPS) sin = -1;
    return { cos, sin };
}


// calcula a geometria de uma rotação sem tocar em nenhum pixel: as
// dimensões do canvas de saída (bounding box dos 4 cantos rotacionados
// ao redor do pivô, sentido horário) e a posição do pivô dentro desse
// canvas de saída (outPivotX/outPivotY). Compartilhada por
// rotateImageData (que também amostra os pixels) e pelas funções de
// conversão de coordenadas usadas para posicionar/arrastar o indicador
// de pivô na prévia (computeRotatedPivotPosition, rotatedPointToBase),
// para as duas nunca divergirem sobre onde o pivô cai

function computeRotationGeometry(srcWidth, srcHeight, angleDegrees, pivotX, pivotY) {
    const { cos, sin } = snapAngleTrig(angleDegrees);

    const corners = [
        [0, 0],
        [srcWidth, 0],
        [0, srcHeight],
        [srcWidth, srcHeight],
    ];

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    corners.forEach(([cx, cy]) => {
        const dx = cx - pivotX;
        const dy = cy - pivotY;
        // rotação de sentido horário (eixo Y da imagem cresce para
        // baixo, então o sinal aqui é invertido em relação à rotação
        // matemática convencional em coordenadas cartesianas)
        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;

        minX = Math.min(minX, rx);
        maxX = Math.max(maxX, rx);
        minY = Math.min(minY, ry);
        maxY = Math.max(maxY, ry);
    });

    const dstWidth = Math.max(1, Math.ceil(maxX - minX));
    const dstHeight = Math.max(1, Math.ceil(maxY - minY));

    // posição do pivô dentro do novo canvas: o pivô original, já
    // rotacionado (que é (0, 0) em relação a si mesmo), fica deslocado
    // por -minX/-minY dentro da bounding box
    const outPivotX = -minX;
    const outPivotY = -minY;

    return { cos, sin, dstWidth, dstHeight, outPivotX, outPivotY };
}


// onde o pivô (pivotX, pivotY, em coordenadas da imagem de origem) cai
// dentro do canvas de saída de uma rotação - usada para posicionar o
// indicador visual sobre a imagem já rotacionada exibida no preview

function computeRotatedPivotPosition(srcWidth, srcHeight, angleDegrees, pivotX, pivotY) {
    const { outPivotX, outPivotY } = computeRotationGeometry(srcWidth, srcHeight, angleDegrees, pivotX, pivotY);
    return { x: outPivotX, y: outPivotY };
}


// converte um ponto (rotatedX, rotatedY) em coordenadas da imagem JÁ
// ROTACIONADA exibida no preview de volta para coordenadas da imagem
// BASE (antes da rotação) - usada ao arrastar o indicador de pivô, já
// que o clique acontece sobre a imagem rotacionada, mas pivotX/pivotY
// internamente são sempre relativos à base (mesma convenção usada por
// rotateImageData). É o mapeamento inverso de computeRotatedPivotPosition
// + a rotação em si, combinados

function rotatedPointToBase(srcWidth, srcHeight, angleDegrees, currentPivotX, currentPivotY, rotatedX, rotatedY) {
    const { cos, sin, outPivotX, outPivotY } = computeRotationGeometry(srcWidth, srcHeight, angleDegrees, currentPivotX, currentPivotY);

    const dx = rotatedX - outPivotX;
    const dy = rotatedY - outPivotY;

    // desfaz a rotação (mesmo mapeamento inverso usado no scan de
    // rotateImageData) para achar o ponto correspondente na base
    const baseXrel = dx * cos + dy * sin;
    const baseYrel = -dx * sin + dy * cos;

    return {
        x: baseXrel + currentPivotX,
        y: baseYrel + currentPivotY,
    };
}


// rotaciona um buffer RGBA por angleDegrees (sentido horário) ao redor
// do pivô (pivotX, pivotY), dado em coordenadas da imagem de origem. o
// canvas de saída é expandido para caber a imagem inteira, sem cortar
// os cantos: as dimensões de saída são calculadas a partir da caixa
// delimitadora (bounding box) dos 4 cantos da imagem já rotacionados
// (ver computeRotationGeometry)

function rotateImageData(source, srcWidth, srcHeight, angleDegrees, pivotX, pivotY, interpolation) {
    const { cos, sin, dstWidth, dstHeight, outPivotX, outPivotY } =
        computeRotationGeometry(srcWidth, srcHeight, angleDegrees, pivotX, pivotY);

    const output = new Uint8ClampedArray(dstWidth * dstHeight * 4);
    const sample = interpolation === "bilinear" ? sampleBilinear : sampleNearest;

    for (let y = 0; y < dstHeight; y++) {
        for (let x = 0; x < dstWidth; x++) {
            // mapeamento inverso: para cada pixel de destino, desfaz a
            // rotação (rotação pelo ângulo oposto) para achar de onde
            // ele veio na imagem de origem
            const dx = x - outPivotX;
            const dy = y - outPivotY;

            const srcXrel = dx * cos + dy * sin;
            const srcYrel = -dx * sin + dy * cos;

            const srcX = srcXrel + pivotX;
            const srcY = srcYrel + pivotY;

            const outIdx = (y * dstWidth + x) * 4;
            sample(source, srcWidth, srcHeight, srcX, srcY, output, outIdx);
        }
    }

    return { width: dstWidth, height: dstHeight, data: output };
}


// substitui originalImg por uma nova imagem (buffer RGBA + dimensões),
// descartando o conteúdo anterior. usada por Escala e Rotação, que são
// ferramentas (não filtros): a transformação é permanente e não entra
// no array layers, mas as camadas de filtro já existentes continuam
// sendo reaplicadas por cima, agora sobre o novo tamanho

async function replaceOriginalImage(width, height, data) {
    originalImg.bitmap.width = width;
    originalImg.bitmap.height = height;
    originalImg.bitmap.data = Buffer.from(data.buffer, data.byteOffset, data.byteLength);

    await rebuildImageFromLayers();
}


// quando uma operação QUE NÃO SEJA a própria janela de Rotação (hoje,
// só a Escala) redimensiona originalImg, rotationState.preImg (a base
// congelada da última rotação aplicada) precisa ser redimensionado na
// mesma proporção, senão ficaria "obsoleto": deixaria de representar
// corretamente "a imagem que, rotacionada por rotationState.angle,
// reproduz o originalImg atual". Sem isso, reabrir a janela de Rotação
// depois de uma Escala e girar de volta a 0° perderia a escala aplicada
// (o ângulo lembrado ficaria certo, mas o tamanho voltaria ao de antes
// da escala) - o usuário quer que o ângulo salvo sempre seja respeitado,
// então é a base que tem que acompanhar as mudanças, não o ângulo que
// deve ser descartado
//
// scaleFactorX/scaleFactorY são a proporção da transformação recém
// aplicada em originalImg (novoTamanho / tamanhoAntigo); o pivô salvo
// (em coordenadas de preImg) é reescalado junto pela mesma proporção

function syncRotationStateWithExternalResize(scaleFactorX, scaleFactorY) {
    if (!rotationState.preImg) return;

    const preImg = rotationState.preImg;
    const oldWidth = preImg.bitmap.width;
    const oldHeight = preImg.bitmap.height;
    const newWidth = Math.max(1, Math.round(oldWidth * scaleFactorX));
    const newHeight = Math.max(1, Math.round(oldHeight * scaleFactorY));

    const source = Uint8ClampedArray.from(preImg.bitmap.data);
    const resized = resizeImageData(source, oldWidth, oldHeight, newWidth, newHeight, "bilinear");

    preImg.bitmap.width = newWidth;
    preImg.bitmap.height = newHeight;
    preImg.bitmap.data = Buffer.from(resized.buffer, resized.byteOffset, resized.byteLength);

    if (rotationState.pivotX !== null) rotationState.pivotX *= scaleFactorX;
    if (rotationState.pivotY !== null) rotationState.pivotY *= scaleFactorY;
}




// ================================================================================================================
// Abrir e salvar imagens
// ================================================================================================================




// carrega o arquivo escolhido pelo usuário como imagem de trabalho,
// reiniciando as camadas aplicadas

imgInput.addEventListener("change", async (event) => {
    const [file] = event.target.files;
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Selecione uma imagem.");
        return;
    }

    imgName = file.name;
    imgInput.value = "";

    try {
        const content = await file.arrayBuffer();
        originalImg = await Jimp.read(content);
        layers = [];

        // nova imagem carregada = nova base "limpa" para rotação, sem
        // histórico de ângulo/pivô da imagem anterior
        rotationState = { preImg: null, angle: 0, pivotX: null, pivotY: null, interpolation: rotationState.interpolation };

        updateLayersPanel();
        setControlEnable(true);

        emptyCanvas.style.display = "none";
        canvas.style.display = "block";

        await rebuildImageFromLayers();
    } catch (err) {
        console.error(err);
        alert("Não foi possível abrir a imagem.");
    }
});




// aplica todas as camadas na imagem original e baixa o resultado como PNG

saveBtn.addEventListener("click", async () => {
    const working = originalImg.clone();
    layers.forEach((layer) => applyFilter(working, layer));

    const base64 = await working.getBase64Async(Jimp.MIME_PNG);

    const link = document.createElement("a");
    link.href = base64;
    link.download = `${imgName}-editada.png`;
    link.click();
});




// ================================================================================================================
// Janela flutuante de preview
// ================================================================================================================




// centraliza a janela na tela, usando suas dimensões reais (offsetWidth/
// offsetHeight); precisa ser chamada com a janela já inserida no DOM, e
// deve ser chamada de novo sempre que o tamanho da janela mudar (ex: ao
// virar fw-wide), pois a centralização inicial fica desatualizada

function centerWindow(win) {
    const width = win.offsetWidth;
    const height = win.offsetHeight;
    win.style.left = `${Math.max(0, (window.innerWidth - width) / 2)}px`;
    win.style.top = `${Math.max(0, (window.innerHeight - height) / 2)}px`;
}




// centraliza a janela na posição (x, y) do cursor

function placeAtCursor(win, x, y) {
    const width = win.offsetWidth;
    win.style.left = `${x - width / 2}px`;
    win.style.top = `${y}px`;
}




// ativa a funcionalidade de arrasto da janela pela sua barra de título

function enableDragging(win, head) {
    head.addEventListener("mousedown", (event) => {
        // fw-close é o botão de fechar da janela; não deve iniciar o arrasto
        if (event.target.closest(".fw-close")) return;

        event.preventDefault();
        placeAtCursor(win, event.clientX, event.clientY);

        const onMove = (moveEvent) => {
            placeAtCursor(win, moveEvent.clientX, moveEvent.clientY);
        };

        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });
}




// cria a estrutura HTML da janela flutuante de preview de um filtro
// (fw = filter window)

function createFilterWindow(title) {
    const win = document.createElement("div");
    win.className = "filter-window";

    win.innerHTML = `
        <div class="fw-head">
            <span>${title}</span>
            <button class="fw-close">x</button>
        </div>
        <div class="fw-body">
            <div class="fw-preview"><span class="loading">Gerando pré-visualização..</span></div>
            <div class="fw-controls"></div>
            <button class="fw-apply">Aplicar</button>
        </div>
    `;

    document.body.appendChild(win);
    centerWindow(win);

    const head = win.querySelector(".fw-head");
    enableDragging(win, head);

    win.querySelector(".fw-close").addEventListener("click", () => {
        win.dispatchEvent(new Event("fw-closed"));
        win.remove();
    });

    return win;
}




// gera o base64 da imagem processada e o exibe na área de preview da janela

let previewToken = 0;

async function showPreview(win, jimpImg) {
    const token = ++previewToken;
    const base64 = await jimpImg.getBase64Async(Jimp.MIME_PNG);

    // ignora o resultado se outro preview foi solicitado enquanto
    // este ainda estava sendo gerado
    if (token !== previewToken) return;

    const preview = win.querySelector(".fw-preview");
    if (!preview) return;

    preview.innerHTML = "";

    const img = document.createElement("img");
    img.src = base64;
    preview.appendChild(img);
}




// ================================================================================================================
// Gráfico de curva de tons
// ================================================================================================================




// tamanho, em pixels, do canvas do gráfico (largura e altura são iguais)
const GRAPH_SIZE = 180;




// expande uma janela de filtro para o layout de duas colunas: preview e
// controles à esquerda (fw-col-main), gráfico à direita (fw-col-curve).
// aboveGraphHtml é inserido acima do gráfico (ex: abas de canal);
// insideGraphHtml é inserido dentro do .fw-curve, sobre o canvas
// (ex: um ponto arrastável, que precisa de position:absolute relativo a ela)

function createFilterGraph(win, aboveGraphHtml = "", insideGraphHtml = "") {
    win.classList.add("fw-wide");

    const body = win.querySelector(".fw-body");
    body.classList.add("fw-body-split");

    const mainColumn = document.createElement("div");
    mainColumn.className = "fw-col-main";
    mainColumn.appendChild(win.querySelector(".fw-preview"));
    mainColumn.appendChild(win.querySelector(".fw-controls"));
    mainColumn.appendChild(win.querySelector(".fw-apply"));

    const graphColumn = document.createElement("div");
    graphColumn.className = "fw-col-curve";
    graphColumn.innerHTML = `
        ${aboveGraphHtml}
        <div class="fw-curve">
            <canvas width="${GRAPH_SIZE}" height="${GRAPH_SIZE}"></canvas>
            ${insideGraphHtml}
        </div>
    `;

    body.appendChild(mainColumn);
    body.appendChild(graphColumn);

    centerWindow(win);

    const graphBox = graphColumn.querySelector(".fw-curve");
    const graphCanvas = graphColumn.querySelector("canvas");

    return {
        mainColumn,
        graphColumn,
        graphBox,
        graphCanvas,
        controls: mainColumn.querySelector(".fw-controls"),
        toCanvasXY,
        toImageXY,
    };
}




// converte um ponto em coordenadas de imagem (0-255) para pixels do canvas
// do gráfico; o eixo y é invertido, pois telas crescem para baixo e
// gráficos de tons crescem para cima

function toCanvasXY(point) {
    return {
        px: (point.x / 255) * GRAPH_SIZE,
        py: GRAPH_SIZE - (point.y / 255) * GRAPH_SIZE,
    };
}




// converte um ponto em pixels do canvas do gráfico para coordenadas
// de imagem (0-255), limitando o resultado à faixa válida

function toImageXY(px, py) {
    const x = Math.round(clamp(px / GRAPH_SIZE * 255, 0, 255));
    const y = Math.round(clamp(255 - py / GRAPH_SIZE * 255, 0, 255));
    return { x, y };
}




// desenha a diagonal pontilhada de referência (y = x, sem alteração
// nenhuma), usada como pano de fundo em todo gráfico de tons

function drawIdentityLine(ctx) {
    ctx.strokeStyle = "#333333";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, GRAPH_SIZE);
    ctx.lineTo(GRAPH_SIZE, 0);
    ctx.stroke();
    ctx.setLineDash([]);
}


// ================================================================================================================
// Botões de filtro
// ================================================================================================================




negativeBtn.addEventListener("click", () => {
    const win = createFilterWindow("Negativo");

    // aplica todos os filtros já em uso e, por cima, o efeito
    // sendo configurado, só para fins de visualização
    const preview = originalImg.clone();
    layers.forEach((layer) => applyFilter(preview, layer));
    applyFilter(preview, { type: "negative" });
    showPreview(win, preview);

    win.querySelector(".fw-apply").addEventListener("click", () => {
        layers.push({ label: "Negativo", type: "negative" });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


thresholdBtn.addEventListener("click", () => {
    const win = createFilterWindow("Limiarização");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label> Limiarização </label>
            <input class="fw-value" type="number" min="0" max="255" value="128">
        </div>
        <input type="range" min="0" max="255" value="128">
    </div>
    `;

    const range = controls.querySelector('input[type="range"]');
    const valueInput = controls.querySelector('input[type="number"]');

    function updateThresholdPreview() {
        const thresholdValue = Number(range.value);
        valueInput.value = thresholdValue;

        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "threshold", value: thresholdValue });
        showPreview(win, preview);
    }

    range.addEventListener("input", updateThresholdPreview);

    valueInput.addEventListener("input", () => {
        const typed = clamp(Number(valueInput.value), 0, 255);
        range.value = typed;
        updateThresholdPreview();
    });

    updateThresholdPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const thresholdValue = Number(range.value);
        layers.push({ label: `Limiarização (${thresholdValue})`, type: "threshold", value: thresholdValue });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


brightnessBtn.addEventListener("click", () => {
    const win = createFilterWindow("Brilho");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label> Brilho </label>
            <input class="fw-value" type="number" min="-255" max="255" value="0">
        </div>
        <input type="range" min="-255" max="255" value="0">
    </div>
    `;

    const range = controls.querySelector('input[type="range"]');
    const valueInput = controls.querySelector('input[type="number"]');

    function updateBrightnessPreview() {
        const brightnessValue = Number(range.value);
        valueInput.value = brightnessValue;

        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "brightness", value: brightnessValue });
        showPreview(win, preview);
    }

    range.addEventListener("input", updateBrightnessPreview);

    valueInput.addEventListener("input", () => {
        const typed = clamp(Number(valueInput.value), -255, 255);
        range.value = typed;
        updateBrightnessPreview();
    });

    updateBrightnessPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const brightnessValue = Number(range.value);
        layers.push({ label: "Brilho", type: "brightness", value: brightnessValue });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


gammaBtn.addEventListener("click", () => {
    const win = createFilterWindow("Correção de gama");

    const { controls, graphBox, graphCanvas } = createFilterGraph(win, "", `<div class="fw-curve-handle"></div>`);
    const handle = graphBox.querySelector(".fw-curve-handle");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label> Gama <span class="fw-gamma-value">(γ = 1.00)</span></label>
            <input class="fw-value" type="number" min="-100" max="100" value="0">
        </div>
        <input type="range" min="-100" max="100" value="0">
    </div>
    `;

    const range = controls.querySelector('input[type="range"]');
    const valueInput = controls.querySelector('input[type="number"]');
    const gammaReadout = controls.querySelector(".fw-gamma-value");




    // converte o valor do slider (-100 a 100) em gama (0.5 a 2)

    function sliderToGamma(slider) {
        return Math.pow(2, slider / 100);
    }




    // converte um valor de gama (0.5 a 2) de volta para o slider (-100 a 100)

    function gammaToSlider(gamma) {
        return Math.round(100 * Math.log2(gamma));
    }




    // desenha a curva de tons y = x^(1/gama) sobre a diagonal de referência

    function drawGammaCurve(gamma) {
        const ctx = graphCanvas.getContext("2d");
        const invGamma = 1 / gamma;

        ctx.clearRect(0, 0, GRAPH_SIZE, GRAPH_SIZE);
        drawIdentityLine(ctx);

        ctx.strokeStyle = "#8b06e9";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let px = 0; px <= GRAPH_SIZE; px++) {
            const x = px / GRAPH_SIZE;
            const y = Math.pow(x, invGamma);
            const py = GRAPH_SIZE - y * GRAPH_SIZE;
            if (px === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
    }




    // posiciona o ponto arrastável no meio da curva

    function placeHandle(gamma) {
        const x = 0.5;
        const y = Math.pow(x, 1 / gamma);
        handle.style.left = `${x * 100}%`;
        handle.style.top = `${(1 - y) * 100}%`;
    }




    // recalcula a curva, o preview e a posição do ponto arrastável
    // a partir do valor atual do slider

    function updateGammaPreview() {
        const sliderValue = Number(range.value);
        const gamma = sliderToGamma(sliderValue);

        valueInput.value = sliderValue;
        gammaReadout.textContent = `(γ = ${gamma.toFixed(2)})`;

        drawGammaCurve(gamma);
        placeHandle(gamma);

        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "gamma", value: gamma });
        showPreview(win, preview);
    }

    range.addEventListener("input", updateGammaPreview);

    valueInput.addEventListener("input", () => {
        const typed = clamp(Number(valueInput.value), -100, 100);
        range.value = typed;
        updateGammaPreview();
    });




    // arrasto do ponto sobre a curva de tons: recalcula o gama a partir
    // da posição normalizada (0-1) do ponto dentro do gráfico

    handle.addEventListener("mousedown", (event) => {
        event.preventDefault();

        const onMove = (moveEvent) => {
            const rect = graphBox.getBoundingClientRect();

            let x = (moveEvent.clientX - rect.left) / rect.width;
            let y = 1 - (moveEvent.clientY - rect.top) / rect.height;

            x = clamp(x, 0.02, 0.98);
            y = clamp(y, 0.02, 0.98);

            // inverte y = x^(1/gama) para descobrir o gama do ponto arrastado
            const gamma = clamp(Math.log(x) / Math.log(y), 0.5, 2);

            range.value = gammaToSlider(gamma);
            updateGammaPreview();
        };

        const cleanup = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", cleanup);
            win.removeEventListener("fw-closed", cleanup);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", cleanup);
        win.addEventListener("fw-closed", cleanup);
    });

    updateGammaPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const gamma = sliderToGamma(Number(range.value));
        layers.push({ label: `Gama (γ = ${gamma.toFixed(2)})`, type: "gamma", value: gamma });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});

// ================================================================================

linearBtn.addEventListener("click", () => {
    const win = createFilterWindow("Função linear por partes");

    const channelTabsHtml = `
        <div class="fw-channel-tabs">
            <button type="button" class="fw-channel-tab active" data-channel="r">R</button>
            <button type="button" class="fw-channel-tab" data-channel="g">G</button>
            <button type="button" class="fw-channel-tab" data-channel="b">B</button>
        </div>
    `;

    const { controls, graphBox, graphCanvas, graphColumn } = createFilterGraph(win, channelTabsHtml);
    graphColumn.insertAdjacentHTML(
        "beforeend",
        `<div class="fw-curve-hint">Clique na curva para adicionar um ponto. Clique com o botão direito num ponto para removê-lo.</div>`
    );

    controls.innerHTML = `<div class="fw-point-fields"></div>`;
    const pointFields = controls.querySelector(".fw-point-fields");
    const channelTabs = [...graphColumn.querySelectorAll(".fw-channel-tab")];

    const CHANNEL_COLORS = { r: "#e05a4a", g: "#4ac26a", b: "#4a8ce0" };




    // cada canal começa com os dois pontos extremos (identidade: y = x)

    function defaultPoints() {
        return [{ x: 0, y: 0 }, { x: 255, y: 255 }];
    }

    const pointsByChannel = {
        r: defaultPoints(),
        g: defaultPoints(),
        b: defaultPoints(),
    };

    let activeChannel = "r";
    let draggingPoint = null;

    function currentPoints() {
        return pointsByChannel[activeChannel];
    }




    // limita o x de um ponto para não ultrapassar seus vizinhos imediatos
    // (impede segmentos de largura zero ou pontos fora de ordem)

    function clampPointX(point, desiredX) {
        const sorted = [...currentPoints()].sort((a, b) => a.x - b.x);
        const posIndex = sorted.indexOf(point);

        if (posIndex === 0 || posIndex === sorted.length - 1) {
            return point.x; // pontos extremos não mudam de x
        }

        const prevX = sorted[posIndex - 1].x;
        const nextX = sorted[posIndex + 1].x;

        if (nextX - prevX <= 2) {
            return point.x; // sem espaço entre os vizinhos, não move
        }

        return clamp(desiredX, prevX + 1, nextX - 1);
    }




    // desenha a curva do canal ativo (segmentos entre pontos) e seus
    // pontos de controle, sobre a diagonal de referência

    function drawChannelCurve() {
        const ctx = graphCanvas.getContext("2d");
        ctx.clearRect(0, 0, GRAPH_SIZE, GRAPH_SIZE);
        drawIdentityLine(ctx);

        const sorted = [...currentPoints()].sort((a, b) => a.x - b.x);
        const channelColor = CHANNEL_COLORS[activeChannel];

        ctx.strokeStyle = channelColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        sorted.forEach((point, i) => {
            const { px, py } = toCanvasXY(point);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.stroke();

        sorted.forEach((point) => {
            const { px, py } = toCanvasXY(point);
            ctx.fillStyle = channelColor;
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#080808";
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }




    // cria a linha de campos numéricos (x, y) de um ponto de controle;
    // pontos extremos têm o campo x travado, pois seu x é fixo (0 ou 255)

    function createPointField(point, isEdge) {
        const row = document.createElement("div");
        row.className = "fw-control";

        row.innerHTML = `
        <div class="fw-control-header">
            <label>Ponto (x, y)</label>
        </div>
        <div class="fw-point-row">
            <input class="fw-value" type="number" min="0" max="255" value="${point.x}" ${isEdge ? "disabled" : ""}>
            <span class="fw-point-sep">,</span>
            <input class="fw-value" type="number" min="0" max="255" value="${point.y}">
            <button type="button" class="fw-point-remove" ${isEdge ? "disabled" : ""} title="Remover ponto">x</button>
        </div>
        `;

        const [xInput, yInput] = row.querySelectorAll("input");
        const removeBtn = row.querySelector(".fw-point-remove");

        xInput.addEventListener("input", () => {
            const desiredX = clamp(Number(xInput.value), 0, 255);
            point.x = clampPointX(point, desiredX);
            // mudar x pode reordenar os pontos, então os campos precisam
            // ser reconstruídos (perde o foco, mas evita lista desalinhada)
            refresh();
        });

        yInput.addEventListener("input", () => {
            point.y = clamp(Number(yInput.value), 0, 255);
            refreshCurveAndPreview();
        });

        removeBtn.addEventListener("click", () => {
            const points = currentPoints();
            const idx = points.indexOf(point);
            if (idx !== -1) points.splice(idx, 1);
            refresh();
        });

        return row;
    }




    // reconstrói toda a lista de campos numéricos a partir dos pontos
    // do canal ativo, ordenados por x

    function updatePointFields() {
        pointFields.innerHTML = "";
        const sorted = [...currentPoints()].sort((a, b) => a.x - b.x);
        sorted.forEach((point, i) => {
            const isEdge = i === 0 || i === sorted.length - 1;
            pointFields.appendChild(createPointField(point, isEdge));
        });
    }




    // aplica a função linear por partes dos três canais sobre a imagem
    // já processada pelas camadas existentes, só para fins de preview

    function updateLinearPreview() {
        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, {
            type: "linear",
            pointsR: pointsByChannel.r,
            pointsG: pointsByChannel.g,
            pointsB: pointsByChannel.b,
        });
        showPreview(win, preview);
    }




    // atualização completa: redesenha a curva, reconstrói os campos
    // numéricos e recalcula o preview

    function refresh() {
        drawChannelCurve();
        updatePointFields();
        updateLinearPreview();
    }




    // usado quando o valor de um ponto muda por um campo numérico:
    // não reconstrói os campos, para não roubar o foco de quem está digitando

    function refreshCurveAndPreview() {
        drawChannelCurve();
        updateLinearPreview();
    }

    channelTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            channelTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            activeChannel = tab.dataset.channel;
            refresh();
        });
    });




    // encontra o ponto de controle mais próximo de (px, py), dentro de
    // um raio de tolerância; usado para decidir se um clique seleciona
    // um ponto existente ou cria um novo

    function findNearbyPoint(px, py) {
        let closestPoint = null;
        let closestDist = Infinity;

        currentPoints().forEach((point) => {
            const canvasPos = toCanvasXY(point);
            const dist = Math.hypot(canvasPos.px - px, canvasPos.py - py);
            if (dist < closestDist) {
                closestDist = dist;
                closestPoint = point;
            }
        });

        return closestDist <= 10 ? closestPoint : null;
    }




    graphCanvas.addEventListener("mousedown", (event) => {
        const rect = graphBox.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;

        const existingPoint = findNearbyPoint(px, py);

        if (existingPoint) {
            draggingPoint = existingPoint;
            return;
        }

        // clique em área vazia da curva: cria um novo ponto de controle
        const { x, y } = toImageXY(px, py);
        const newPoint = { x, y };
        currentPoints().push(newPoint);
        newPoint.x = clampPointX(newPoint, x);
        draggingPoint = newPoint;
        refresh();
    });

    graphCanvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const rect = graphBox.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;

        const points = currentPoints();
        const target = findNearbyPoint(px, py);
        if (!target) return;

        const sorted = [...points].sort((a, b) => a.x - b.x);
        const isEdge = target === sorted[0] || target === sorted[sorted.length - 1];
        if (isEdge) return;

        const idx = points.indexOf(target);
        if (idx !== -1) points.splice(idx, 1);
        refresh();
    });

    const onMove = (event) => {
        if (!draggingPoint) return;

        const rect = graphBox.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        const { x, y } = toImageXY(px, py);

        draggingPoint.x = clampPointX(draggingPoint, x);
        draggingPoint.y = y;

        refresh();
    };

    const onUp = () => {
        draggingPoint = null;
    };

    const cleanup = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        win.removeEventListener("fw-closed", cleanup);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    win.addEventListener("fw-closed", cleanup);

    refresh();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        layers.push({
            label: "Linear por partes",
            type: "linear",
            pointsR: pointsByChannel.r.map((p) => ({ ...p })),
            pointsG: pointsByChannel.g.map((p) => ({ ...p })),
            pointsB: pointsByChannel.b.map((p) => ({ ...p })),
        });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


histogramBtn.addEventListener("click", () => {
    const win = createFilterWindow("Histograma");

    // esta janela é só de visualização: não mostra a imagem (ela já está
    // visível na área de trabalho principal) nem gera camada nenhuma,
    // então tanto a preview quanto o botão "Aplicar" (herdados do layout
    // padrão) são removidos
    win.querySelector(".fw-preview").remove();
    win.querySelector(".fw-apply").remove();

    const controls = win.querySelector(".fw-controls");
    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Canal</label>
        </div>
        <div class="fw-channel-tabs">
            <button type="button" class="fw-channel-tab active" data-channel="luminance">Luminância</button>
            <button type="button" class="fw-channel-tab" data-channel="r">R</button>
            <button type="button" class="fw-channel-tab" data-channel="g">G</button>
            <button type="button" class="fw-channel-tab" data-channel="b">B</button>
        </div>
    </div>
    <div class="fw-histogram-canvas-wrap">
        <canvas class="fw-histogram-canvas" width="400" height="160"></canvas>
    </div>
    `;

    const channelTabs = [...controls.querySelectorAll(".fw-channel-tab")];
    const histCanvas = controls.querySelector(".fw-histogram-canvas");

    const CHANNEL_COLORS = { luminance: "#e0e0e0", r: "#e05a4a", g: "#4ac26a", b: "#4a8ce0" };

    let activeChannel = "luminance";

    // imagem com as camadas já aplicadas: o histograma exibido reflete
    // o resultado atual, não a imagem original sem edições
    const current = originalImg.clone();
    layers.forEach((layer) => applyFilter(current, layer));
    const histograms = computeHistograms(current);

    function redrawHistogram() {
        drawHistogramBars(histCanvas, histograms[activeChannel], CHANNEL_COLORS[activeChannel]);
    }

    channelTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            channelTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            activeChannel = tab.dataset.channel;
            redrawHistogram();
        });
    });

    // a remoção da preview muda a altura da janela; recentraliza com
    // o tamanho final já estabilizado
    centerWindow(win);
    redrawHistogram();
});




// ================================================================================


histogramEqBtn.addEventListener("click", () => {
    const win = createFilterWindow("Equalização de histograma");
    win.classList.add("fw-wide");

    // reorganiza o layout padrão (uma coluna) em duas colunas: dados de
    // equalização (modo + histograma resultante) à esquerda, imagem à
    // direita — mesmo esquema de fw-col-main / fw-col-curve usado no
    // gráfico de tons, mas com a coluna direita mostrando a imagem
    // em vez de uma curva
    const body = win.querySelector(".fw-body");
    body.classList.add("fw-body-split");

    const preview = win.querySelector(".fw-preview");
    const controls = win.querySelector(".fw-controls");
    const applyBtn = win.querySelector(".fw-apply");

    const dataColumn = document.createElement("div");
    dataColumn.className = "fw-col-main";
    dataColumn.appendChild(controls);
    dataColumn.appendChild(applyBtn);

    const imageColumn = document.createElement("div");
    imageColumn.className = "fw-col-image";
    imageColumn.appendChild(preview);

    body.appendChild(dataColumn);
    body.appendChild(imageColumn);

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Modo</label>
        </div>
        <div class="fw-channel-tabs">
            <button type="button" class="fw-channel-tab active" data-mode="luminance">Luminância</button>
            <button type="button" class="fw-channel-tab" data-mode="channels">Canais (R, G, B)</button>
        </div>
    </div>
    <div class="fw-histogram-canvas-wrap">
        <canvas class="fw-histogram-canvas fw-histogram-canvas-compact" width="400" height="160"></canvas>
    </div>
    `;

    const modeTabs = [...controls.querySelectorAll(".fw-channel-tab")];
    const histCanvas = controls.querySelector(".fw-histogram-canvas");

    let mode = "luminance";

    function updateHistogramEqPreview() {
        const previewImg = originalImg.clone();
        layers.forEach((layer) => applyFilter(previewImg, layer));
        applyFilter(previewImg, { type: "histogram-eq", mode });
        showPreview(win, previewImg);

        // recalcula o histograma sobre o resultado já equalizado, para
        // mostrar o efeito da equalização (distribuição mais uniforme)
        const { luminance } = computeHistograms(previewImg);
        drawHistogramBars(histCanvas, luminance, "#e0e0e0");
    }

    modeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            modeTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            mode = tab.dataset.mode;
            updateHistogramEqPreview();
        });
    });

    // o layout de duas colunas muda as dimensões da janela (fw-wide);
    // recentraliza com o tamanho final já estabilizado
    centerWindow(win);
    updateHistogramEqPreview();

    applyBtn.addEventListener("click", () => {
        const label = mode === "channels" ? "Equalização (canais)" : "Equalização (luminância)";
        layers.push({ label, type: "histogram-eq", mode });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


steganographyBtn.addEventListener("click", () => {
    const win = createFilterWindow("Esteganografia");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Texto a ocultar</label>
        </div>
        <textarea class="fw-textarea" rows="4" placeholder="Digite a mensagem.."></textarea>
        <div class="fw-stego-capacity"></div>
    </div>
    <div class="fw-control">
        <button type="button" class="fw-reveal-btn">Revelar texto desta imagem</button>
        <div class="fw-stego-revealed"></div>
    </div>
    `;

    const textarea = controls.querySelector(".fw-textarea");
    const capacityLabel = controls.querySelector(".fw-stego-capacity");
    const revealBtn = controls.querySelector(".fw-reveal-btn");
    const revealedBox = controls.querySelector(".fw-stego-revealed");

    // capacidade máxima de bits é um por pixel; cada byte de texto usa 8
    // bits mais 16 bits fixos do terminador; caracteres acentuados ou
    // especiais podem ocupar mais de um byte em UTF-8
    const maxBytes = Math.floor((originalImg.bitmap.width * originalImg.bitmap.height - 16) / 8);
    capacityLabel.textContent = `Capacidade aproximada: ${maxBytes} caracteres (menos se houver acentos ou símbolos)`;




    // mostra a imagem já com as camadas atuais aplicadas, sem nenhuma
    // mudança nova; a esteganografia não tem efeito visível, então o
    // preview serve só para confirmar que a imagem está correta

    function updateStegoPreview() {
        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        showPreview(win, preview);
    }

    updateStegoPreview();




    revealBtn.addEventListener("click", async () => {
        revealedBox.textContent = "Lendo..";

        try {
            const current = originalImg.clone();
            layers.forEach((layer) => applyFilter(current, layer));
            const message = revealMessage(current);

            revealedBox.textContent = message
                ? `Mensagem encontrada: "${message}"`
                : "Nenhuma mensagem encontrada nesta imagem.";
        } catch (err) {
            console.error(err);
            revealedBox.textContent = "Não foi possível ler uma mensagem desta imagem.";
        }
    });

    win.querySelector(".fw-apply").addEventListener("click", async () => {
        const text = textarea.value;

        if (!text) {
            alert("Digite um texto para ocultar.");
            return;
        }

        const byteLength = new TextEncoder().encode(text).length;
        if (byteLength > maxBytes) {
            alert("Texto longo demais para esta imagem.");
            return;
        }

        const newLayer = { label: "Esteganografia", type: "steganography", value: text };

        try {
            // valida a camada isoladamente antes de adicioná-la à lista,
            // para não deixar uma camada inválida na interface em caso de erro
            await applyFilter(originalImg.clone(), newLayer);
        } catch (err) {
            console.error(err);
            alert(err.message);
            return;
        }

        layers.push(newLayer);
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================




smoothingBtn.addEventListener("click", () => {
    const win = createFilterWindow("Suavização");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Tipo</label>
        </div>
        <div class="fw-channel-tabs" id="smooth-mode-tabs">
            <button type="button" class="fw-channel-tab active" data-mode="mean">Média simples</button>
            <button type="button" class="fw-channel-tab" data-mode="gaussian">Gaussiano</button>
        </div>
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Tamanho</label>
        </div>
        <div class="fw-channel-tabs" id="smooth-size-tabs">
            <button type="button" class="fw-channel-tab active" data-size="3">3x3</button>
            <button type="button" class="fw-channel-tab" data-size="5">5x5</button>
            <button type="button" class="fw-channel-tab" data-size="7">7x7</button>
            <button type="button" class="fw-channel-tab" data-size="9">9x9</button>
        </div>
    </div>
    `;

    const modeTabs = [...controls.querySelectorAll("#smooth-mode-tabs .fw-channel-tab")];
    const sizeTabs = [...controls.querySelectorAll("#smooth-size-tabs .fw-channel-tab")];

    let mode = "mean";
    let size = 3;

    // a suavização em kernels grandes tem o mesmo custo da convolução
    // genérica, então usa o mesmo debounce de 150ms para manter a
    // interface responsiva enquanto o usuário alterna as abas
    let previewTimeout = null;

    function scheduleSmoothingPreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(updateSmoothingPreview, 150);
    }

    win.addEventListener("fw-closed", () => clearTimeout(previewTimeout));

    function updateSmoothingPreview() {
        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "smoothing", mode, size });
        showPreview(win, preview);
    }

    modeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            modeTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            mode = tab.dataset.mode;
            scheduleSmoothingPreview();
        });
    });

    sizeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            sizeTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            size = Number(tab.dataset.size);
            scheduleSmoothingPreview();
        });
    });

    updateSmoothingPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const label = mode === "gaussian" ? `Suavização Gaussiana (${size}x${size})` : `Suavização - Média (${size}x${size})`;
        layers.push({ label, type: "smoothing", mode, size });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


medianBtn.addEventListener("click", () => {
    const win = createFilterWindow("Filtragem pela mediana");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Tamanho</label>
        </div>
        <div class="fw-channel-tabs" id="median-size-tabs">
            <button type="button" class="fw-channel-tab active" data-size="3">3x3</button>
            <button type="button" class="fw-channel-tab" data-size="5">5x5</button>
            <button type="button" class="fw-channel-tab" data-size="7">7x7</button>
            <button type="button" class="fw-channel-tab" data-size="9">9x9</button>
        </div>
    </div>
    `;

    const sizeTabs = [...controls.querySelectorAll("#median-size-tabs .fw-channel-tab")];
    let size = 3;

    // mesmo raciocínio de debounce da suavização/convolução: a mediana
    // em janelas grandes ordena bastante dado por pixel e fica pesada
    let previewTimeout = null;

    function scheduleMedianPreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(updateMedianPreview, 150);
    }

    win.addEventListener("fw-closed", () => clearTimeout(previewTimeout));

    function updateMedianPreview() {
        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "median", size });
        showPreview(win, preview);
    }

    sizeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            sizeTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            size = Number(tab.dataset.size);
            scheduleMedianPreview();
        });
    });

    updateMedianPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        layers.push({ label: `Mediana (${size}x${size})`, type: "median", size });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


laplacianSharpenBtn.addEventListener("click", () => {
    const win = createFilterWindow("Aguçamento Laplaciano");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Conectividade</label>
        </div>
        <div class="fw-channel-tabs" id="lap-connectivity-tabs">
            <button type="button" class="fw-channel-tab active" data-connectivity="4">4-conectado</button>
            <button type="button" class="fw-channel-tab" data-connectivity="8">8-conectado</button>
        </div>
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Intensidade</label>
            <input class="fw-value" type="number" min="0" max="3" step="0.1" value="1">
        </div>
        <input type="range" min="0" max="3" step="0.1" value="1">
    </div>
    `;

    const connectivityTabs = [...controls.querySelectorAll("#lap-connectivity-tabs .fw-channel-tab")];
    const range = controls.querySelector('input[type="range"]');
    const valueInput = controls.querySelector('input[type="number"]');

    let connectivity = "4";

    // filtro barato (kernel 3x3 fixo); não precisa de debounce como a
    // suavização/mediana em janelas grandes
    function updateLaplacianPreview() {
        const amount = Number(range.value);
        valueInput.value = amount;

        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "laplacian-sharpen", connectivity, amount });
        showPreview(win, preview);
    }

    connectivityTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            connectivityTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            connectivity = tab.dataset.connectivity;
            updateLaplacianPreview();
        });
    });

    range.addEventListener("input", updateLaplacianPreview);

    valueInput.addEventListener("input", () => {
        const typed = clamp(Number(valueInput.value), 0, 3);
        range.value = typed;
        updateLaplacianPreview();
    });

    updateLaplacianPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const amount = Number(range.value);
        layers.push({
            label: `Aguçamento Laplaciano (${connectivity}-conectado, ${amount})`,
            type: "laplacian-sharpen",
            connectivity,
            amount,
        });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


highBoostBtn.addEventListener("click", () => {
    const win = createFilterWindow("Aguçamento High-Boost");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Amplificação (A)</label>
            <input class="fw-value" type="number" min="1" max="5" step="0.1" value="1.5">
        </div>
        <input type="range" min="1" max="5" step="0.1" value="1.5">
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Suavização usada na máscara</label>
        </div>
        <div class="fw-channel-tabs" id="hb-blur-mode-tabs">
            <button type="button" class="fw-channel-tab active" data-mode="mean">Média simples</button>
            <button type="button" class="fw-channel-tab" data-mode="gaussian">Gaussiano</button>
        </div>
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Tamanho da suavização</label>
        </div>
        <div class="fw-channel-tabs" id="hb-blur-size-tabs">
            <button type="button" class="fw-channel-tab active" data-size="3">3x3</button>
            <button type="button" class="fw-channel-tab" data-size="5">5x5</button>
            <button type="button" class="fw-channel-tab" data-size="7">7x7</button>
            <button type="button" class="fw-channel-tab" data-size="9">9x9</button>
        </div>
    </div>
    `;

    const range = controls.querySelector('input[type="range"]');
    const valueInput = controls.querySelector('input[type="number"]');
    const blurModeTabs = [...controls.querySelectorAll("#hb-blur-mode-tabs .fw-channel-tab")];
    const blurSizeTabs = [...controls.querySelectorAll("#hb-blur-size-tabs .fw-channel-tab")];

    let blurMode = "mean";
    let blurSize = 3;

    // gera uma convolução completa por preview (para produzir a máscara
    // borrada), então usa o mesmo debounce de 150ms da convolução/
    // suavização/mediana para não travar a interface a cada mudança
    let previewTimeout = null;

    function scheduleHighBoostPreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(updateHighBoostPreview, 150);
    }

    win.addEventListener("fw-closed", () => clearTimeout(previewTimeout));

    function updateHighBoostPreview() {
        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "high-boost", amplification: Number(range.value), blurMode, blurSize });
        showPreview(win, preview);
    }

    // o campo numérico precisa refletir o slider no mesmo evento (sem
    // esperar o debounce), senão fica visivelmente atrasado enquanto o
    // usuário arrasta; só o preview (mais custoso, por rodar uma
    // convolução completa) é adiado pelo debounce
    range.addEventListener("input", () => {
        valueInput.value = range.value;
        scheduleHighBoostPreview();
    });

    valueInput.addEventListener("input", () => {
        const typed = clamp(Number(valueInput.value), 1, 5);
        range.value = typed;
        scheduleHighBoostPreview();
    });

    blurModeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            blurModeTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            blurMode = tab.dataset.mode;
            scheduleHighBoostPreview();
        });
    });

    blurSizeTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            blurSizeTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            blurSize = Number(tab.dataset.size);
            scheduleHighBoostPreview();
        });
    });

    updateHighBoostPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const amplification = Number(range.value);
        layers.push({
            label: `High-Boost (A=${amplification})`,
            type: "high-boost",
            amplification,
            blurMode,
            blurSize,
        });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


sobelBtn.addEventListener("click", () => {
    const win = createFilterWindow("Sobel (X / Y)");
    const controls = win.querySelector(".fw-controls");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Direção</label>
        </div>
        <div class="fw-channel-tabs" id="sobel-direction-tabs">
            <button type="button" class="fw-channel-tab active" data-direction="x">Gx (horizontal)</button>
            <button type="button" class="fw-channel-tab" data-direction="y">Gy (vertical)</button>
        </div>
    </div>
    `;

    const directionTabs = [...controls.querySelectorAll("#sobel-direction-tabs .fw-channel-tab")];
    let direction = "x";

    // filtro barato (kernel 3x3 fixo, sem laço de convolução genérica
    // com kernels grandes); não precisa de debounce
    function updateSobelPreview() {
        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "sobel", direction });
        showPreview(win, preview);
    }

    directionTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            directionTabs.forEach((t) => t.classList.remove("active"));
            tab.classList.add("active");
            direction = tab.dataset.direction;
            updateSobelPreview();
        });
    });

    updateSobelPreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const label = direction === "y" ? "Sobel (Gy - vertical)" : "Sobel (Gx - horizontal)";
        layers.push({ label, type: "sobel", direction });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================


sobelMagnitudeBtn.addEventListener("click", () => {
    const win = createFilterWindow("Detecção de bordas (gradiente)");
    const controls = win.querySelector(".fw-controls");

    // filtro sem parâmetros: combina Gx e Gy pela magnitude do gradiente,
    // então a janela só mostra a pré-visualização e o botão de aplicar
    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Magnitude do gradiente</label>
        </div>
        <span class="fw-curve-hint">Combina Sobel Gx e Gy por sqrt(Gx² + Gy²), destacando bordas em qualquer direção.</span>
    </div>
    `;

    function updateSobelMagnitudePreview() {
        const preview = originalImg.clone();
        layers.forEach((layer) => applyFilter(preview, layer));
        applyFilter(preview, { type: "sobel-magnitude" });
        showPreview(win, preview);
    }

    updateSobelMagnitudePreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        layers.push({ label: "Detecção de bordas (gradiente Sobel)", type: "sobel-magnitude" });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================




// conjunto de kernels pré-definidos, oferecidos como ponto de partida
// para o usuário; cada preset é normalizado pela soma dos seus pesos em
// applyConvolution, exceto os detectores de borda (soma zero)

const CONVOLUTION_PRESETS = {
    identity: {
        label: "Identidade",
        size: 3,
        kernel: [
            0, 0, 0,
            0, 1, 0,
            0, 0, 0,
        ],
    },
    mean: {
        label: "Média (borrão)",
        size: 3,
        kernel: [
            1, 1, 1,
            1, 1, 1,
            1, 1, 1,
        ],
    },
    gaussian: {
        label: "Gaussiano",
        size: 3,
        kernel: [
            1, 2, 1,
            2, 4, 2,
            1, 2, 1,
        ],
    },
    sharpen: {
        label: "Nitidez",
        size: 3,
        kernel: [
             0, -1,  0,
            -1,  5, -1,
             0, -1,  0,
        ],
    },
    edges: {
        label: "Detecção de bordas",
        size: 3,
        kernel: [
            -1, -1, -1,
            -1,  8, -1,
            -1, -1, -1,
        ],
    },
    emboss: {
        label: "Relevo",
        size: 3,
        kernel: [
            -2, -1, 0,
            -1,  1, 1,
             0,  1, 2,
        ],
    },
};




// gera um kernel identidade (todos os pesos zero, exceto o pixel
// central) para um tamanho size qualquer; usado ao trocar de tamanho
// e ao escolher o preset "Identidade" em tamanhos maiores que 3x3,
// já que os presets acima só têm valores fixos para 3x3

function buildIdentityKernel(size) {
    const kernel = new Array(size * size).fill(0);
    const centerIndex = Math.floor(size / 2) * size + Math.floor(size / 2);
    kernel[centerIndex] = 1;
    return kernel;
}




convolutionBtn.addEventListener("click", () => {
    const win = createFilterWindow("Convolução");
    // fw-convolution (em vez de fw-wide) reserva espaço suficiente para
    // o maior kernel possível (9x9) sem que a grade de pesos precise
    // de scroll nem vaze sobre a coluna da imagem
    win.classList.add("fw-convolution");

    const body = win.querySelector(".fw-body");
    body.classList.add("fw-body-split");

    const preview = win.querySelector(".fw-preview");
    const controls = win.querySelector(".fw-controls");
    const applyBtn = win.querySelector(".fw-apply");

    // layout em duas colunas, reaproveitando o mesmo esquema da janela
    // de equalização de histograma: kernel e controles à esquerda,
    // imagem de pré-visualização à direita
    const dataColumn = document.createElement("div");
    dataColumn.className = "fw-col-main";
    dataColumn.appendChild(controls);
    dataColumn.appendChild(applyBtn);

    const imageColumn = document.createElement("div");
    imageColumn.className = "fw-col-image";
    imageColumn.appendChild(preview);

    body.appendChild(dataColumn);
    body.appendChild(imageColumn);

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Tamanho do filtro</label>
        </div>
        <div class="fw-channel-tabs" id="conv-size-tabs">
            <button type="button" class="fw-channel-tab active" data-size="3">3x3</button>
            <button type="button" class="fw-channel-tab" data-size="5">5x5</button>
            <button type="button" class="fw-channel-tab" data-size="7">7x7</button>
            <button type="button" class="fw-channel-tab" data-size="9">9x9</button>
        </div>
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Predefinições</label>
        </div>
        <div class="fw-kernel-presets">
            <button type="button" class="fw-kernel-preset-btn" data-preset="identity">Identidade</button>
            <button type="button" class="fw-kernel-preset-btn" data-preset="mean">Média</button>
            <button type="button" class="fw-kernel-preset-btn" data-preset="gaussian">Gaussiano</button>
            <button type="button" class="fw-kernel-preset-btn" data-preset="sharpen">Nitidez</button>
            <button type="button" class="fw-kernel-preset-btn" data-preset="edges">Bordas</button>
            <button type="button" class="fw-kernel-preset-btn" data-preset="emboss">Relevo</button>
        </div>
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Pesos do kernel</label>
        </div>
        <div class="fw-kernel-grid" id="conv-kernel-grid"></div>
        <div class="fw-kernel-footer">
            <span id="conv-weight-sum">Soma: 1</span>
        </div>
    </div>
    `;

    const sizeTabs = [...controls.querySelectorAll("#conv-size-tabs .fw-channel-tab")];
    const presetButtons = [...controls.querySelectorAll(".fw-kernel-preset-btn")];
    const kernelGrid = controls.querySelector("#conv-kernel-grid");
    const weightSumLabel = controls.querySelector("#conv-weight-sum");

    let size = 3;
    let kernel = [...CONVOLUTION_PRESETS.identity.kernel];

    // a convolução em kernels grandes (7x7, 9x9) é razoavelmente pesada;
    // um pequeno atraso evita recalcular a imagem inteira a cada tecla
    // digitada num campo de peso, mantendo a interface responsiva
    let previewTimeout = null;

    function scheduleConvolutionPreview() {
        clearTimeout(previewTimeout);
        previewTimeout = setTimeout(updateConvolutionPreview, 150);
    }

    // cancela o preview agendado se a janela for fechada antes do
    // atraso de 150ms terminar, evitando um cálculo de convolução
    // desperdiçado sobre uma janela que não existe mais
    win.addEventListener("fw-closed", () => clearTimeout(previewTimeout));

    function updateConvolutionPreview() {
        const totalWeight = kernel.reduce((total, weight) => total + weight, 0);
        weightSumLabel.textContent = `Soma: ${totalWeight}`;

        const previewImg = originalImg.clone();
        layers.forEach((layer) => applyFilter(previewImg, layer));
        applyFilter(previewImg, { type: "convolution", size, kernel });
        showPreview(win, previewImg);
    }




    // reconstrói a grade de inputs numéricos do kernel atual (size x size);
    // chamada sempre que o tamanho muda ou um preset é escolhido

    function renderKernelGrid() {
        kernelGrid.style.gridTemplateColumns = `repeat(${size}, auto)`;
        kernelGrid.innerHTML = "";

        kernel.forEach((weight, index) => {
            const cell = document.createElement("input");
            cell.type = "number";
            cell.className = "fw-kernel-cell";
            cell.step = "1";
            cell.value = weight;

            cell.addEventListener("input", () => {
                const typed = Number(cell.value);
                kernel[index] = Number.isFinite(typed) ? typed : 0;
                scheduleConvolutionPreview();
            });

            kernelGrid.appendChild(cell);
        });
    }




    // troca o tamanho do kernel; o kernel atual é substituído pela
    // identidade do novo tamanho, já que pesos de um tamanho não têm
    // como ser reaproveitados diretamente em outro

    function setSize(newSize) {
        size = newSize;
        kernel = buildIdentityKernel(size);

        sizeTabs.forEach((tab) => tab.classList.toggle("active", Number(tab.dataset.size) === size));

        renderKernelGrid();
        updateConvolutionPreview();
    }

    sizeTabs.forEach((tab) => {
        tab.addEventListener("click", () => setSize(Number(tab.dataset.size)));
    });




    // aplica um preset ao kernel; presets são definidos em 3x3, então,
    // se o tamanho atual for maior, o preset é colocado centralizado
    // dentro de um kernel identidade do tamanho atual (o restante das
    // posições fica com peso 0, exceto o centro, que preserva a
    // identidade fora da área do preset)

    function applyPreset(presetKey) {
        const preset = CONVOLUTION_PRESETS[presetKey];

        if (presetKey === "identity") {
            kernel = buildIdentityKernel(size);
        } else if (size === preset.size) {
            kernel = [...preset.kernel];
        } else {
            // kernel maior começa como identidade e recebe o preset
            // 3x3 sobreposto na região central
            kernel = buildIdentityKernel(size);
            const offset = Math.floor((size - preset.size) / 2);

            // o centro do kernel maior é zerado antes de somar o preset,
            // já que buildIdentityKernel colocou um 1 ali que não faz
            // parte do preset e duplicaria o peso central
            kernel[Math.floor(size / 2) * size + Math.floor(size / 2)] = 0;

            for (let py = 0; py < preset.size; py++) {
                for (let px = 0; px < preset.size; px++) {
                    const targetIndex = (offset + py) * size + (offset + px);
                    kernel[targetIndex] = preset.kernel[py * preset.size + px];
                }
            }
        }

        renderKernelGrid();
        updateConvolutionPreview();
    }

    presetButtons.forEach((button) => {
        button.addEventListener("click", () => applyPreset(button.dataset.preset));
    });




    renderKernelGrid();

    // o layout de duas colunas (fw-wide + fw-body-split) muda as
    // dimensões da janela; recentraliza com o tamanho final já estabilizado
    centerWindow(win);
    updateConvolutionPreview();

    applyBtn.addEventListener("click", () => {
        layers.push({
            label: `Convolução (${size}x${size})`,
            type: "convolution",
            size,
            kernel: [...kernel],
        });
        updateLayersPanel();
        rebuildImageFromLayers();
        win.remove();
    });
});




// ================================================================================================================
// Ferramentas: Escala e Rotação
// ================================================================================================================
//
// diferente dos filtros acima, Escala e Rotação não entram no array
// layers: elas alteram originalImg diretamente e de forma permanente
// (ver replaceOriginalImage), então o botão de Aplicar aqui não faz
// layers.push - ele chama replaceOriginalImage e a imagem final some
// da lista de camadas, exatamente como o clique nos itens de FERRAMENTAS
// (Selecionar/Cortar/Desenhar) sugere ao usuário (são ações diretas
// sobre a imagem, não filtros empilháveis)


scaleToolBtn.addEventListener("click", () => {
    if (!originalImg) return;

    const win = createFilterWindow("Escala");
    const controls = win.querySelector(".fw-controls");

    const srcWidth = originalImg.bitmap.width;
    const srcHeight = originalImg.bitmap.height;
    const aspectRatio = srcWidth / srcHeight;

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-field-row">
            <label>Largura</label>
            <input type="number" id="scale-width" min="1" max="10000" value="${srcWidth}">
        </div>
        <div class="fw-field-row" style="margin-top:6px;">
            <label>Altura</label>
            <input type="number" id="scale-height" min="1" max="10000" value="${srcHeight}">
        </div>
        <div class="fw-checkbox-row" style="margin-top:8px;">
            <input type="checkbox" id="scale-lock-aspect" checked>
            <label for="scale-lock-aspect">Manter proporção</label>
        </div>
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Interpolação</label>
        </div>
        <div class="fw-radio-row">
            <label><input type="radio" name="scale-interp" value="nearest" checked> Vizinho mais próximo</label>
            <label><input type="radio" name="scale-interp" value="bilinear"> Bilinear</label>
        </div>
    </div>
    `;

    const widthInput = controls.querySelector("#scale-width");
    const heightInput = controls.querySelector("#scale-height");
    const lockAspect = controls.querySelector("#scale-lock-aspect");
    const interpRadios = [...controls.querySelectorAll('input[name="scale-interp"]')];

    // debounce: redimensionar (sobretudo com bilinear) percorre toda a
    // imagem de destino a cada amostra; sem isso, digitar no campo
    // numérico dispararia um preview completo por tecla
    let previewTimer = null;
    function scheduleScalePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updateScalePreview, 150);
    }

    function getInterpolation() {
        return interpRadios.find((r) => r.checked).value;
    }

    function updateScalePreview() {
        const targetWidth = clamp(Math.round(Number(widthInput.value)) || 1, 1, 10000);
        const targetHeight = clamp(Math.round(Number(heightInput.value)) || 1, 1, 10000);

        const source = Uint8ClampedArray.from(originalImg.bitmap.data);
        const resized = resizeImageData(source, srcWidth, srcHeight, targetWidth, targetHeight, getInterpolation());

        const preview = new Jimp(targetWidth, targetHeight);
        preview.bitmap.data = Buffer.from(resized.buffer, resized.byteOffset, resized.byteLength);

        // as camadas de filtro já aplicadas continuam visíveis no
        // preview, reaplicadas por cima da imagem já redimensionada -
        // mesmo comportamento que terão depois que a escala for
        // efetivada em originalImg
        layers.forEach((layer) => applyFilter(preview, layer));
        showPreview(win, preview);
    }

    // mantém largura/altura em sincronia quando a proporção está travada
    widthInput.addEventListener("input", () => {
        if (lockAspect.checked) {
            const newWidth = Number(widthInput.value) || 1;
            heightInput.value = Math.max(1, Math.round(newWidth / aspectRatio));
        }
        scheduleScalePreview();
    });

    heightInput.addEventListener("input", () => {
        if (lockAspect.checked) {
            const newHeight = Number(heightInput.value) || 1;
            widthInput.value = Math.max(1, Math.round(newHeight * aspectRatio));
        }
        scheduleScalePreview();
    });

    interpRadios.forEach((radio) => radio.addEventListener("change", updateScalePreview));

    updateScalePreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const targetWidth = clamp(Math.round(Number(widthInput.value)) || 1, 1, 10000);
        const targetHeight = clamp(Math.round(Number(heightInput.value)) || 1, 1, 10000);

        const source = Uint8ClampedArray.from(originalImg.bitmap.data);
        const resized = resizeImageData(source, srcWidth, srcHeight, targetWidth, targetHeight, getInterpolation());

        // mantém a base de rotação (e o ângulo lembrado) coerente com o
        // novo tamanho, para que o ângulo salvo continue válido mesmo
        // depois desta escala (ver syncRotationStateWithExternalResize)
        syncRotationStateWithExternalResize(targetWidth / srcWidth, targetHeight / srcHeight);

        replaceOriginalImage(targetWidth, targetHeight, resized);
        win.remove();
    });
});




// ================================================================================


rotateToolBtn.addEventListener("click", () => {
    if (!originalImg) return;

    const win = createFilterWindow("Rotação");
    const controls = win.querySelector(".fw-controls");

    // a rotação sempre parte da imagem de ANTES da última rotação
    // aplicada (rotationState.preImg), nunca da imagem já rotacionada -
    // isso é o que permite voltar a um ângulo anterior (inclusive 0°)
    // sem degradar a imagem a cada reabertura. Se a imagem atual nunca
    // foi rotacionada desde que foi carregada, a base é ela mesma
    const baseImg = (rotationState.preImg || originalImg).clone();
    const baseWidth = baseImg.bitmap.width;
    const baseHeight = baseImg.bitmap.height;
    const centerPivotX = baseWidth / 2;
    const centerPivotY = baseHeight / 2;

    const initialAngle = rotationState.angle;
    const initialPivotX = rotationState.pivotX ?? centerPivotX;
    const initialPivotY = rotationState.pivotY ?? centerPivotY;
    const initialInterpolation = rotationState.interpolation;
    // o slider só cobre -180..180; um ângulo fora dessa faixa fica sem
    // refletir nele, mas o campo numérico mantém o valor certo
    const initialRangeValue = clamp(initialAngle, -180, 180);

    // preview próprio (não usa showPreview genérica) para poder
    // sobrepor o indicador de pivô arrastável na imagem exibida
    win.classList.add("fw-wide");
    const previewBox = win.querySelector(".fw-preview");
    previewBox.innerHTML = `
        <div class="fw-rotate-preview-wrap">
            <img>
            <div class="fw-pivot-marker" title="Arraste para definir o pivô"></div>
        </div>
    `;
    const previewWrap = previewBox.querySelector(".fw-rotate-preview-wrap");
    const previewImg = previewBox.querySelector("img");
    const pivotMarker = previewBox.querySelector(".fw-pivot-marker");

    controls.innerHTML = `
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Ângulo (graus, horário)</label>
            <input class="fw-value" type="number" id="rotate-angle" min="-360" max="360" value="${initialAngle}">
        </div>
        <input type="range" id="rotate-angle-range" min="-180" max="180" value="${initialRangeValue}">
    </div>
    <div class="fw-control">
        <span class="fw-curve-hint">Arraste o marcador na pré-visualização para mover o pivô de rotação. Começa no centro da imagem.</span>
    </div>
    <div class="fw-control">
        <div class="fw-control-header">
            <label>Interpolação</label>
        </div>
        <div class="fw-radio-row">
            <label><input type="radio" name="rotate-interp" value="nearest" ${initialInterpolation === "nearest" ? "checked" : ""}> Vizinho mais próximo</label>
            <label><input type="radio" name="rotate-interp" value="bilinear" ${initialInterpolation === "bilinear" ? "checked" : ""}> Bilinear</label>
        </div>
    </div>
    `;

    const angleInput = controls.querySelector("#rotate-angle");
    const angleRange = controls.querySelector("#rotate-angle-range");
    const interpRadios = [...controls.querySelectorAll('input[name="rotate-interp"]')];

    // pivô atual em coordenadas da imagem base (não da tela); é o que
    // efetivamente é usado no cálculo da rotação
    let pivotX = initialPivotX;
    let pivotY = initialPivotY;

    function getInterpolation() {
        return interpRadios.find((r) => r.checked).value;
    }

    // converte a posição do pivô (coordenadas da imagem base) para a
    // posição em pixels de tela dentro de previewWrap, considerando que
    // a imagem é exibida com object-fit: contain (pode haver faixas
    // vazias nas laterais ou em cima/embaixo caso a proporção não bata
    // com a do wrapper)
    function positionMarker() {
        const wrapRect = previewWrap.getBoundingClientRect();
        const naturalW = previewImg.naturalWidth || baseWidth;
        const naturalH = previewImg.naturalHeight || baseHeight;
        if (!naturalW || !naturalH || !wrapRect.width || !wrapRect.height) return;

        const scale = Math.min(wrapRect.width / naturalW, wrapRect.height / naturalH);
        const renderedW = naturalW * scale;
        const renderedH = naturalH * scale;
        const offsetX = (wrapRect.width - renderedW) / 2;
        const offsetY = (wrapRect.height - renderedH) / 2;

        // pivotX/pivotY são relativos a baseImg (baseWidth x baseHeight);
        // a imagem exibida no preview é o resultado JÁ ROTACIONADO
        // (dimensões diferentes de baseWidth x baseHeight em geral), mas
        // o marcador precisa aparecer sobre o ponto correspondente nessa
        // imagem rotacionada - por isso a posição vem de rotatedPivot,
        // calculada em updateRotatePreview junto com a própria rotação
        const px = offsetX + rotatedPivot.x * scale;
        const py = offsetY + rotatedPivot.y * scale;

        pivotMarker.style.left = `${px}px`;
        pivotMarker.style.top = `${py}px`;
    }

    // posição do pivô dentro da imagem JÁ ROTACIONADA exibida no
    // preview (não da base) - recalculada a cada updateRotatePreview,
    // é o que positionMarker usa para posicionar o indicador
    let rotatedPivot = { x: 0, y: 0 };

    let previewTimer = null;
    function scheduleRotatePreview() {
        clearTimeout(previewTimer);
        previewTimer = setTimeout(updateRotatePreview, 150);
    }

    function updateRotatePreview() {
        const angle = Number(angleInput.value) || 0;

        const source = Uint8ClampedArray.from(baseImg.bitmap.data);
        const rotated = rotateImageData(source, baseWidth, baseHeight, angle, pivotX, pivotY, getInterpolation());

        // rotateImageData não devolve a posição do pivô no canvas de
        // saída diretamente, mas ela é recuperável: é o único ponto que
        // NÃO se move em relação à imagem rotacionada, então dá pra
        // obter rotacionando o próprio pivô (dx=dy=0) com a mesma
        // bounding box - refeito aqui de forma simplificada, replicando
        // só a parte de outPivot de rotateImageData
        rotatedPivot = computeRotatedPivotPosition(baseWidth, baseHeight, angle, pivotX, pivotY);

        const preview = new Jimp(rotated.width, rotated.height);
        preview.bitmap.data = Buffer.from(rotated.data.buffer, rotated.data.byteOffset, rotated.data.byteLength);

        layers.forEach((layer) => applyFilter(preview, layer));

        preview.getBase64Async(Jimp.MIME_PNG).then((base64) => {
            previewImg.onload = () => positionMarker();
            previewImg.src = base64;
        });
    }

    // arrasto do marcador de pivô: converte a posição do mouse (pixels
    // de tela dentro de previewWrap) de volta para coordenadas da
    // imagem rotacionada exibida, e desse ponto para coordenadas da
    // imagem BASE (desfazendo a rotação atual), já que pivotX/pivotY
    // são sempre relativos à base, não à imagem rotacionada exibida
    function screenToBasePivot(clientX, clientY) {
        const wrapRect = previewWrap.getBoundingClientRect();
        const naturalW = previewImg.naturalWidth || 1;
        const naturalH = previewImg.naturalHeight || 1;
        const scale = Math.min(wrapRect.width / naturalW, wrapRect.height / naturalH);
        const renderedW = naturalW * scale;
        const renderedH = naturalH * scale;
        const offsetX = (wrapRect.width - renderedW) / 2;
        const offsetY = (wrapRect.height - renderedH) / 2;

        const xOnRotated = (clientX - wrapRect.left - offsetX) / scale;
        const yOnRotated = (clientY - wrapRect.top - offsetY) / scale;

        const angle = Number(angleInput.value) || 0;
        return rotatedPointToBase(baseWidth, baseHeight, angle, pivotX, pivotY, xOnRotated, yOnRotated);
    }

    let dragging = false;

    pivotMarker.addEventListener("mousedown", (event) => {
        event.preventDefault();
        dragging = true;
        pivotMarker.classList.add("dragging");

        const onMove = (moveEvent) => {
            if (!dragging) return;
            const basePoint = screenToBasePivot(moveEvent.clientX, moveEvent.clientY);
            pivotX = basePoint.x;
            pivotY = basePoint.y;
            updateRotatePreview();
        };

        const onUp = () => {
            dragging = false;
            pivotMarker.classList.remove("dragging");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
        };

        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    angleRange.addEventListener("input", () => {
        angleInput.value = angleRange.value;
        scheduleRotatePreview();
    });

    angleInput.addEventListener("input", () => {
        const typed = clamp(Number(angleInput.value) || 0, -360, 360);
        // o slider só cobre -180..180; ângulos fora dessa faixa digitados
        // manualmente ficam sem refletir no slider, mas continuam válidos
        if (typed >= -180 && typed <= 180) angleRange.value = typed;
        scheduleRotatePreview();
    });

    interpRadios.forEach((radio) => radio.addEventListener("change", updateRotatePreview));

    // a .filter-window tem resize:both (arrastável pelo usuário), o que
    // muda o tamanho de previewWrap sem disparar onload da imagem;
    // sem isso o marcador ficaria desalinhado após um resize manual
    const resizeObserver = new ResizeObserver(() => positionMarker());
    resizeObserver.observe(previewWrap);
    win.addEventListener("fw-closed", () => resizeObserver.disconnect());

    // o layout fw-wide muda as dimensões da janela; recentraliza e só
    // então gera o primeiro preview, para positionMarker já calcular
    // com o tamanho final do wrapper
    centerWindow(win);
    updateRotatePreview();

    win.querySelector(".fw-apply").addEventListener("click", () => {
        const angle = Number(angleInput.value) || 0;
        const interpolation = getInterpolation();

        const source = Uint8ClampedArray.from(baseImg.bitmap.data);
        const rotated = rotateImageData(source, baseWidth, baseHeight, angle, pivotX, pivotY, interpolation);

        replaceOriginalImage(rotated.width, rotated.height, rotated.data);

        // baseImg (clone) vira a nova referência "pré-rotação": se o
        // usuário reabrir a janela depois, o slider começa em `angle` e
        // girar para 0° volta exatamente a este estado
        rotationState = {
            preImg: baseImg,
            angle,
            pivotX,
            pivotY,
            interpolation,
        };

        resizeObserver.disconnect();
        win.remove();
    });
});
