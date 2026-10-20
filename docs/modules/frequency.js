import { clamp, createImage } from "./auxiliary.js";

// ===============================================================================
// FREQUENCY DOMAIN

function nextPowerOfTwo(val) {
    let p = 1;
    while (p < val) p <<= 1;
    return p;
}

function fft1D(real, imag, inverse = false) {
    // In-place Cooley-Tukey Radix-2 1D Fast Fourier Transform
    const n = real.length;
    if (n <= 1) return;

    // Bit-reversal permutation
    for (let i = 0, j = 0; i < n; i++) {
        if (i < j) {
            const tr = real[i]; real[i] = real[j]; real[j] = tr;
            const ti = imag[i]; imag[i] = imag[j]; imag[j] = ti;
        }
        let bit = n >> 1;
        while (j & bit) {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
    }

    const angleSign = inverse ? 1 : -1;
    for (let len = 2; len <= n; len <<= 1) {
        const halfLen = len >> 1;
        const angle = (angleSign * 2 * Math.PI) / len;
        const wStepR = Math.cos(angle);
        const wStepI = Math.sin(angle);

        for (let i = 0; i < n; i += len) {
            let wr = 1;
            let wi = 0;
            for (let j = 0; j < halfLen; j++) {
                const uR = real[i + j];
                const uI = imag[i + j];
                const vR = real[i + j + halfLen] * wr - imag[i + j + halfLen] * wi;
                const vI = real[i + j + halfLen] * wi + imag[i + j + halfLen] * wr;

                real[i + j] = uR + vR;
                imag[i + j] = uI + vI;
                real[i + j + halfLen] = uR - vR;
                imag[i + j + halfLen] = uI - vI;

                const nextWr = wr * wStepR - wi * wStepI;
                wi = wr * wStepI + wi * wStepR;
                wr = nextWr;
            }
        }
    }

    if (inverse) {
        for (let i = 0; i < n; i++) {
            real[i] /= n;
            imag[i] /= n;
        }
    }
}

export function fft2D(img) {
    // 2D Fast Fourier Transform with spectrum centering via (-1)^(x + y)
    const origWidth = img.bitmap.width;
    const origHeight = img.bitmap.height;
    const src = img.bitmap.data;

    const M = nextPowerOfTwo(origWidth);
    const N = nextPowerOfTwo(origHeight);

    const real = new Float64Array(M * N);
    const imag = new Float64Array(M * N);

    // Populate centered spatial luminance
    for (let y = 0; y < origHeight; y++) {
        for (let x = 0; x < origWidth; x++) {
            const idx = (y * origWidth + x) * 4;
            const lum = 0.299 * src[idx + 0] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2];
            const sign = ((x + y) % 2 === 0) ? 1 : -1;
            real[y * M + x] = lum * sign;
        }
    }

    // 1D FFT along rows
    const rowR = new Float64Array(M);
    const rowI = new Float64Array(M);
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < M; x++) {
            rowR[x] = real[y * M + x];
            rowI[x] = imag[y * M + x];
        }
        fft1D(rowR, rowI, false);
        for (let x = 0; x < M; x++) {
            real[y * M + x] = rowR[x];
            imag[y * M + x] = rowI[x];
        }
    }

    // 1D FFT along columns
    const colR = new Float64Array(N);
    const colI = new Float64Array(N);
    for (let x = 0; x < M; x++) {
        for (let y = 0; y < N; y++) {
            colR[y] = real[y * M + x];
            colI[y] = imag[y * M + x];
        }
        fft1D(colR, colI, false);
        for (let y = 0; y < N; y++) {
            real[y * M + x] = colR[y];
            imag[y * M + x] = colI[y];
        }
    }

    return {
        real,
        imag,
        width: M,
        height: N,
        origWidth,
        origHeight
    };
}

export function getFourierSpectrum(fftData, mask = null) {
    // Computes the centered logarithmic magnitude spectrum D(u, v) = log(1 + |F(u, v)|) normalized to [0, 255].
    // A normalização usa o espectro original (sem máscara); se houver máscara, cada ponto é
    // multiplicado pelo seu peso, de modo que as frequências cortadas aparecem escurecidas.
    const { real, imag, width, height } = fftData;
    const total = width * height;
    const logMag = new Float64Array(total);
    let minVal = Infinity;
    let maxVal = -Infinity;

    for (let i = 0; i < total; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
        const val = Math.log(1 + mag);
        logMag[i] = val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
    }

    const spectrumImg = createImage(width, height);
    const dst = spectrumImg.bitmap.data;
    const range = maxVal - minVal;
    const scale = range === 0 ? 0 : 255 / range;

    for (let i = 0; i < total; i++) {
        const weight = mask ? getMaskWeight(mask, i, width, height) : 1;
        const gray = Math.round((logMag[i] - minVal) * scale * weight);
        const idx = i * 4;
        dst[idx + 0] = gray;
        dst[idx + 1] = gray;
        dst[idx + 2] = gray;
        dst[idx + 3] = 255;
    }
    return spectrumImg;
}

// Peso da máscara na posição i do espectro: função (u, v, M, N), vetor ou imagem de máscara
function getMaskWeight(mask, i, width, height) {
    if (typeof mask === 'function') {
        return mask(i % width, Math.floor(i / width), width, height);
    }
    if (Array.isArray(mask) || mask instanceof Float32Array || mask instanceof Float64Array) {
        return mask[i];
    }
    if (mask && mask.bitmap && mask.bitmap.data) {
        return mask.bitmap.data[i * 4] / 255;
    }
    return 1;
}

export function applyFourierMask(fftData, mask) {
    // Aplica máscara multiplicativa no domínio da frequência: F'(u, v) = F(u, v) * mask(u, v)
    const { real, imag, width, height } = fftData;
    const total = width * height;

    for (let i = 0; i < total; i++) {
        const weight = getMaskWeight(mask, i, width, height);
        real[i] *= weight;
        imag[i] *= weight;
    }
    return fftData;
}

export function ifft2D(fftData) {
    // 2D Inverse Fast Fourier Transform reconstructing the spatial domain image
    const { real, imag, width, height, origWidth, origHeight } = fftData;
    const M = width;
    const N = height;

    const rCopy = new Float64Array(real);
    const iCopy = new Float64Array(imag);

    // 1D IFFT along columns
    const colR = new Float64Array(N);
    const colI = new Float64Array(N);
    for (let x = 0; x < M; x++) {
        for (let y = 0; y < N; y++) {
            colR[y] = rCopy[y * M + x];
            colI[y] = iCopy[y * M + x];
        }
        fft1D(colR, colI, true);
        for (let y = 0; y < N; y++) {
            rCopy[y * M + x] = colR[y];
            iCopy[y * M + x] = colI[y];
        }
    }

    // 1D IFFT along rows
    const rowR = new Float64Array(M);
    const rowI = new Float64Array(M);
    for (let y = 0; y < N; y++) {
        for (let x = 0; x < M; x++) {
            rowR[x] = rCopy[y * M + x];
            rowI[x] = iCopy[y * M + x];
        }
        fft1D(rowR, rowI, true);
        for (let x = 0; x < M; x++) {
            rCopy[y * M + x] = rowR[x];
            iCopy[y * M + x] = rowI[x];
        }
    }

    // Uncenter via (-1)^(x + y) and crop to original image dimensions
    const output = createImage(origWidth, origHeight);
    const dst = output.bitmap.data;

    for (let y = 0; y < origHeight; y++) {
        for (let x = 0; x < origWidth; x++) {
            const sign = ((x + y) % 2 === 0) ? 1 : -1;
            const val = clamp(rCopy[y * M + x] * sign);
            const idx = (y * origWidth + x) * 4;

            dst[idx + 0] = val;
            dst[idx + 1] = val;
            dst[idx + 2] = val;
            dst[idx + 3] = 255;
        }
    }
    return output;
}
