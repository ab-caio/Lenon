export function clamp(value, min = 0, max = 255) {
    return Math.max(min, Math.min(max, Math.round(value)));
}

export function createImage(width, height) {
    const J = globalThis.Jimp;
    if (typeof J === "function") {
        // Jimp 0.22.x (browser bundle): new Jimp(w, h, color, cb) or new Jimp(w, h, cb)
        try {
            const img = new J(width, height, 0x00000000, () => {});
            if (img && img.bitmap && img.bitmap.data) {
                return img;
            }
        } catch (e) {}

        try {
            const img = new J(width, height, () => {});
            if (img && img.bitmap && img.bitmap.data) {
                return img;
            }
        } catch (e) {}

        // Jimp 1.x (Node): new Jimp({ width, height })
        try {
            const img = new J({ width, height });
            if (img && img.bitmap && img.bitmap.data) {
                return img;
            }
        } catch (e) {}
    }

    // Universal fallback conforming to Jimp interface
    const data = new Uint8ClampedArray(width * height * 4);
    return {
        bitmap: {
            width,
            height,
            data
        },
        clone() {
            const copy = createImage(width, height);
            copy.bitmap.data.set(this.bitmap.data);
            return copy;
        },
        scan(x, y, w, h, cb) {
            for (let cy = y; cy < y + h; cy++) {
                for (let cx = x; cx < x + w; cx++) {
                    const idx = (cy * width + cx) * 4;
                    cb.call(this, cx, cy, idx);
                }
            }
            return this;
        },
        async getBase64Async(mime) {
            if (typeof document !== "undefined") {
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                const imgData = new ImageData(new Uint8ClampedArray(this.bitmap.data), width, height);
                ctx.putImageData(imgData, 0, 0);
                return canvas.toDataURL(mime || "image/png");
            }
            return "";
        }
    };
}

export function cloneImage(img) {
    if (!img) return null;
    if (typeof img.clone === "function") {
        try {
            const copy = img.clone();
            if (copy && copy.bitmap && copy.bitmap.data) {
                return copy;
            }
        } catch (e) {}
    }
    const copy = createImage(img.bitmap.width, img.bitmap.height);
    if (copy && copy.bitmap && copy.bitmap.data && img.bitmap && img.bitmap.data) {
        copy.bitmap.data.set(img.bitmap.data);
    }
    return copy;
}

// ===============================================================================
// EXPORTAÇÃO DE IMAGEM (PNG, JPEG, JPG, BMP)
// ===============================================================================

// "jpeg" e "jpg" são o mesmo formato; só muda a extensão do arquivo
export const EXPORT_FORMATS = {
    png:  { label: "PNG",           mime: "image/png",  ext: "png",  lossy: false, alpha: true },
    jpeg: { label: "JPEG",          mime: "image/jpeg", ext: "jpeg", lossy: true,  alpha: false },
    jpg:  { label: "JPG",           mime: "image/jpeg", ext: "jpg",  lossy: true,  alpha: false },
    bmp:  { label: "Bitmap (BMP)",  mime: "image/bmp",  ext: "bmp",  lossy: false, alpha: false }
};

// JPEG e BMP não têm transparência: compõe a imagem sobre fundo branco
// (c' = c·a/255 + 255·(255 − a)/255), em vez de deixar o fundo transparente virar preto.
export function flattenOnWhite(img) {
    const out = cloneImage(img);
    const data = out.bitmap.data;
    for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 255) continue;
        data[i + 0] = clamp((data[i + 0] * a + 255 * (255 - a)) / 255);
        data[i + 1] = clamp((data[i + 1] * a + 255 * (255 - a)) / 255);
        data[i + 2] = clamp((data[i + 2] * a + 255 * (255 - a)) / 255);
        data[i + 3] = 255;
    }
    return out;
}

// Codifica a imagem no formato escolhido; quality (1-100) vale só para JPEG/JPG
export async function encodeImage(img, formatKey, quality = 92) {
    const fmt = EXPORT_FORMATS[formatKey];
    if (!fmt) throw new Error(`Formato de exportação desconhecido: ${formatKey}`);

    const out = fmt.alpha ? cloneImage(img) : flattenOnWhite(img);
    if (fmt.lossy && typeof out.quality === "function") out.quality(clamp(quality, 1, 100));

    if (typeof out.getBufferAsync === "function") {
        return await out.getBufferAsync(fmt.mime);
    }
    const base64 = (await out.getBase64Async(fmt.mime)).split(",")[1];
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}