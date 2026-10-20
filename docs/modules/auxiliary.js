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
