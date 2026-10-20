import { clamp, createImage, cloneImage } from "./auxiliary.js";

// ===============================================================================
// 1. TRANSFORMAÇÕES DE INTENSIDADE E ESTEGANOGRAFIA NO DOMÍNIO ESPACIAL
// ===============================================================================

export async function inversion(img) {
    // Inverso pontual: s = 255 - r
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; ++i) {
        lut[i] = 255 - i;
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        data[idx + 0] = lut[data[idx + 0]];
        data[idx + 1] = lut[data[idx + 1]];
        data[idx + 2] = lut[data[idx + 2]];
    });
    return img;
}

export async function threshold(img, limit) {
    // Binarização baseada em limiar sobre a luminância
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; ++i) {
        lut[i] = i < limit ? 0 : 255;
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        const R = data[idx + 0];
        const G = data[idx + 1];
        const B = data[idx + 2];

        const luminance = Math.round(0.299 * R + 0.587 * G + 0.114 * B);
        const val = lut[luminance];

        data[idx + 0] = val;
        data[idx + 1] = val;
        data[idx + 2] = val;
    });
    return img;
}

export async function brightness(img, value) {
    // Deslocamento de intensidade: s = clamp(r + value)
    if (value === 0) return img;

    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; ++i) {
        lut[i] = clamp(i + value);
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        data[idx + 0] = lut[data[idx + 0]];
        data[idx + 1] = lut[data[idx + 1]];
        data[idx + 2] = lut[data[idx + 2]];
    });
    return img;
}

export async function gammaCorrection(img, gamma, constant = 1) {
    // Curva de potência: s = c * (r / 255)^gamma * 255
    // gamma = 0 é válido (s = c para todo r); apenas valores negativos são rejeitados
    if (gamma < 0) throw new Error("Gamma must not be negative");
    if (gamma === 1 && constant === 1) return img;

    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; ++i) {
        const normalized = i / 255;
        const corrected = Math.pow(normalized, gamma);
        lut[i] = clamp(constant * corrected * 255);
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        data[idx + 0] = lut[data[idx + 0]];
        data[idx + 1] = lut[data[idx + 1]];
        data[idx + 2] = lut[data[idx + 2]];
    });
    return img;
}

export async function pieceWise(img, rPoints, sPoints) {
    // Transformação linear segmentada por partes
    if (rPoints.length !== sPoints.length || rPoints.length < 2) {
        throw new Error("Mapping error: rPoints and sPoints must have the same length >= 2");
    }

    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
        let value = sPoints[0];
        for (let j = 0; j < rPoints.length - 1; j++) {
            if (i >= rPoints[j] && i <= rPoints[j + 1]) {
                const rDiff = rPoints[j + 1] - rPoints[j];
                const slope = rDiff === 0 ? 0 : (sPoints[j + 1] - sPoints[j]) / rDiff;
                value = Math.round(slope * (i - rPoints[j]) + sPoints[j]);
                break;
            } else if (i > rPoints[j + 1]) {
                value = sPoints[j + 1];
            }
        }
        lut[i] = clamp(value);
    }

    const data = img.bitmap.data;
    img.scan(0, 0, img.bitmap.width, img.bitmap.height, function(x, y, idx) {
        data[idx + 0] = lut[data[idx + 0]];
        data[idx + 1] = lut[data[idx + 1]];
        data[idx + 2] = lut[data[idx + 2]];
    });
    return img;
}

export function encode(img, message) {
    // Injeção de mensagem de texto no plano de bits menos significativo (LSB)
    const data = img.bitmap.data;
    const messageWithNull = message + '\0';
    const maxBits = img.bitmap.width * img.bitmap.height * 3;
    const totalBits = messageWithNull.length * 8;

    if (totalBits > maxBits) throw new Error("Message is too big for this image");

    let bitIndex = 0;
    for (let i = 0; i < data.length && bitIndex < totalBits; i += 4) {
        for (let c = 0; c < 3 && bitIndex < totalBits; ++c) {
            const charCode = messageWithNull.charCodeAt(Math.floor(bitIndex / 8));
            const bit = (charCode >> (7 - (bitIndex % 8))) & 1;
            data[i + c] = (data[i + c] & 0xFE) | bit;
            ++bitIndex;
        }
    }
    return img;
}

export function decode(img) {
    // Extração sequencial de mensagem oculta no LSB até encontrar '\0'
    const data = img.bitmap.data;
    let message = '';
    let bitsCount = 0;
    let currentByte = 0;

    for (let i = 0; i < data.length; i += 4) {
        for (let p = 0; p < 3; ++p) {
            currentByte = (currentByte << 1) | (data[i + p] & 1);
            ++bitsCount;

            if (bitsCount === 8) {
                if (currentByte === 0) return message;
                message += String.fromCharCode(currentByte);
                currentByte = 0;
                bitsCount = 0;
            }
        }
    }
    return message;
}

// ===============================================================================
// 2. HISTOGRAMA E CONVOLUÇÃO ESPACIAL GENÉRICA
// ===============================================================================

export async function getHistogram(img, channel = 'gray') {
    // Frequência de ocorrência das intensidades discretas h(r_k)
    if (channel === 'all') {
        const histR = new Uint32Array(256);
        const histG = new Uint32Array(256);
        const histB = new Uint32Array(256);
        const histGray = new Uint32Array(256);

        const data = img.bitmap.data;
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i + 0];
            const g = data[i + 1];
            const b = data[i + 2];
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

            histR[r]++;
            histG[g]++;
            histB[b]++;
            histGray[gray]++;
        }
        return { r: histR, g: histG, b: histB, gray: histGray };
    }

    const histogram = new Uint32Array(256);
    const data = img.bitmap.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i + 0];
        const g = data[i + 1];
        const b = data[i + 2];

        let val;
        if (channel === 'r') val = r;
        else if (channel === 'g') val = g;
        else if (channel === 'b') val = b;
        else val = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        histogram[val]++;
    }
    return histogram;
}

export async function equalizeHistogram(img) {
    // Equalização de histograma por CDF discreta acumulada
    const histogram = await getHistogram(img, 'gray');
    const lut = new Uint8ClampedArray(256);
    const totalPixels = img.bitmap.width * img.bitmap.height;
    const factor = 255 / totalPixels;

    let sum = 0;
    for (let j = 0; j < 256; ++j) {
        sum += histogram[j];
        lut[j] = clamp(factor * sum);
    }

    const data = img.bitmap.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i + 0];
        const g = data[i + 1];
        const b = data[i + 2];
        const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const eqVal = lut[luminance];

        data[i + 0] = eqVal;
        data[i + 1] = eqVal;
        data[i + 2] = eqVal;
    }
    return img;
}

export function normalizeMinMax(buffer, minVal, maxVal) {
    // Reescalonamento linear de valores reais para o intervalo inteiro [0, 255]
    const range = maxVal - minVal;
    const scale = range === 0 ? 0 : 255 / range;
    const out = new Uint8ClampedArray(buffer.length);
    for (let i = 0; i < buffer.length; i++) {
        out[i] = Math.round((buffer[i] - minVal) * scale);
    }
    return out;
}

export function convolve2D(img, kernel, options = {}) {
    // Convolução espacial discreta bidimensional para máscaras quadradas ímpares
    const kSize = kernel.length;
    if (kSize % 2 === 0 || kSize !== kernel[0].length) {
        throw new Error("Kernel size must be a square odd matrix (3x3, 5x5, ...)");
    }

    const half = Math.floor(kSize / 2);
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const ogData = img.bitmap.data;

    const output = cloneImage(img);
    const dst = output.bitmap.data;

    let divisor = options.divisor;
    if (divisor === undefined) {
        let sumWeights = 0;
        for (let r = 0; r < kSize; ++r) {
            for (let c = 0; c < kSize; ++c) {
                sumWeights += kernel[r][c];
            }
        }
        divisor = sumWeights !== 0 ? sumWeights : 1;
    }

    const offset = options.offset || 0;
    const normalize = options.normalize || false;

    const tempBuffer = normalize ? new Float32Array(width * height * 3) : null;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            let sumR = 0;
            let sumG = 0;
            let sumB = 0;

            for (let ky = 0; ky < kSize; ++ky) {
                const py = Math.min(height - 1, Math.max(0, y + ky - half));
                const rowOffset = py * width;

                for (let kx = 0; kx < kSize; ++kx) {
                    const px = Math.min(width - 1, Math.max(0, x + kx - half));
                    const idx = (rowOffset + px) * 4;
                    const weight = kernel[ky][kx];

                    sumR += ogData[idx + 0] * weight;
                    sumG += ogData[idx + 1] * weight;
                    sumB += ogData[idx + 2] * weight;
                }
            }

            const valR = (sumR / divisor) + offset;
            const valG = (sumG / divisor) + offset;
            const valB = (sumB / divisor) + offset;

            const outIdx = (y * width + x) * 4;

            if (normalize) {
                const tempIdx = (y * width + x) * 3;
                tempBuffer[tempIdx + 0] = valR;
                tempBuffer[tempIdx + 1] = valG;
                tempBuffer[tempIdx + 2] = valB;

                if (valR < minVal) minVal = valR;
                if (valR > maxVal) maxVal = valR;
                if (valG < minVal) minVal = valG;
                if (valG > maxVal) maxVal = valG;
                if (valB < minVal) minVal = valB;
                if (valB > maxVal) maxVal = valB;
            } else {
                dst[outIdx + 0] = clamp(valR);
                dst[outIdx + 1] = clamp(valG);
                dst[outIdx + 2] = clamp(valB);
                dst[outIdx + 3] = ogData[outIdx + 3];
            }
        }
    }

    if (normalize) {
        const range = maxVal - minVal;
        const scale = range === 0 ? 0 : 255 / range;

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const outIdx = (y * width + x) * 4;
                const tempIdx = (y * width + x) * 3;

                dst[outIdx + 0] = Math.round((tempBuffer[tempIdx + 0] - minVal) * scale);
                dst[outIdx + 1] = Math.round((tempBuffer[tempIdx + 1] - minVal) * scale);
                dst[outIdx + 2] = Math.round((tempBuffer[tempIdx + 2] - minVal) * scale);
                dst[outIdx + 3] = ogData[outIdx + 3];
            }
        }
    }

    return output;
}

// ===============================================================================
// 3. FILTROS ESPACIAIS DE SUAVIZAÇÃO, MEDIANA E AGUÇAMENTO
// ===============================================================================

export function boxBlur(img, size = 3) {
    // Filtro da média simples com pesos unitários
    if (size % 2 === 0 || size < 3) throw new Error("Size must be an odd integer >= 3");
    const kernel = [];
    for (let r = 0; r < size; r++) {
        const row = new Array(size).fill(1);
        kernel.push(row);
    }
    return convolve2D(img, kernel, { divisor: size * size });
}

export function gaussianBlur(img, size = 3, sigma = 1.0) {
    // Suavização Gaussiana analítica 2D
    if (size % 2 === 0 || size < 3) throw new Error("Size must be an odd integer >= 3");
    const half = Math.floor(size / 2);
    const twoSigmaSq = 2 * sigma * sigma;
    const kernel = [];

    for (let y = 0; y < size; y++) {
        const row = [];
        const dy = y - half;
        for (let x = 0; x < size; x++) {
            const dx = x - half;
            row.push(Math.exp(-(dx * dx + dy * dy) / twoSigmaSq));
        }
        kernel.push(row);
    }

    return convolve2D(img, kernel);
}

export function medianFilter(img, size = 3) {
    // Filtragem estatística não-linear pela mediana da vizinhança
    if (size % 2 === 0 || size < 3) throw new Error("Size must be an odd integer >= 3");
    const half = Math.floor(size / 2);
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const src = img.bitmap.data;

    const output = cloneImage(img);
    const dst = output.bitmap.data;

    const windowSize = size * size;
    const midIndex = Math.floor(windowSize / 2);
    const rWindow = new Uint8Array(windowSize);
    const gWindow = new Uint8Array(windowSize);
    const bWindow = new Uint8Array(windowSize);

    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            let count = 0;
            for (let ky = 0; ky < size; ++ky) {
                const py = Math.min(height - 1, Math.max(0, y + ky - half));
                const rowOffset = py * width;

                for (let kx = 0; kx < size; ++kx) {
                    const px = Math.min(width - 1, Math.max(0, x + kx - half));
                    const idx = (rowOffset + px) * 4;

                    rWindow[count] = src[idx + 0];
                    gWindow[count] = src[idx + 1];
                    bWindow[count] = src[idx + 2];
                    count++;
                }
            }

            rWindow.sort();
            gWindow.sort();
            bWindow.sort();

            const outIdx = (y * width + x) * 4;
            dst[outIdx + 0] = rWindow[midIndex];
            dst[outIdx + 1] = gWindow[midIndex];
            dst[outIdx + 2] = bWindow[midIndex];
            dst[outIdx + 3] = src[outIdx + 3];
        }
    }
    return output;
}

export function laplacianFilter(img, options = {}) {
    // Operador Laplaciano para detecção de segunda derivada ou aguçamento
    const variant = options.variant || '8';
    const sharpen = options.sharpen !== undefined ? options.sharpen : false;

    let kernel;
    if (sharpen) {
        // Aguçamento direto: g = f - Laplaciano(f)
        kernel = variant === '4'
            ? [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]
            : [[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]];
        return convolve2D(img, kernel, { divisor: 1, normalize: false });
    } else {
        // Resposta de contornos normalizada para tons de cinza
        kernel = variant === '4'
            ? [[0, 1, 0], [1, -4, 1], [0, 1, 0]]
            : [[1, 1, 1], [1, -8, 1], [1, 1, 1]];
        return convolve2D(img, kernel, { divisor: 1, normalize: true });
    }
}

export function highBoostFilter(img, A = 1.5, size = 3) {
    // Aguçamento High-Boost: f_hb = A * f - f_smooth = (A - 1) * f + (f - f_smooth)
    const smooth = boxBlur(img, size);
    const output = cloneImage(img);

    const src = img.bitmap.data;
    const smData = smooth.bitmap.data;
    const dst = output.bitmap.data;

    for (let i = 0; i < src.length; i += 4) {
        dst[i + 0] = clamp(A * src[i + 0] - smData[i + 0]);
        dst[i + 1] = clamp(A * src[i + 1] - smData[i + 1]);
        dst[i + 2] = clamp(A * src[i + 2] - smData[i + 2]);
        dst[i + 3] = src[i + 3];
    }
    return output;
}

// ===============================================================================
// 4. GRADIENTE E FILTROS DE SOBEL
// ===============================================================================

export function sobelX(img, options = {}) {
    // Gradiente horizontal Sobel (destaca bordas verticais)
    const normalize = options.normalize !== undefined ? options.normalize : true;
    const kernel = [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
    ];
    return convolve2D(img, kernel, { divisor: 1, normalize });
}

export function sobelY(img, options = {}) {
    // Gradiente vertical Sobel (destaca bordas horizontais)
    const normalize = options.normalize !== undefined ? options.normalize : true;
    const kernel = [
        [-1, -2, -1],
        [ 0,  0,  0],
        [ 1,  2,  1]
    ];
    return convolve2D(img, kernel, { divisor: 1, normalize });
}

export function sobelMagnitude(img, options = {}) {
    // Magnitude não-linear do gradiente: M = sqrt(Gx^2 + Gy^2)
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const src = img.bitmap.data;

    const output = cloneImage(img);
    const dst = output.bitmap.data;

    const kx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const ky = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];

    const normalize = options.normalize !== undefined ? options.normalize : true;
    const tempBuffer = normalize ? new Float32Array(width * height * 3) : null;
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            let gxR = 0, gxG = 0, gxB = 0;
            let gyR = 0, gyG = 0, gyB = 0;

            for (let dy = 0; dy < 3; ++dy) {
                const py = Math.min(height - 1, Math.max(0, y + dy - 1));
                const rowOffset = py * width;

                for (let dx = 0; dx < 3; ++dx) {
                    const px = Math.min(width - 1, Math.max(0, x + dx - 1));
                    const idx = (rowOffset + px) * 4;
                    const wx = kx[dy][dx];
                    const wy = ky[dy][dx];

                    const r = src[idx + 0];
                    const g = src[idx + 1];
                    const b = src[idx + 2];

                    gxR += r * wx; gxG += g * wx; gxB += b * wx;
                    gyR += r * wy; gyG += g * wy; gyB += b * wy;
                }
            }

            const magR = Math.sqrt(gxR * gxR + gyR * gyR);
            const magG = Math.sqrt(gxG * gxG + gyG * gyG);
            const magB = Math.sqrt(gxB * gxB + gyB * gyB);

            const outIdx = (y * width + x) * 4;

            if (normalize) {
                const tempIdx = (y * width + x) * 3;
                tempBuffer[tempIdx + 0] = magR;
                tempBuffer[tempIdx + 1] = magG;
                tempBuffer[tempIdx + 2] = magB;

                if (magR < minVal) minVal = magR;
                if (magR > maxVal) maxVal = magR;
                if (magG < minVal) minVal = magG;
                if (magG > maxVal) maxVal = magG;
                if (magB < minVal) minVal = magB;
                if (magB > maxVal) maxVal = magB;
            } else {
                dst[outIdx + 0] = clamp(magR);
                dst[outIdx + 1] = clamp(magG);
                dst[outIdx + 2] = clamp(magB);
                dst[outIdx + 3] = src[outIdx + 3];
            }
        }
    }

    if (normalize) {
        const range = maxVal - minVal;
        const scale = range === 0 ? 0 : 255 / range;

        for (let y = 0; y < height; ++y) {
            for (let x = 0; x < width; ++x) {
                const outIdx = (y * width + x) * 4;
                const tempIdx = (y * width + x) * 3;

                dst[outIdx + 0] = Math.round((tempBuffer[tempIdx + 0] - minVal) * scale);
                dst[outIdx + 1] = Math.round((tempBuffer[tempIdx + 1] - minVal) * scale);
                dst[outIdx + 2] = Math.round((tempBuffer[tempIdx + 2] - minVal) * scale);
                dst[outIdx + 3] = src[outIdx + 3];
            }
        }
    }

    return output;
}

// ===============================================================================
// 5. OPERAÇÕES GEOMÉTRICAS ESPACIAIS
// ===============================================================================

export function scaleImage(img, scaleX, scaleY = scaleX, interpolation = 'nearest') {
    // Redimensionamento espacial por mapeamento reverso (backward mapping)
    if (scaleX <= 0 || scaleY <= 0) throw new Error("Scale factors must be strictly positive");

    const srcWidth = img.bitmap.width;
    const srcHeight = img.bitmap.height;
    const src = img.bitmap.data;

    const newWidth = Math.max(1, Math.round(srcWidth * scaleX));
    const newHeight = Math.max(1, Math.round(srcHeight * scaleY));

    const output = createImage(newWidth, newHeight);
    if (!output || !output.bitmap || !output.bitmap.data) {
        throw new Error("Falha ao alocar buffer para a nova imagem redimensionada.");
    }
    const dst = output.bitmap.data;

    for (let y = 0; y < newHeight; ++y) {
        const srcY = y / scaleY;

        for (let x = 0; x < newWidth; ++x) {
            const srcX = x / scaleX;
            const dstIdx = (y * newWidth + x) * 4;

            if (interpolation === 'bilinear') {
                const x0 = Math.floor(srcX);
                const y0 = Math.floor(srcY);
                const x1 = Math.min(srcWidth - 1, x0 + 1);
                const y1 = Math.min(srcHeight - 1, y0 + 1);

                const dx = srcX - x0;
                const dy = srcY - y0;

                const idx00 = (y0 * srcWidth + x0) * 4;
                const idx10 = (y0 * srcWidth + x1) * 4;
                const idx01 = (y1 * srcWidth + x0) * 4;
                const idx11 = (y1 * srcWidth + x1) * 4;

                const w00 = (1 - dx) * (1 - dy);
                const w10 = dx * (1 - dy);
                const w01 = (1 - dx) * dy;
                const w11 = dx * dy;

                for (let c = 0; c < 4; ++c) {
                    const interpolated = w00 * src[idx00 + c] +
                                         w10 * src[idx10 + c] +
                                         w01 * src[idx01 + c] +
                                         w11 * src[idx11 + c];
                    dst[dstIdx + c] = clamp(interpolated);
                }
            } else {
                // Vizinho Mais Próximo (Nearest Neighbor)
                const px = Math.min(srcWidth - 1, Math.max(0, Math.round(srcX)));
                const py = Math.min(srcHeight - 1, Math.max(0, Math.round(srcY)));
                const srcIdx = (py * srcWidth + px) * 4;

                dst[dstIdx + 0] = src[srcIdx + 0];
                dst[dstIdx + 1] = src[srcIdx + 1];
                dst[dstIdx + 2] = src[srcIdx + 2];
                dst[dstIdx + 3] = src[srcIdx + 3];
            }
        }
    }
    return output;
}

// Geometria da rotação: tamanho do canvas que contém a imagem inteira rotacionada e a origem
// desse canvas no plano do pivô (coordenadas em que o pixel i tem centro em i).
export function getRotationLayout(width, height, angleDegrees, pivotX, pivotY) {
    const rad = (angleDegrees * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    // Os 4 cantos da imagem (bordas dos pixels: de -0.5 a largura-0.5) após a rotação em torno do pivô
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [cx, cy] of [[-0.5, -0.5], [width - 0.5, -0.5], [-0.5, height - 0.5], [width - 0.5, height - 0.5]]) {
        const dx = cx - pivotX;
        const dy = cy - pivotY;
        const rx = cosA * dx - sinA * dy + pivotX;
        const ry = sinA * dx + cosA * dy + pivotY;
        if (rx < minX) minX = rx;
        if (rx > maxX) maxX = rx;
        if (ry < minY) minY = ry;
        if (ry > maxY) maxY = ry;
    }

    // Maior extensão horizontal e vertical da imagem rotacionada (1e-9 absorve ruído de ponto flutuante)
    const outW = Math.max(1, Math.ceil(maxX - minX - 1e-9));
    const outH = Math.max(1, Math.ceil(maxY - minY - 1e-9));

    // Origem do canvas, com a folga distribuída igualmente nos dois lados
    return {
        outW,
        outH,
        originX: minX - (outW - (maxX - minX)) / 2,
        originY: minY - (outH - (maxY - minY)) / 2
    };
}

export function rotateImage(img, angleDegrees, pivotX = null, pivotY = null, interpolation = 'nearest') {
    // Rotação espacial (ângulo positivo = sentido horário) com pivô e interpolação.
    // O canvas de saída é ampliado para conter a imagem inteira rotacionada (nunca corta).
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const src = img.bitmap.data;

    const px = pivotX !== null ? pivotX : (width - 1) / 2;
    const py = pivotY !== null ? pivotY : (height - 1) / 2;

    const rad = (angleDegrees * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const { outW, outH, originX, originY } = getRotationLayout(width, height, angleDegrees, px, py);

    const output = createImage(outW, outH);
    if (!output || !output.bitmap || !output.bitmap.data) {
        throw new Error("Falha ao alocar buffer para a nova imagem rotacionada.");
    }
    const dst = output.bitmap.data;

    for (let y = 0; y < outH; ++y) {
        for (let x = 0; x < outW; ++x) {
            const dstIdx = (y * outW + x) * 4;

            // Centro do pixel de saída no plano do pivô, mapeado de volta para a imagem original
            const dx = originX + x + 0.5 - px;
            const dy = originY + y + 0.5 - py;
            const srcX = cosA * dx + sinA * dy + px;
            const srcY = -sinA * dx + cosA * dy + py;

            if (srcX >= -0.5 && srcX < width - 0.5 && srcY >= -0.5 && srcY < height - 0.5) {
                if (interpolation === 'bilinear') {
                    const fxPos = Math.min(width - 1, Math.max(0, srcX));
                    const fyPos = Math.min(height - 1, Math.max(0, srcY));
                    const x0 = Math.floor(fxPos);
                    const y0 = Math.floor(fyPos);
                    const x1 = Math.min(width - 1, x0 + 1);
                    const y1 = Math.min(height - 1, y0 + 1);

                    const fx = fxPos - x0;
                    const fy = fyPos - y0;

                    const idx00 = (y0 * width + x0) * 4;
                    const idx10 = (y0 * width + x1) * 4;
                    const idx01 = (y1 * width + x0) * 4;
                    const idx11 = (y1 * width + x1) * 4;

                    const w00 = (1 - fx) * (1 - fy);
                    const w10 = fx * (1 - fy);
                    const w01 = (1 - fx) * fy;
                    const w11 = fx * fy;

                    for (let c = 0; c < 4; ++c) {
                        const val = w00 * src[idx00 + c] +
                                    w10 * src[idx10 + c] +
                                    w01 * src[idx01 + c] +
                                    w11 * src[idx11 + c];
                        dst[dstIdx + c] = clamp(val);
                    }
                } else {
                    const nx = Math.min(width - 1, Math.max(0, Math.round(srcX)));
                    const ny = Math.min(height - 1, Math.max(0, Math.round(srcY)));
                    const srcIdx = (ny * width + nx) * 4;

                    dst[dstIdx + 0] = src[srcIdx + 0];
                    dst[dstIdx + 1] = src[srcIdx + 1];
                    dst[dstIdx + 2] = src[srcIdx + 2];
                    dst[dstIdx + 3] = src[srcIdx + 3];
                }
            } else {
                dst[dstIdx + 0] = 0;
                dst[dstIdx + 1] = 0;
                dst[dstIdx + 2] = 0;
                dst[dstIdx + 3] = 0;
            }
        }
    }
    return output;
}

// ===============================================================================
// 6. PROCESSAMENTO DE IMAGENS COLORIDAS NO DOMÍNIO ESPACIAL
// ===============================================================================

export function rgbToHsi(r, g, b) {
    // Conversão de coordenadas de cores RGB -> HSI
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const sum = rn + gn + bn;
    const intensity = sum / 3;

    if (sum === 0) return { h: 0, s: 0, i: 0 };

    const minVal = Math.min(rn, gn, bn);
    const saturation = 1 - (3 / sum) * minVal;
    if (saturation === 0) return { h: 0, s: 0, i: intensity };

    const num = 0.5 * ((rn - gn) + (rn - bn));
    const den = Math.sqrt((rn - gn) * (rn - gn) + (rn - bn) * (gn - bn));
    if (den === 0) return { h: 0, s: saturation, i: intensity };

    let theta = Math.acos(Math.max(-1, Math.min(1, num / den))) * (180 / Math.PI);
    let h = (bn <= gn) ? theta : (360 - theta);
    return { h, s: saturation, i: intensity };
}

export function hsiToRgb(h, s, i) {
    // Conversão de coordenadas de cores HSI -> RGB por setores
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    i = Math.max(0, Math.min(1, i));

    if (s === 0) {
        const val = Math.round(i * 255);
        return { r: val, g: val, b: val };
    }

    const pi = Math.PI;
    let r, g, b;

    if (h < 120) {
        const rad = h * (pi / 180);
        b = i * (1 - s);
        r = i * (1 + (s * Math.cos(rad)) / Math.cos((pi / 3) - rad));
        g = 3 * i - (r + b);
    } else if (h < 240) {
        const h2 = h - 120;
        const rad = h2 * (pi / 180);
        r = i * (1 - s);
        g = i * (1 + (s * Math.cos(rad)) / Math.cos((pi / 3) - rad));
        b = 3 * i - (r + g);
    } else {
        const h3 = h - 240;
        const rad = h3 * (pi / 180);
        g = i * (1 - s);
        b = i * (1 + (s * Math.cos(rad)) / Math.cos((pi / 3) - rad));
        r = 3 * i - (g + b);
    }

    return {
        r: clamp(r * 255),
        g: clamp(g * 255),
        b: clamp(b * 255)
    };
}

export function convertToGrayscale(img, method = 'luminance') {
    // Conversão para escala de cinza (média simples ou luminância ITU-R BT.601)
    const output = cloneImage(img);
    const data = output.bitmap.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i + 0];
        const g = data[i + 1];
        const b = data[i + 2];

        const gray = method === 'average'
            ? Math.round((r + g + b) / 3)
            : Math.round(0.299 * r + 0.587 * g + 0.114 * b);

        data[i + 0] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
    }
    return output;
}

export function colorInversion(img) {
    // Negativo multicanal independente
    const output = cloneImage(img);
    const data = output.bitmap.data;

    for (let i = 0; i < data.length; i += 4) {
        data[i + 0] = 255 - data[i + 0];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
    }
    return output;
}

export function chromaKey(fgImg, bgImg, targetColor = [0, 255, 0], tolerance = 50) {
    // Croma-chave por distância esférica euclidiana no espaço RGB
    const width = fgImg.bitmap.width;
    const height = fgImg.bitmap.height;
    const fgData = fgImg.bitmap.data;
    const bgData = bgImg.bitmap.data;
    const bgWidth = bgImg.bitmap.width;
    const bgHeight = bgImg.bitmap.height;

    const output = cloneImage(fgImg);
    const dst = output.bitmap.data;

    const [tr, tg, tb] = targetColor;
    const tolSq = tolerance * tolerance;

    for (let y = 0; y < height; ++y) {
        for (let x = 0; x < width; ++x) {
            const fgIdx = (y * width + x) * 4;
            const r = fgData[fgIdx + 0];
            const g = fgData[fgIdx + 1];
            const b = fgData[fgIdx + 2];

            const dr = r - tr;
            const dg = g - tg;
            const db = b - tb;
            const distSq = dr * dr + dg * dg + db * db;

            if (distSq <= tolSq) {
                const bgX = Math.min(bgWidth - 1, x);
                const bgY = Math.min(bgHeight - 1, y);
                const bgIdx = (bgY * bgWidth + bgX) * 4;

                dst[fgIdx + 0] = bgData[bgIdx + 0];
                dst[fgIdx + 1] = bgData[bgIdx + 1];
                dst[fgIdx + 2] = bgData[bgIdx + 2];
                dst[fgIdx + 3] = bgData[bgIdx + 3];
            } else {
                dst[fgIdx + 0] = r;
                dst[fgIdx + 1] = g;
                dst[fgIdx + 2] = b;
                dst[fgIdx + 3] = fgData[fgIdx + 3];
            }
        }
    }
    return output;
}

export async function getColorHistogram(img) {
    // Histograma dos canais R, G, B e Intensidade I
    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    const histI = new Uint32Array(256);

    const data = img.bitmap.data;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i + 0];
        const g = data[i + 1];
        const b = data[i + 2];
        const intensity = Math.round((r + g + b) / 3);

        histR[r]++;
        histG[g]++;
        histB[b]++;
        histI[intensity]++;
    }
    return { r: histR, g: histG, b: histB, i: histI };
}

export function equalizeHistogramHSI(img) {
    // Equalização de histograma exclusiva no canal I do modelo HSI
    const width = img.bitmap.width;
    const height = img.bitmap.height;
    const data = img.bitmap.data;
    const totalPixels = width * height;

    const hsiArray = new Array(totalPixels);
    const histI = new Uint32Array(256);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const hsi = rgbToHsi(data[i + 0], data[i + 1], data[i + 2]);
        hsiArray[p] = hsi;
        histI[Math.round(hsi.i * 255)]++;
    }

    const lutI = new Float64Array(256);
    let sum = 0;
    const factor = 1 / totalPixels;
    for (let j = 0; j < 256; ++j) {
        sum += histI[j];
        lutI[j] = sum * factor;
    }

    const output = cloneImage(img);
    const dst = output.bitmap.data;

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        const hsi = hsiArray[p];
        const intIdx = Math.round(hsi.i * 255);
        const newI = lutI[intIdx];

        const rgb = hsiToRgb(hsi.h, hsi.s, newI);
        dst[i + 0] = rgb.r;
        dst[i + 1] = rgb.g;
        dst[i + 2] = rgb.b;
        dst[i + 3] = data[i + 3];
    }
    return output;
}

export function adjustHSI(img, deltaH = 0, deltaS = 0, deltaI = 0) {
    // Ajuste de matiz (angular), saturação e brilho no espaço HSI
    const output = cloneImage(img);
    const data = output.bitmap.data;

    for (let i = 0; i < data.length; i += 4) {
        const hsi = rgbToHsi(data[i + 0], data[i + 1], data[i + 2]);

        const newH = ((hsi.h + deltaH) % 360 + 360) % 360;
        const newS = Math.max(0, Math.min(1, hsi.s + deltaS));
        const newI = Math.max(0, Math.min(1, hsi.i + deltaI));

        const rgb = hsiToRgb(newH, newS, newI);
        data[i + 0] = rgb.r;
        data[i + 1] = rgb.g;
        data[i + 2] = rgb.b;
    }
    return output;
}

export function adjustColorChannels(img, deltaR = 0, deltaG = 0, deltaB = 0) {
    // Balanço de canais de cor opostos (C/R, M/G, Y/B)
    const output = cloneImage(img);
    const data = output.bitmap.data;

    for (let i = 0; i < data.length; i += 4) {
        data[i + 0] = clamp(data[i + 0] + deltaR);
        data[i + 1] = clamp(data[i + 1] + deltaG);
        data[i + 2] = clamp(data[i + 2] + deltaB);
    }
    return output;
}

export function sepia(img) {
    // Matriz de transformação clássica para efeito sépia
    const output = cloneImage(img);
    const data = output.bitmap.data;

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i + 0];
        const g = data[i + 1];
        const b = data[i + 2];

        const tr = 0.393 * r + 0.769 * g + 0.189 * b;
        const tg = 0.349 * r + 0.686 * g + 0.168 * b;
        const tb = 0.272 * r + 0.534 * g + 0.131 * b;

        data[i + 0] = clamp(tr);
        data[i + 1] = clamp(tg);
        data[i + 2] = clamp(tb);
    }
    return output;
}
