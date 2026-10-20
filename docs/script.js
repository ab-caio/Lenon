// O "?v=" força o navegador a carregar a versão atual dos módulos (evita cache antigo)
import * as spacial from "./modules/spacial.js?v=4";
import * as frequency from "./modules/frequency.js?v=4";
import { createImage, cloneImage, clamp } from "./modules/auxiliary.js?v=4";

if (typeof spacial.getRotationLayout !== "function") {
    alert("modules/spacial.js está desatualizado (sem a rotação com canvas ampliado). Substitua o arquivo e recarregue com Ctrl+F5.");
}

// ===============================================================================
// ESTADO GLOBAL DA APLICAÇÃO
// ===============================================================================

let originalImage = null;   // Objeto Jimp original carregado
let currentImage = null;    // Objeto Jimp após aplicação da lista de camadas
let previewImage = null;    // Miniatura em baixa resolução para resposta instantânea
let layers = [];            // Fila sequencial de camadas de filtros aplicados
let activeWindow = null;    // Janela modal flutuante ativa
let layerIdCounter = 1;
let isRecomputing = false;  // Trava de concorrência para execução sequencial
let pendingRecompute = false; // Re-agendamento automático se houver novas alterações pendentes

// Elementos principais do DOM
const imgInput = document.getElementById("img-input");
const saveBtn = document.getElementById("save-btn");
const canvasArea = document.getElementById("canvas-area");
const emptyCanvas = document.getElementById("empty-canvas");
const canvasContainer = document.getElementById("canvas");
const mainImg = document.getElementById("main-img");
const layersList = document.getElementById("layers-list");
const layersEmpty = document.querySelector(".layers-empty");

// Botões de filtros
const filterButtons = {
    negative: document.getElementById("negative"),
    threshold: document.getElementById("threshold"),
    brightness: document.getElementById("brightness"),
    gama: document.getElementById("gama"),
    linear: document.getElementById("linear-func"),
    histogram: document.getElementById("histogram"),
    histogramEq: document.getElementById("histogram-eq"),
    steganography: document.getElementById("esteganography"),
    smoothing: document.getElementById("smoothing"),
    median: document.getElementById("median"),
    laplacian: document.getElementById("laplacian-sharpen"),
    highBoost: document.getElementById("high-boost"),
    sobel: document.getElementById("sobel"),
    sobelMag: document.getElementById("sobel-magnitude"),
    convolution: document.getElementById("convolution"),
    fourier: document.getElementById("fourier"),
    colorProcessing: document.getElementById("color-processing")
};

// Ferramentas da barra esquerda
const toolScale = document.getElementById("tool-scale");
const toolRotate = document.getElementById("tool-rotate");

// ===============================================================================
// UTILITÁRIOS E GERENCIAMENTO DE IMAGEM
// ===============================================================================

function setControlsEnabled(enabled) {
    saveBtn.disabled = !enabled;
    Object.values(filterButtons).forEach(btn => {
        if (btn) btn.disabled = !enabled;
    });
    if (toolScale) {
        toolScale.classList.toggle("tool-item-disabled", !enabled);
    }
    if (toolRotate) {
        toolRotate.classList.toggle("tool-item-disabled", !enabled);
    }
}

async function imageToDataUrl(img) {
    if (typeof img.getBase64Async === "function") {
        return await img.getBase64Async(window.Jimp ? window.Jimp.MIME_PNG : "image/png");
    }
    // Fallback via canvas se o objeto for bitmap puro
    const canvas = document.createElement("canvas");
    canvas.width = img.bitmap.width;
    canvas.height = img.bitmap.height;
    const ctx = canvas.getContext("2d");
    const imgData = new ImageData(new Uint8ClampedArray(img.bitmap.data), img.bitmap.width, img.bitmap.height);
    ctx.putImageData(imgData, 0, 0);
    return canvas.toDataURL("image/png");
}

async function updateDisplay() {
    if (!currentImage) return;
    const url = await imageToDataUrl(currentImage);
    mainImg.src = url;
    emptyCanvas.style.display = "none";
    canvasContainer.style.display = "block";
}

function makePreviewClone(img, maxDim = 320) {
    if (!img || !img.bitmap) return null;
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    if (w <= maxDim && h <= maxDim) {
        return cloneImage(img);
    }
    const scale = Math.min(maxDim / w, maxDim / h);
    return spacial.scaleImage(img, scale, scale, 'nearest');
}

// Carregamento de imagem do disco
imgInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
        const arrayBuffer = await file.arrayBuffer();
        if (window.Jimp) {
            originalImage = await window.Jimp.read(arrayBuffer);
        } else {
            console.error("Biblioteca Jimp não encontrada no escopo global.");
            return;
        }

        currentImage = cloneImage(originalImage);
        previewImage = makePreviewClone(originalImage, 320);
        layers = [];
        layerIdCounter = 1;

        setControlsEnabled(true);
        await updateDisplay();
        renderLayersList();
    } catch (err) {
        console.error("Erro ao carregar a imagem:", err);
        alert("Não foi possível carregar o arquivo de imagem selecionado.");
    }
});

// Salvar imagem resultante
saveBtn.addEventListener("click", async () => {
    if (!currentImage) return;
    try {
        const url = await imageToDataUrl(currentImage);
        const a = document.createElement("a");
        a.href = url;
        a.download = "lenon_processado.png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } catch (err) {
        console.error("Erro ao salvar a imagem:", err);
    }
});

// ===============================================================================
// PIPELINE DE CAMADAS (PROCESSAMENTO NÃO-DESTRUTIVO)
// ===============================================================================

function cloneLayerParams(params) {
    if (!params || typeof params !== "object") return params;
    const copy = {};
    for (const key of Object.keys(params)) {
        const val = params[key];
        if (Array.isArray(val)) {
            if (val.length > 0 && Array.isArray(val[0])) {
                copy[key] = val.map(row => [...row]);
            } else {
                copy[key] = [...val];
            }
        } else if (val instanceof Float32Array) {
            copy[key] = new Float32Array(val);
        } else if (val instanceof Float64Array) {
            copy[key] = new Float64Array(val);
        } else if (val instanceof Uint8ClampedArray) {
            copy[key] = new Uint8ClampedArray(val);
        } else if (val instanceof Uint8Array) {
            copy[key] = new Uint8Array(val);
        } else if (val && typeof val === "object" && typeof val.scan === "function") {
            copy[key] = cloneImage(val);
        } else if (val && typeof val === "object") {
            copy[key] = cloneLayerParams(val);
        } else {
            copy[key] = val;
        }
    }
    return copy;
}

async function recomputePipeline() {
    if (!originalImage) return;

    if (isRecomputing) {
        pendingRecompute = true;
        return;
    }

    isRecomputing = true;
    try {
        let img = cloneImage(originalImage);

        for (const layer of layers) {
            if (layer.enabled === false) continue;
            try {
                img = await executeFilter(img, layer.type, layer.params);
            } catch (layerErr) {
                console.error(`Erro ao processar camada "${layer.name}":`, layerErr);
            }
        }

        currentImage = img;
        previewImage = makePreviewClone(currentImage, 320);
        await updateDisplay();
        renderLayersList();

        // Se uma janela de filtro está aberta, seu preview precisa partir da nova currentImage
        if (activeWindow && activeWindow.refresh) activeWindow.refresh();
    } catch (err) {
        console.error("Erro na recomputação do pipeline:", err);
    } finally {
        isRecomputing = false;
        if (pendingRecompute) {
            pendingRecompute = false;
            recomputePipeline();
        }
    }
}

async function executeFilter(targetImg, type, params) {
    switch (type) {
        case "negative":
            return await spacial.inversion(targetImg);
        case "threshold":
            return await spacial.threshold(targetImg, params.limit);
        case "brightness":
            return await spacial.brightness(targetImg, params.value);
        case "gama":
            return await spacial.gammaCorrection(targetImg, params.gamma, params.constant);
        case "linear":
            return await spacial.pieceWise(targetImg, params.rPoints, params.sPoints);
        case "histogram-eq":
            if (params.mode === "hsi") {
                return spacial.equalizeHistogramHSI(targetImg);
            }
            return await spacial.equalizeHistogram(targetImg);
        case "steganography":
            return spacial.encode(targetImg, params.message);
        case "smoothing":
            if (params.method === "gaussian") {
                return spacial.gaussianBlur(targetImg, params.size, params.sigma);
            }
            return spacial.boxBlur(targetImg, params.size);
        case "median":
            return spacial.medianFilter(targetImg, params.size);
        case "laplacian":
            return spacial.laplacianFilter(targetImg, params);
        case "high-boost":
            return spacial.highBoostFilter(targetImg, params.A, params.size);
        case "sobel":
            if (params.axis === "y") {
                return spacial.sobelY(targetImg, { normalize: true });
            }
            return spacial.sobelX(targetImg, { normalize: true });
        case "sobel-magnitude":
            return spacial.sobelMagnitude(targetImg, { normalize: true });
        case "convolution":
            return spacial.convolve2D(targetImg, params.kernel, params.options);
        case "scale":
            return spacial.scaleImage(targetImg, params.scaleX, params.scaleY, params.interpolation);
        case "rotate":
            return spacial.rotateImage(targetImg, params.angle, params.pivotX, params.pivotY, params.interpolation);
        case "fourier": {
            const fftRes = frequency.fft2D(targetImg);
            if (params.mask) {
                frequency.applyFourierMask(fftRes, params.mask);
            }
            return frequency.ifft2D(fftRes);
        }
        case "sepia":
            return spacial.sepia(targetImg);
        case "grayscale":
            return spacial.convertToGrayscale(targetImg, params.method);
        case "color-inversion":
            return spacial.colorInversion(targetImg);
        case "adjust-hsi":
            return spacial.adjustHSI(targetImg, params.deltaH, params.deltaS, params.deltaI);
        case "adjust-channels":
            return spacial.adjustColorChannels(targetImg, params.deltaR, params.deltaG, params.deltaB);
        case "chroma-key":
            return spacial.chromaKey(targetImg, params.bgImg, params.targetColor, params.tolerance);
        default:
            return targetImg;
    }
}

function addLayer(name, type, params) {
    layers.push({
        id: layerIdCounter++,
        name,
        type,
        params: cloneLayerParams(params),
        enabled: true
    });
    recomputePipeline();
}

function removeLayer(id) {
    layers = layers.filter(l => l.id !== id);
    recomputePipeline();
}

function toggleLayer(id) {
    const layer = layers.find(l => l.id === id);
    if (layer) {
        layer.enabled = !layer.enabled;
        recomputePipeline();
    }
}

function renderLayersList() {
    layersList.innerHTML = "";

    if (layers.length === 0) {
        layersEmpty.style.display = "block";
        return;
    }

    layersEmpty.style.display = "none";

    layers.forEach((layer, idx) => {
        const row = document.createElement("div");
        row.className = `layer-row ${layer.enabled ? "" : "disabled"}`.trim();
        row.draggable = true;
        row.dataset.id = layer.id;
        row.dataset.index = idx;

        row.innerHTML = `
            <button class="toggle-btn" title="${layer.enabled ? "Ocultar camada" : "Exibir camada"}">${layer.enabled ? "👁" : "🚫"}</button>
            <span class="num">${idx + 1}</span>
            <span class="name" title="${layer.name}">${layer.name}</span>
            <button class="remove-btn" title="Remover camada">✕</button>
        `;

        row.querySelector(".toggle-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            toggleLayer(layer.id);
        });

        row.querySelector(".remove-btn").addEventListener("click", (e) => {
            e.stopPropagation();
            removeLayer(layer.id);
        });

        // Drag & drop reordering
        row.addEventListener("dragstart", (e) => {
            row.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", idx);
        });

        row.addEventListener("dragend", () => {
            row.classList.remove("dragging");
            document.querySelectorAll(".layer-row").forEach(r => r.classList.remove("drag-over"));
        });

        row.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            row.classList.add("drag-over");
        });

        row.addEventListener("dragleave", () => {
            row.classList.remove("drag-over");
        });

        row.addEventListener("drop", (e) => {
            e.preventDefault();
            row.classList.remove("drag-over");
            const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
            const toIndex = idx;
            if (!isNaN(fromIndex) && fromIndex !== toIndex) {
                const moved = layers.splice(fromIndex, 1)[0];
                layers.splice(toIndex, 0, moved);
                recomputePipeline();
            }
        });

        layersList.appendChild(row);
    });
}

// ===============================================================================
// SISTEMA DE JANELAS FLUTUANTES (FILTER WINDOWS)
// ===============================================================================

function closeActiveWindow() {
    if (activeWindow) {
        activeWindow.remove();
        activeWindow = null;
    }
}

// Mantém a janela inteira dentro da interface (posição e tamanho). Chamada ao criar,
// ao arrastar, ao redimensionar a tela e sempre que o conteúdo da janela muda.
function fitWindow(win) {
    const view = document.documentElement;
    const viewW = view.clientWidth;
    const viewH = view.clientHeight;

    // Libera o limite anterior para medir o tamanho natural e reposicionar se o conteúdo cresceu
    win.style.maxWidth = "";
    win.style.maxHeight = "";

    const left = Math.max(0, Math.min(win.offsetLeft, viewW - win.offsetWidth));
    const top = Math.max(0, Math.min(win.offsetTop, viewH - win.offsetHeight));
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;

    // A alça de redimensionamento não pode estender a janela para fora da tela
    win.style.maxWidth = `${viewW - left}px`;
    win.style.maxHeight = `${viewH - top}px`;
}

// HTML padrão das janelas com opções: imagem de preview à esquerda e
// gráficos / sliders / escolhas à direita (coluna .fw-col-main)
function splitLayout(optionsHtml) {
    return `
        <div class="fw-body-split">
            <div class="fw-col-image">
                <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
            </div>
            <div class="fw-col-main">${optionsHtml}</div>
        </div>
    `;
}

function createWindow({ title, extraClass = "", bodyHtml, onInit, onApply }) {
    closeActiveWindow();

    const win = document.createElement("div");
    win.className = `filter-window ${extraClass}`.trim();

    win.innerHTML = `
        <div class="fw-head">
            <span>${title}</span>
            <button class="fw-close" title="Fechar">✕</button>
        </div>
        <div class="fw-body">
            ${bodyHtml}
            ${onApply ? `<button class="fw-apply">Aplicar</button>` : ""}
        </div>
    `;

    document.body.appendChild(win);
    activeWindow = win;

    // Fechar ao clicar no X
    win.querySelector(".fw-close").addEventListener("click", closeActiveWindow);

    // Arrasto pelo cabeçalho (pointer capture: não precisa de listeners globais)
    const head = win.querySelector(".fw-head");
    let grabX = null;
    let grabY = null;

    head.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest(".fw-close")) return;
        grabX = e.clientX - win.offsetLeft;
        grabY = e.clientY - win.offsetTop;
        head.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
    });

    head.addEventListener("pointermove", (e) => {
        if (grabX === null) return;
        win.style.left = `${e.clientX - grabX}px`;
        win.style.top = `${e.clientY - grabY}px`;
        fitWindow(win);
    });

    const endDrag = () => {
        grabX = null;
        grabY = null;
        document.body.style.userSelect = "";
    };
    head.addEventListener("pointerup", endDrag);
    head.addEventListener("pointercancel", endDrag);

    // Qualquer mudança de conteúdo (abas, grade do kernel, linhas de pontos...) reajusta a janela
    new MutationObserver(() => fitWindow(win)).observe(win.querySelector(".fw-body"), {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"]
    });

    if (onInit) onInit(win);

    // Centraliza já com o conteúdo inicial montado
    win.style.left = `${Math.round((document.documentElement.clientWidth - win.offsetWidth) / 2)}px`;
    win.style.top = `${Math.round((document.documentElement.clientHeight - win.offsetHeight) / 2)}px`;
    fitWindow(win);

    if (onApply) {
        const applyBtn = win.querySelector(".fw-apply");
        if (applyBtn) {
            applyBtn.addEventListener("click", async () => {
                await onApply(win);
                closeActiveWindow();
            });
        }
    }

    return win;
}

window.addEventListener("resize", () => {
    if (activeWindow) fitWindow(activeWindow);
});

// ===============================================================================
// GRÁFICOS INTERATIVOS (CURVAS ARRASTÁVEIS)
// ===============================================================================

// Liga eventos de mouse a um canvas de gráfico. Coordenadas entregues aos callbacks:
// x, y em [0, 1] (y cresce para cima) e px, py, w, h em pixels do canvas na tela.
// Botão esquerdo: onDown (retorne false para não iniciar arrasto) e onDrag.
// Botão direito: onRightClick.
function bindGraph(canvas, { onDown, onDrag, onRightClick }) {
    let dragging = false;

    function locate(e) {
        const rect = canvas.getBoundingClientRect();
        const px = Math.min(rect.width, Math.max(0, e.clientX - rect.left));
        const py = Math.min(rect.height, Math.max(0, e.clientY - rect.top));
        return { x: px / rect.width, y: 1 - py / rect.height, px, py, w: rect.width, h: rect.height };
    }

    canvas.style.touchAction = "none";
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    canvas.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        if (e.button === 0) {
            dragging = onDown(locate(e)) !== false;
            if (dragging) canvas.setPointerCapture(e.pointerId);
        } else if (e.button === 2 && onRightClick) {
            onRightClick(locate(e));
        }
    });

    canvas.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        if (!(e.buttons & 1)) {
            dragging = false;
            return;
        }
        onDrag(locate(e));
    });

    const stop = () => { dragging = false; };
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
}

// Fundo e grade dos gráficos de curva (canvas quadrado)
function drawGraphGrid(ctx, size) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < 4; i++) {
        ctx.moveTo((size * i) / 4, 0); ctx.lineTo((size * i) / 4, size);
        ctx.moveTo(0, (size * i) / 4); ctx.lineTo(size, (size * i) / 4);
    }
    ctx.stroke();
}

// ===============================================================================
// MODAIS DE CADA FILTRO E FERRAMENTA
// ===============================================================================

// 1. Negativo
filterButtons.negative.addEventListener("click", () => {
    if (!currentImage) return;
    createWindow({
        title: "Negativo (Inversão)",
        bodyHtml: `
            <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
            <p style="color: var(--text-muted); font-size: 11px;">Inverte os valores dos canais R, G e B (s = 255 - r).</p>
        `,
        onInit: (win) => {
            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                await spacial.inversion(prev);
                win.querySelector("#fw-prev-img").src = await imageToDataUrl(prev);
            }
            win.refresh = updatePreview;
            updatePreview();
        },
        onApply: () => {
            addLayer("Negativo", "negative", {});
        }
    });
});

// 2. Limiarização
filterButtons.threshold.addEventListener("click", () => {
    if (!currentImage) return;
    let currentLimit = 128;

    createWindow({
        title: "Limiarização",
        bodyHtml: `
            <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
            <div class="fw-controls">
                <div class="fw-control-header">
                    <label>Limiar (Threshold)</label>
                    <input type="number" class="fw-value" id="val-input" min="0" max="255" value="128">
                </div>
                <input type="range" id="range-input" min="0" max="255" value="128">
            </div>
        `,
        onInit: (win) => {
            const range = win.querySelector("#range-input");
            const num = win.querySelector("#val-input");
            const prevImg = win.querySelector("#fw-prev-img");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                await spacial.threshold(prev, currentLimit);
                prevImg.src = await imageToDataUrl(prev);
            }

            range.addEventListener("input", (e) => {
                currentLimit = parseInt(e.target.value, 10);
                num.value = currentLimit;
                updatePreview();
            });

            num.addEventListener("change", (e) => {
                currentLimit = Math.max(0, Math.min(255, parseInt(e.target.value, 10) || 0));
                num.value = currentLimit;
                range.value = currentLimit;
                updatePreview();
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`Limiarização (${currentLimit})`, "threshold", { limit: currentLimit });
        }
    });
});

// 3. Brilho
filterButtons.brightness.addEventListener("click", () => {
    if (!currentImage) return;
    let currentVal = 30;

    createWindow({
        title: "Ajuste de Brilho",
        bodyHtml: `
            <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
            <div class="fw-controls">
                <div class="fw-control-header">
                    <label>Intensidade</label>
                    <input type="number" class="fw-value" id="val-input" min="-255" max="255" value="30">
                </div>
                <input type="range" id="range-input" min="-255" max="255" value="30">
            </div>
        `,
        onInit: (win) => {
            const range = win.querySelector("#range-input");
            const num = win.querySelector("#val-input");
            const prevImg = win.querySelector("#fw-prev-img");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                await spacial.brightness(prev, currentVal);
                prevImg.src = await imageToDataUrl(prev);
            }

            range.addEventListener("input", (e) => {
                currentVal = parseInt(e.target.value, 10);
                num.value = currentVal;
                updatePreview();
            });

            num.addEventListener("change", (e) => {
                currentVal = Math.max(-255, Math.min(255, parseInt(e.target.value, 10) || 0));
                num.value = currentVal;
                range.value = currentVal;
                updatePreview();
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`Brilho (${currentVal >= 0 ? "+" + currentVal : currentVal})`, "brightness", { value: currentVal });
        }
    });
});

// 4. Correção de Gama
filterButtons.gama.addEventListener("click", () => {
    if (!currentImage) return;
    const GAMMA_MAX = 50;
    let gamma = 1.8;
    const constant = 1.0;
    let handleR = 0.5;      // posição (em r) do ponto arrastável sobre a curva

    createWindow({
        title: "Correção de Gama (Potência)",
        extraClass: "fw-wide",
        bodyHtml: splitLayout(`
            <div class="fw-curve">
                <canvas id="gamma-canvas" width="200" height="200"></canvas>
            </div>
            <span class="fw-curve-hint">s = c · r<sup>γ</sup> — arraste a curva com o botão esquerdo</span>
            <div class="fw-controls">
                <div class="fw-control-header">
                    <label>Gama (γ)</label>
                    <input type="number" class="fw-value" id="gamma-num" min="0" max="${GAMMA_MAX}" step="0.1" value="1.80">
                </div>
                <input type="range" id="gamma-range" min="0" max="${GAMMA_MAX}" step="0.01" value="1.8">
            </div>
        `),
        onInit: (win) => {
            const canvas = win.querySelector("#gamma-canvas");
            const ctx = canvas.getContext("2d");
            const gRange = win.querySelector("#gamma-range");
            const gNum = win.querySelector("#gamma-num");
            const prevImg = win.querySelector("#fw-prev-img");
            let previewToken = 0;

            const curveY = (r) => Math.min(1, constant * Math.pow(r, gamma));

            function drawCurve() {
                const size = canvas.width;
                drawGraphGrid(ctx, size);

                // Curva s = c * r^gamma (amostrada com 2 pontos por pixel: γ alto é muito inclinado)
                ctx.strokeStyle = "#6366f1";
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i <= size * 2; i++) {
                    const r = i / (size * 2);
                    const x = r * size;
                    const y = size - curveY(r) * size;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

                // Ponto arrastável
                ctx.fillStyle = "#fff";
                ctx.beginPath();
                ctx.arc(handleR * size, size - curveY(handleR) * size, 4, 0, Math.PI * 2);
                ctx.fill();
            }

            async function updatePreview() {
                drawCurve();
                const mine = ++previewToken;
                const prev = makePreviewClone(currentImage, 240);
                await spacial.gammaCorrection(prev, gamma, constant);
                const url = await imageToDataUrl(prev);
                if (mine === previewToken) prevImg.src = url;
            }
            win.refresh = updatePreview;

            function setGamma(value) {
                gamma = Math.max(0, Math.min(GAMMA_MAX, value));
                gRange.value = gamma;
                gNum.value = gamma.toFixed(2);
                updatePreview();
            }

            // A curva passa pelo cursor: s = r^γ  =>  γ = ln(s) / ln(r)
            function gammaFromPoint(p) {
                handleR = Math.min(0.98, Math.max(0.02, p.x));
                const s = Math.min(1, Math.max(1e-9, p.y)) / constant;
                setGamma(Math.log(s) / Math.log(handleR));
            }

            bindGraph(canvas, {
                onDown: gammaFromPoint,
                onDrag: gammaFromPoint
            });

            gRange.addEventListener("input", (e) => setGamma(parseFloat(e.target.value)));

            gNum.addEventListener("change", (e) => {
                const value = parseFloat(e.target.value);
                setGamma(Number.isNaN(value) ? gamma : value);
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`Gama (γ=${gamma.toFixed(2)})`, "gama", { gamma, constant });
        }
    });
});

// 5. Transformação Linear por Partes
filterButtons.linear.addEventListener("click", () => {
    if (!currentImage) return;
    const MAX_POINTS = 8;
    const HIT_RADIUS = 9;   // raio de captura de um ponto, em pixels
    let rPoints = [0, 80, 180, 255];
    let sPoints = [0, 30, 220, 255];

    createWindow({
        title: "Transformação Linear por Partes",
        extraClass: "fw-wide",
        bodyHtml: splitLayout(`
            <div class="fw-curve">
                <canvas id="piece-canvas" width="200" height="200"></canvas>
            </div>
            <span class="fw-curve-hint">Esquerdo: criar / arrastar ponto — Direito: apagar (máx. ${MAX_POINTS})</span>
            <div class="fw-point-fields" id="points-container"></div>
            <button class="fw-reveal-btn" id="add-point-btn">+ Adicionar Ponto</button>
        `),
        onInit: (win) => {
            const canvas = win.querySelector("#piece-canvas");
            const ctx = canvas.getContext("2d");
            const container = win.querySelector("#points-container");
            const addBtn = win.querySelector("#add-point-btn");
            const prevImg = win.querySelector("#fw-prev-img");
            let previewToken = 0;
            let dragIndex = -1;

            // Os pontos ficam sempre em ordem estritamente crescente de r; as pontas (r=0 e r=255) só movem em s
            function movePoint(i, r, s) {
                if (i > 0 && i < rPoints.length - 1) {
                    rPoints[i] = clamp(r, rPoints[i - 1] + 1, rPoints[i + 1] - 1);
                }
                sPoints[i] = clamp(s, 0, 255);
            }

            // Insere ponto entre vizinhos, ajustando r para não repetir valores; retorna o índice ou -1
            function insertPoint(r, s) {
                if (rPoints.length >= MAX_POINTS) return -1;
                let i = 1;
                while (i < rPoints.length - 1 && rPoints[i] < r) i++;
                const lo = rPoints[i - 1] + 1;
                const hi = rPoints[i] - 1;
                if (lo > hi) return -1;
                rPoints.splice(i, 0, clamp(r, lo, hi));
                sPoints.splice(i, 0, clamp(s, 0, 255));
                return i;
            }

            function removePoint(i) {
                if (i <= 0 || i >= rPoints.length - 1) return;
                rPoints.splice(i, 1);
                sPoints.splice(i, 1);
            }

            // Ponto mais próximo do cursor dentro do raio de captura
            function hitIndex(p) {
                let best = -1;
                let bestDist = HIT_RADIUS * HIT_RADIUS;
                rPoints.forEach((r, i) => {
                    const dx = (r / 255) * p.w - p.px;
                    const dy = (1 - sPoints[i] / 255) * p.h - p.py;
                    const dist = dx * dx + dy * dy;
                    if (dist <= bestDist) {
                        bestDist = dist;
                        best = i;
                    }
                });
                return best;
            }

            function drawCurve() {
                const size = canvas.width;
                drawGraphGrid(ctx, size);

                ctx.strokeStyle = "#6366f1";
                ctx.lineWidth = 2;
                ctx.beginPath();
                rPoints.forEach((r, i) => {
                    const cx = (r / 255) * size;
                    const cy = size - (sPoints[i] / 255) * size;
                    if (i === 0) ctx.moveTo(cx, cy);
                    else ctx.lineTo(cx, cy);
                });
                ctx.stroke();

                rPoints.forEach((r, i) => {
                    ctx.fillStyle = i === dragIndex ? "#6366f1" : "#fff";
                    ctx.beginPath();
                    ctx.arc((r / 255) * size, size - (sPoints[i] / 255) * size, 4, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            function renderPointRows() {
                container.innerHTML = "";
                rPoints.forEach((r, idx) => {
                    const row = document.createElement("div");
                    row.className = "fw-point-row";
                    const isEdge = idx === 0 || idx === rPoints.length - 1;
                    row.innerHTML = `
                        <input type="number" class="fw-value r-val" min="0" max="255" value="${r}" ${isEdge ? "disabled" : ""}>
                        <span class="fw-point-sep">→</span>
                        <input type="number" class="fw-value s-val" min="0" max="255" value="${sPoints[idx]}">
                        ${!isEdge ? `<button class="fw-point-remove" title="Remover">✕</button>` : ""}
                    `;

                    row.querySelector(".r-val").addEventListener("change", (e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!Number.isNaN(value)) movePoint(idx, value, sPoints[idx]);
                        update();
                    });

                    row.querySelector(".s-val").addEventListener("change", (e) => {
                        const value = parseInt(e.target.value, 10);
                        if (!Number.isNaN(value)) movePoint(idx, rPoints[idx], value);
                        update();
                    });

                    const remBtn = row.querySelector(".fw-point-remove");
                    if (remBtn) {
                        remBtn.addEventListener("click", () => {
                            removePoint(idx);
                            update();
                        });
                    }
                    container.appendChild(row);
                });
            }

            async function updatePreview() {
                const mine = ++previewToken;
                const prev = makePreviewClone(currentImage, 240);
                await spacial.pieceWise(prev, rPoints, sPoints);
                const url = await imageToDataUrl(prev);
                if (mine === previewToken) prevImg.src = url;
            }
            win.refresh = updatePreview;

            function update() {
                drawCurve();
                renderPointRows();
                updatePreview();
            }

            bindGraph(canvas, {
                // Clique: pega o ponto sob o cursor ou cria um novo, e já o arrasta
                onDown: (p) => {
                    dragIndex = hitIndex(p);
                    if (dragIndex < 0) dragIndex = insertPoint(Math.round(p.x * 255), Math.round(p.y * 255));
                    if (dragIndex < 0) return false;
                    update();
                },
                onDrag: (p) => {
                    movePoint(dragIndex, Math.round(p.x * 255), Math.round(p.y * 255));
                    update();
                },
                onRightClick: (p) => {
                    removePoint(hitIndex(p));
                    update();
                }
            });

            // Solta o ponto ao terminar o arrasto (o pointerup é do próprio canvas, por pointer capture)
            canvas.addEventListener("pointerup", () => {
                dragIndex = -1;
                drawCurve();
            });

            // Novo ponto no meio do maior intervalo, sobre a curva atual (não altera a função)
            addBtn.addEventListener("click", () => {
                let g = 0;
                for (let i = 1; i < rPoints.length - 1; i++) {
                    if (rPoints[i + 1] - rPoints[i] > rPoints[g + 1] - rPoints[g]) g = i;
                }
                const r = Math.round((rPoints[g] + rPoints[g + 1]) / 2);
                const t = (r - rPoints[g]) / (rPoints[g + 1] - rPoints[g]);
                insertPoint(r, sPoints[g] + t * (sPoints[g + 1] - sPoints[g]));
                update();
            });

            update();
        },
        onApply: () => {
            addLayer("Linear por partes", "linear", { rPoints, sPoints });
        }
    });
});

// 6. Histograma
filterButtons.histogram.addEventListener("click", async () => {
    if (!currentImage) return;

    createWindow({
        title: "Histograma da Imagem",
        extraClass: "fw-wide",
        bodyHtml: `
            <div class="fw-channel-tabs">
                <button class="fw-channel-tab active" data-channel="gray">Intensidade (Y)</button>
                <button class="fw-channel-tab" data-channel="r">Vermelho (R)</button>
                <button class="fw-channel-tab" data-channel="g">Verde (G)</button>
                <button class="fw-channel-tab" data-channel="b">Azul (B)</button>
            </div>
            <div class="fw-histogram-canvas-wrap">
                <canvas class="fw-histogram-canvas" id="hist-canvas" width="450" height="200"></canvas>
            </div>
            <span class="fw-curve-hint" id="hist-readout">Passe o mouse sobre o gráfico para ler os valores</span>
        `,
        onInit: async (win) => {
            const canvas = win.querySelector("#hist-canvas");
            const ctx = canvas.getContext("2d");
            const tabs = win.querySelectorAll(".fw-channel-tab");

            const readout = win.querySelector("#hist-readout");
            let colorHist = await spacial.getColorHistogram(currentImage);
            let grayHist = await spacial.getHistogram(currentImage, "gray");
            let channel = "gray";
            let shownData = null;

            function drawHistogram(selected) {
                channel = selected;
                let data;
                let color;
                if (channel === "r") { data = colorHist.r; color = "#ef4444"; }
                else if (channel === "g") { data = colorHist.g; color = "#22c55e"; }
                else if (channel === "b") { data = colorHist.b; color = "#3b82f6"; }
                else { data = grayHist; color = "#e0e0e0"; }
                shownData = data;

                ctx.fillStyle = "#1a1a1a";
                ctx.fillRect(0, 0, 450, 200);

                let maxCount = 0;
                for (let i = 0; i < 256; i++) {
                    if (data[i] > maxCount) maxCount = data[i];
                }
                if (maxCount === 0) maxCount = 1;

                ctx.fillStyle = color;
                const barWidth = 450 / 256;
                for (let i = 0; i < 256; i++) {
                    const h = (data[i] / maxCount) * 180;
                    ctx.fillRect(i * barWidth, 195 - h, barWidth, h);
                }
            }

            tabs.forEach(tab => {
                tab.addEventListener("click", () => {
                    tabs.forEach(t => t.classList.remove("active"));
                    tab.classList.add("active");
                    drawHistogram(tab.dataset.channel);
                });
            });

            canvas.addEventListener("pointermove", (e) => {
                const rect = canvas.getBoundingClientRect();
                const level = Math.min(255, Math.max(0, Math.floor(((e.clientX - rect.left) / rect.width) * 256)));
                readout.textContent = `Nível ${level}: ${shownData[level]} pixels`;
            });

            canvas.addEventListener("pointerleave", () => {
                readout.textContent = "Passe o mouse sobre o gráfico para ler os valores";
            });

            win.refresh = async () => {
                colorHist = await spacial.getColorHistogram(currentImage);
                grayHist = await spacial.getHistogram(currentImage, "gray");
                drawHistogram(channel);
            };

            drawHistogram("gray");
        }
    });
});

// 7. Equalização de Histograma
filterButtons.histogramEq.addEventListener("click", () => {
    if (!currentImage) return;
    let mode = "gray";

    createWindow({
        title: "Equalização de Histograma",
        extraClass: "fw-wide",
        bodyHtml: splitLayout(`
            <div class="fw-radio-row">
                <label><input type="radio" name="eq-mode" value="gray" checked> Tons de Cinza</label>
                <label><input type="radio" name="eq-mode" value="hsi"> Colorido (Espaço HSI)</label>
            </div>
        `),
        onInit: (win) => {
            const prevImg = win.querySelector("#fw-prev-img");
            const radios = win.querySelectorAll("input[name='eq-mode']");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                let res;
                if (mode === "hsi") {
                    res = spacial.equalizeHistogramHSI(prev);
                } else {
                    res = await spacial.equalizeHistogram(prev);
                }
                prevImg.src = await imageToDataUrl(res);
            }

            radios.forEach(r => {
                r.addEventListener("change", (e) => {
                    mode = e.target.value;
                    updatePreview();
                });
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`Equalização (${mode === "hsi" ? "HSI" : "Cinza"})`, "histogram-eq", { mode });
        }
    });
});

// 8. Esteganografia
filterButtons.steganography.addEventListener("click", () => {
    if (!currentImage) return;
    const maxCapacity = Math.floor((currentImage.bitmap.width * currentImage.bitmap.height * 3) / 8) - 1;

    createWindow({
        title: "Esteganografia (LSB)",
        bodyHtml: `
            <textarea class="fw-textarea" id="stego-text" rows="3" placeholder="Digite a mensagem secreta a ocultar..."></textarea>
            <div class="fw-stego-capacity" id="stego-cap">Capacidade máxima: ${maxCapacity} caracteres</div>
            <div style="margin-top: 10px;">
                <button class="fw-reveal-btn" id="reveal-btn">Revelar Mensagem da Imagem Atual</button>
                <div class="fw-stego-revealed" id="revealed-box" style="display: none;"></div>
            </div>
        `,
        onInit: (win) => {
            const revealBtn = win.querySelector("#reveal-btn");
            const revealedBox = win.querySelector("#revealed-box");

            revealBtn.addEventListener("click", () => {
                const msg = spacial.decode(currentImage);
                revealedBox.style.display = "block";
                revealedBox.textContent = msg ? `Mensagem encontrada: "${msg}"` : "Nenhuma mensagem oculta encontrada.";
            });
        },
        onApply: (win) => {
            const msg = win.querySelector("#stego-text").value;
            if (!msg) {
                alert("Digite uma mensagem para codificar.");
                return;
            }
            addLayer("Esteganografia LSB", "steganography", { message: msg });
        }
    });
});

// 9. Suavização (Média / Gaussiano)
filterButtons.smoothing.addEventListener("click", () => {
    if (!currentImage) return;
    let method = "box";
    let size = 3;
    let sigma = 1.0;

    createWindow({
        title: "Suavização Espacial",
        extraClass: "fw-wide",
        bodyHtml: splitLayout(`
            <div class="fw-radio-row">
                <label><input type="radio" name="smooth-method" value="box" checked> Média Simples</label>
                <label><input type="radio" name="smooth-method" value="gaussian"> Gaussiano</label>
            </div>
            <div class="fw-controls">
                <div class="fw-control-header">
                    <label>Tamanho da Máscara</label>
                    <span id="size-label">3x3</span>
                </div>
                <input type="range" id="size-range" min="3" max="9" step="2" value="3">
            </div>
            <div class="fw-controls" id="sigma-controls" style="display: none;">
                <div class="fw-control-header">
                    <label>Sigma (σ)</label>
                    <input type="number" class="fw-value" id="sigma-val" min="0.2" max="5.0" step="0.1" value="1.0">
                </div>
                <input type="range" id="sigma-range" min="0.2" max="5.0" step="0.1" value="1.0">
            </div>
        `),
        onInit: (win) => {
            const prevImg = win.querySelector("#fw-prev-img");
            const radios = win.querySelectorAll("input[name='smooth-method']");
            const sizeRange = win.querySelector("#size-range");
            const sizeLabel = win.querySelector("#size-label");
            const sigmaControls = win.querySelector("#sigma-controls");
            const sigmaRange = win.querySelector("#sigma-range");
            const sigmaNum = win.querySelector("#sigma-val");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                let res;
                if (method === "gaussian") {
                    res = spacial.gaussianBlur(prev, size, sigma);
                } else {
                    res = spacial.boxBlur(prev, size);
                }
                prevImg.src = await imageToDataUrl(res);
            }

            radios.forEach(r => {
                r.addEventListener("change", (e) => {
                    method = e.target.value;
                    sigmaControls.style.display = method === "gaussian" ? "flex" : "none";
                    updatePreview();
                });
            });

            sizeRange.addEventListener("input", (e) => {
                size = parseInt(e.target.value, 10);
                sizeLabel.textContent = `${size}x${size}`;
                updatePreview();
            });

            sigmaRange.addEventListener("input", (e) => {
                sigma = parseFloat(e.target.value);
                sigmaNum.value = sigma.toFixed(1);
                updatePreview();
            });

            sigmaNum.addEventListener("change", (e) => {
                sigma = Math.max(0.1, parseFloat(e.target.value) || 1.0);
                sigmaRange.value = sigma;
                updatePreview();
            });

            updatePreview();
        },
        onApply: () => {
            const name = method === "gaussian" ? `Gaussiano (${size}x${size}, σ=${sigma})` : `Média (${size}x${size})`;
            addLayer(name, "smoothing", { method, size, sigma });
        }
    });
});

// 10. Mediana
filterButtons.median.addEventListener("click", () => {
    if (!currentImage) return;
    let size = 3;

    createWindow({
        title: "Filtro da Mediana",
        bodyHtml: `
            <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
            <div class="fw-controls" style="margin-top: 8px;">
                <div class="fw-control-header">
                    <label>Tamanho da Janela</label>
                    <span id="size-label">3x3</span>
                </div>
                <input type="range" id="size-range" min="3" max="7" step="2" value="3">
            </div>
        `,
        onInit: (win) => {
            const prevImg = win.querySelector("#fw-prev-img");
            const sizeRange = win.querySelector("#size-range");
            const sizeLabel = win.querySelector("#size-label");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                const res = spacial.medianFilter(prev, size);
                prevImg.src = await imageToDataUrl(res);
            }

            sizeRange.addEventListener("input", (e) => {
                size = parseInt(e.target.value, 10);
                sizeLabel.textContent = `${size}x${size}`;
                updatePreview();
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`Mediana (${size}x${size})`, "median", { size });
        }
    });
});

// 11. Laplaciano
filterButtons.laplacian.addEventListener("click", () => {
    if (!currentImage) return;
    let variant = "8";
    let sharpen = true;

    createWindow({
        title: "Filtro Laplaciano",
        extraClass: "fw-wide",
        bodyHtml: splitLayout(`
            <div class="fw-radio-row">
                <label><input type="radio" name="lap-variant" value="8" checked> 8 Vizinhos</label>
                <label><input type="radio" name="lap-variant" value="4"> 4 Vizinhos</label>
            </div>
            <div class="fw-checkbox-row">
                <input type="checkbox" id="lap-sharpen" checked>
                <label for="lap-sharpen">Aguçar imagem (somar bordas à original)</label>
            </div>
        `),
        onInit: (win) => {
            const prevImg = win.querySelector("#fw-prev-img");
            const radios = win.querySelectorAll("input[name='lap-variant']");
            const sharpCheck = win.querySelector("#lap-sharpen");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                const res = spacial.laplacianFilter(prev, { variant, sharpen });
                prevImg.src = await imageToDataUrl(res);
            }

            radios.forEach(r => {
                r.addEventListener("change", (e) => {
                    variant = e.target.value;
                    updatePreview();
                });
            });

            sharpCheck.addEventListener("change", (e) => {
                sharpen = e.target.checked;
                updatePreview();
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`Laplaciano (${sharpen ? "Aguçado" : "Bordas"}, ${variant}V)`, "laplacian", { variant, sharpen });
        }
    });
});

// 12. High-Boost
filterButtons.highBoost.addEventListener("click", () => {
    if (!currentImage) return;
    let A = 1.5;
    let size = 3;

    createWindow({
        title: "Aguçamento High-Boost",
        bodyHtml: `
            <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
            <div class="fw-controls" style="margin-top: 8px;">
                <div class="fw-control-header">
                    <label>Fator de Amplificação (A)</label>
                    <input type="number" class="fw-value" id="a-val" min="1.0" max="5.0" step="0.1" value="1.5">
                </div>
                <input type="range" id="a-range" min="1.0" max="4.0" step="0.1" value="1.5">
            </div>
        `,
        onInit: (win) => {
            const prevImg = win.querySelector("#fw-prev-img");
            const aRange = win.querySelector("#a-range");
            const aVal = win.querySelector("#a-val");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                const res = spacial.highBoostFilter(prev, A, size);
                prevImg.src = await imageToDataUrl(res);
            }

            aRange.addEventListener("input", (e) => {
                A = parseFloat(e.target.value);
                aVal.value = A.toFixed(1);
                updatePreview();
            });

            aVal.addEventListener("change", (e) => {
                A = Math.max(1.0, parseFloat(e.target.value) || 1.0);
                aRange.value = A;
                updatePreview();
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`High-Boost (A=${A.toFixed(1)})`, "high-boost", { A, size });
        }
    });
});

// 13. Sobel (X / Y)
filterButtons.sobel.addEventListener("click", () => {
    if (!currentImage) return;
    let axis = "x";

    createWindow({
        title: "Filtro de Sobel",
        extraClass: "fw-wide",
        bodyHtml: splitLayout(`
            <div class="fw-radio-row">
                <label><input type="radio" name="sobel-axis" value="x" checked> Sobel X (Bordas Verticais)</label>
                <label><input type="radio" name="sobel-axis" value="y"> Sobel Y (Bordas Horizontais)</label>
            </div>
        `),
        onInit: (win) => {
            const prevImg = win.querySelector("#fw-prev-img");
            const radios = win.querySelectorAll("input[name='sobel-axis']");

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                const res = axis === "y" ? spacial.sobelY(prev, { normalize: true }) : spacial.sobelX(prev, { normalize: true });
                prevImg.src = await imageToDataUrl(res);
            }

            radios.forEach(r => {
                r.addEventListener("change", (e) => {
                    axis = e.target.value;
                    updatePreview();
                });
            });

            updatePreview();
        },
        onApply: () => {
            addLayer(`Sobel ${axis.toUpperCase()}`, "sobel", { axis });
        }
    });
});

// 14. Magnitude do Gradiente
filterButtons.sobelMag.addEventListener("click", () => {
    if (!currentImage) return;
    createWindow({
        title: "Magnitude do Gradiente (Sobel)",
        bodyHtml: `
            <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
            <p style="color: var(--text-muted); font-size: 11px;">M = √(Gx² + Gy²), com normalização de contraste.</p>
        `,
        onInit: (win) => {
            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                const res = spacial.sobelMagnitude(prev, { normalize: true });
                win.querySelector("#fw-prev-img").src = await imageToDataUrl(res);
            }
            win.refresh = updatePreview;
            updatePreview();
        },
        onApply: () => {
            addLayer("Sobel Magnitude", "sobel-magnitude", {});
        }
    });
});

// 15. Convolução Genérica
filterButtons.convolution.addEventListener("click", () => {
    if (!currentImage) return;
    let kSize = 3;
    let kernel = [
        [0, -1, 0],
        [-1, 5, -1],
        [0, -1, 0]
    ];
    let divisor = 1;
    let offset = 0;
    let normalize = false;

    createWindow({
        title: "Convolução Genérica",
        extraClass: "fw-convolution",
        bodyHtml: `
            <div class="fw-body-split">
                <div class="fw-col-image">
                    <div class="fw-preview"><img id="fw-prev-img" alt="preview"></div>
                </div>
                <div class="fw-col-main">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <label style="font-size: 11px;">Dimensão:</label>
                        <select id="ksize-select" style="background: #222; color: #fff; border: 1px solid var(--border-dark); font-size: 11px; padding: 2px 6px;">
                            <option value="3" selected>3x3</option>
                            <option value="5">5x5</option>
                            <option value="7">7x7</option>
                            <option value="9">9x9</option>
                        </select>
                    </div>
                    <div class="fw-kernel-presets">
                        <button class="fw-kernel-preset-btn" data-preset="identity">Identidade</button>
                        <button class="fw-kernel-preset-btn" data-preset="box">Média</button>
                        <button class="fw-kernel-preset-btn" data-preset="gaussian">Gaussiano</button>
                        <button class="fw-kernel-preset-btn" data-preset="sharpen">Nitidez</button>
                        <button class="fw-kernel-preset-btn" data-preset="emboss">Relevo</button>
                    </div>
                    <div class="fw-kernel-grid" id="kernel-grid"></div>
                    <div class="fw-kernel-footer">
                        <span>Divisor: <input type="number" id="k-divisor" value="1" style="width: 50px;"></span>
                        <span>Offset: <input type="number" id="k-offset" value="0" style="width: 50px;"></span>
                        <label><input type="checkbox" id="k-normalize"> Normalizar</label>
                    </div>
                </div>
            </div>
        `,
        onInit: (win) => {
            const grid = win.querySelector("#kernel-grid");
            const sizeSelect = win.querySelector("#ksize-select");
            const divInput = win.querySelector("#k-divisor");
            const offInput = win.querySelector("#k-offset");
            const normCheck = win.querySelector("#k-normalize");
            const prevImg = win.querySelector("#fw-prev-img");
            const presetBtns = win.querySelectorAll(".fw-kernel-preset-btn");

            function renderGrid() {
                grid.style.gridTemplateColumns = `repeat(${kSize}, 30px)`;
                grid.innerHTML = "";
                for (let r = 0; r < kSize; r++) {
                    for (let c = 0; c < kSize; c++) {
                        const input = document.createElement("input");
                        input.type = "number";
                        input.className = "fw-kernel-cell";
                        input.value = kernel[r] && kernel[r][c] !== undefined ? kernel[r][c] : 0;
                        input.dataset.r = r;
                        input.dataset.c = c;
                        input.addEventListener("change", (e) => {
                            kernel[r][c] = parseFloat(e.target.value) || 0;
                            updatePreview();
                        });
                        grid.appendChild(input);
                    }
                }
            }

            win.refresh = () => updatePreview();

            async function updatePreview() {
                const prev = makePreviewClone(currentImage, 240);
                const res = spacial.convolve2D(prev, kernel, { divisor, offset, normalize });
                prevImg.src = await imageToDataUrl(res);
            }

            sizeSelect.addEventListener("change", (e) => {
                kSize = parseInt(e.target.value, 10);
                const newK = [];
                for (let r = 0; r < kSize; r++) {
                    const row = [];
                    for (let c = 0; c < kSize; c++) {
                        row.push(r === Math.floor(kSize / 2) && c === Math.floor(kSize / 2) ? 1 : 0);
                    }
                    newK.push(row);
                }
                kernel = newK;
                renderGrid();
                updatePreview();
            });

            presetBtns.forEach(btn => {
                btn.addEventListener("click", () => {
                    const p = btn.dataset.preset;
                    if (p === "identity") {
                        kSize = 3;
                        kernel = [[0, 0, 0], [0, 1, 0], [0, 0, 0]];
                        divisor = 1;
                    } else if (p === "box") {
                        kSize = 3;
                        kernel = [[1, 1, 1], [1, 1, 1], [1, 1, 1]];
                        divisor = 9;
                    } else if (p === "gaussian") {
                        kSize = 3;
                        kernel = [[1, 2, 1], [2, 4, 2], [1, 2, 1]];
                        divisor = 16;
                    } else if (p === "sharpen") {
                        kSize = 3;
                        kernel = [[0, -1, 0], [-1, 5, -1], [0, -1, 0]];
                        divisor = 1;
                    } else if (p === "emboss") {
                        kSize = 3;
                        kernel = [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]];
                        divisor = 1;
                        offset = 128;
                        offInput.value = offset;
                    }
                    sizeSelect.value = kSize;
                    divInput.value = divisor;
                    renderGrid();
                    updatePreview();
                });
            });

            divInput.addEventListener("change", (e) => {
                divisor = parseFloat(e.target.value) || 1;
                updatePreview();
            });

            offInput.addEventListener("change", (e) => {
                offset = parseFloat(e.target.value) || 0;
                updatePreview();
            });

            normCheck.addEventListener("change", (e) => {
                normalize = e.target.checked;
                updatePreview();
            });

            renderGrid();
            updatePreview();
        },
        onApply: () => {
            addLayer(`Convolução (${kSize}x${kSize})`, "convolution", { kernel, options: { divisor, offset, normalize } });
        }
    });
});

// 16. Ferramenta de Escala (Menu Ferramentas)
if (toolScale) {
    toolScale.addEventListener("click", () => {
        if (!currentImage) return;
        let scaleX = 1.0;
        let scaleY = 1.0;
        let keepAspect = true;
        let interpolation = "bilinear";

        createWindow({
            title: "Redimensionamento Espacial (Escala)",
            extraClass: "fw-wide",
            bodyHtml: splitLayout(`
                <div class="fw-controls">
                    <div class="fw-field-row">
                        <label>Escala X (%)</label>
                        <input type="number" id="scale-x-num" min="10" max="400" value="100">
                    </div>
                    <div class="fw-field-row" style="margin-top: 4px;">
                        <label>Escala Y (%)</label>
                        <input type="number" id="scale-y-num" min="10" max="400" value="100">
                    </div>
                    <div class="fw-checkbox-row" style="margin-top: 6px;">
                        <input type="checkbox" id="keep-aspect" checked>
                        <label for="keep-aspect">Manter proporção</label>
                    </div>
                    <div class="fw-radio-row" style="margin-top: 6px;">
                        <label><input type="radio" name="scale-interp" value="bilinear" checked> Bilinear</label>
                        <label><input type="radio" name="scale-interp" value="nearest"> Vizinho Mais Próximo</label>
                    </div>
                </div>
            `),
            onInit: (win) => {
                const prevImg = win.querySelector("#fw-prev-img");
                const xNum = win.querySelector("#scale-x-num");
                const yNum = win.querySelector("#scale-y-num");
                const aspectCheck = win.querySelector("#keep-aspect");
                const radios = win.querySelectorAll("input[name='scale-interp']");

                win.refresh = () => updatePreview();

                async function updatePreview() {
                    const prev = makePreviewClone(currentImage, 240);
                    const res = spacial.scaleImage(prev, scaleX, scaleY, interpolation);
                    prevImg.src = await imageToDataUrl(res);
                }

                xNum.addEventListener("input", (e) => {
                    scaleX = (parseFloat(e.target.value) || 100) / 100;
                    if (keepAspect) {
                        scaleY = scaleX;
                        yNum.value = (scaleY * 100).toFixed(0);
                    }
                    updatePreview();
                });

                yNum.addEventListener("input", (e) => {
                    scaleY = (parseFloat(e.target.value) || 100) / 100;
                    if (keepAspect) {
                        scaleX = scaleY;
                        xNum.value = (scaleX * 100).toFixed(0);
                    }
                    updatePreview();
                });

                aspectCheck.addEventListener("change", (e) => {
                    keepAspect = e.target.checked;
                    if (keepAspect) {
                        scaleY = scaleX;
                        yNum.value = (scaleY * 100).toFixed(0);
                        updatePreview();
                    }
                });

                radios.forEach(r => {
                    r.addEventListener("change", (e) => {
                        interpolation = e.target.value;
                        updatePreview();
                    });
                });

                updatePreview();
            },
            onApply: () => {
                addLayer(`Escala (${(scaleX * 100).toFixed(0)}% x ${(scaleY * 100).toFixed(0)}%)`, "scale", { scaleX, scaleY, interpolation });
            }
        });
    });
}

// 17. Ferramenta de Rotação (Menu Ferramentas)
if (toolRotate) {
    toolRotate.addEventListener("click", () => {
        if (!currentImage) return;
        let angle = 45;
        let pivotX = Math.round((currentImage.bitmap.width - 1) / 2);
        let pivotY = Math.round((currentImage.bitmap.height - 1) / 2);
        let interpolation = "bilinear";

        createWindow({
            title: "Rotação com Pivô",
            extraClass: "fw-wide",
            bodyHtml: `
                <div class="fw-body-split">
                <div class="fw-col-image">
                <div class="fw-rotate-preview-wrap" style="height: 240px; flex: none;">
                    <img id="fw-prev-img" alt="preview">
                    <div class="fw-pivot-marker" id="pivot-marker" title="Arraste para alterar o pivô"></div>
                </div>
                </div>
                <div class="fw-col-main">
                <div class="fw-controls">
                    <div class="fw-control-header">
                        <label>Ângulo (°)</label>
                        <input type="number" class="fw-value" id="rot-num" min="-180" max="180" value="45">
                    </div>
                    <input type="range" id="rot-range" min="-180" max="180" value="45">
                    <div class="fw-radio-row" style="margin-top: 6px;">
                        <label><input type="radio" name="rot-interp" value="bilinear" checked> Bilinear</label>
                        <label><input type="radio" name="rot-interp" value="nearest"> Vizinho Mais Próximo</label>
                    </div>
                    <span class="fw-curve-hint" id="pivot-readout"></span>
                </div>
                </div>
                </div>
            `,
            onInit: (win) => {
                const wrap = win.querySelector(".fw-rotate-preview-wrap");
                const prevImg = win.querySelector("#fw-prev-img");
                const rotRange = win.querySelector("#rot-range");
                const rotNum = win.querySelector("#rot-num");
                const marker = win.querySelector("#pivot-marker");
                const readout = win.querySelector("#pivot-readout");
                const radios = win.querySelectorAll("input[name='rot-interp']");
                let layout = null;      // geometria da prévia atual (em pixels da miniatura)
                let pScale = 1;         // miniatura / imagem real
                let previewToken = 0;

                win.refresh = () => updatePreview();

                // Retângulo ocupado pela imagem rotacionada dentro da área de preview
                function shownRect() {
                    const wr = wrap.getBoundingClientRect();
                    const ir = prevImg.getBoundingClientRect();
                    return { left: ir.left - wr.left, top: ir.top - wr.top, width: ir.width, height: ir.height };
                }

                // O pivô é um ponto fixo da rotação: sua posição na imagem rotacionada é (pivô - origem do canvas)
                function placeMarker() {
                    if (!layout) return;
                    const r = shownRect();
                    if (!r.width || !r.height) return;
                    marker.style.left = `${r.left + ((pivotX * pScale - layout.originX) / layout.outW) * r.width}px`;
                    marker.style.top = `${r.top + ((pivotY * pScale - layout.originY) / layout.outH) * r.height}px`;
                    readout.textContent = `Pivô: (${pivotX}, ${pivotY}) px — canvas ${Math.round(layout.outW / pScale)}×${Math.round(layout.outH / pScale)} px`;
                }

                async function updatePreview() {
                    // O pivô é guardado em coordenadas da imagem; mantém dentro dela se o tamanho mudou
                    pivotX = Math.max(0, Math.min(pivotX, currentImage.bitmap.width - 1));
                    pivotY = Math.max(0, Math.min(pivotY, currentImage.bitmap.height - 1));
                    const mine = ++previewToken;
                    const prev = makePreviewClone(currentImage, 240);
                    pScale = prev.bitmap.width / currentImage.bitmap.width;
                    layout = spacial.getRotationLayout(prev.bitmap.width, prev.bitmap.height, angle, pivotX * pScale, pivotY * pScale);
                    const res = spacial.rotateImage(prev, angle, pivotX * pScale, pivotY * pScale, interpolation);
                    const url = await imageToDataUrl(res);
                    if (mine !== previewToken) return;
                    prevImg.onload = placeMarker;
                    prevImg.src = url;
                    placeMarker();
                }

                rotRange.addEventListener("input", (e) => {
                    angle = parseInt(e.target.value, 10);
                    rotNum.value = angle;
                    updatePreview();
                });

                rotNum.addEventListener("change", (e) => {
                    angle = Math.max(-180, Math.min(180, parseInt(e.target.value, 10) || 0));
                    rotRange.value = angle;
                    updatePreview();
                });

                radios.forEach(r => {
                    r.addEventListener("change", (e) => {
                        interpolation = e.target.value;
                        updatePreview();
                    });
                });

                // Arrastar o marcador: o ponto solto na imagem rotacionada vira o novo pivô.
                // Pela geometria, posição_no_canvas = R·pivô − M (M constante), logo pivô = R⁻¹·(posição + M).
                function pivotFromPointer(e) {
                    const r = shownRect();
                    const wr = wrap.getBoundingClientRect();
                    const fx = Math.max(0, Math.min(1, (e.clientX - wr.left - r.left) / r.width));
                    const fy = Math.max(0, Math.min(1, (e.clientY - wr.top - r.top) / r.height));
                    const qx = fx * layout.outW;
                    const qy = fy * layout.outH;

                    const rad = (angle * Math.PI) / 180;
                    const c = Math.cos(rad);
                    const s = Math.sin(rad);
                    const px = pivotX * pScale;
                    const py = pivotY * pScale;
                    const mx = layout.originX - px + (c * px - s * py);
                    const my = layout.originY - py + (s * px + c * py);
                    const vx = qx + mx;
                    const vy = qy + my;

                    pivotX = Math.round((c * vx + s * vy) / pScale);
                    pivotY = Math.round((-s * vx + c * vy) / pScale);
                    updatePreview();
                }

                let draggingPivot = false;
                marker.addEventListener("pointerdown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    draggingPivot = true;
                    marker.setPointerCapture(e.pointerId);
                    marker.classList.add("dragging");
                });
                marker.addEventListener("pointermove", (e) => {
                    if (draggingPivot && layout) pivotFromPointer(e);
                });
                const stopPivot = () => {
                    draggingPivot = false;
                    marker.classList.remove("dragging");
                };
                marker.addEventListener("pointerup", stopPivot);
                marker.addEventListener("pointercancel", stopPivot);

                updatePreview();
            },
            onApply: () => {
                addLayer(`Rotação (${angle}°)`, "rotate", { angle, pivotX, pivotY, interpolation });
            }
        });
    });
}

// 18. Domínio da Frequência (FFT / Espectro / Pincel / IFFT)
if (filterButtons.fourier) {
    filterButtons.fourier.addEventListener("click", async () => {
        if (!currentImage) return;

        let maskArray = null;
        let fftWidth = 0;
        let fftHeight = 0;

        createWindow({
            title: "Filtragem no Domínio da Frequência (FFT 2D)",
            extraClass: "fw-wide",
            bodyHtml: `
                <div class="fw-body-split">
                    <div class="fw-col-image">
                        <div class="panel-title" style="margin: 0;">Imagem Reconstruída (IFFT)</div>
                        <div class="fw-preview" style="height: 240px;"><img id="fw-prev-img" alt="preview"></div>
                    </div>
                    <div class="fw-col-main">
                        <div class="panel-title" style="margin: 0;">Espectro de Fourier (Magnitude)</div>
                        <div style="position: relative; width: 240px; height: 240px; border: 1px solid var(--border-dark); background: #000;">
                            <canvas id="spectrum-canvas" width="240" height="240" style="width: 100%; height: 100%; cursor: crosshair;"></canvas>
                        </div>
                        <div class="fw-controls" style="margin-top: 6px;">
                            <div style="display: flex; gap: 4px;">
                                <button class="fw-kernel-preset-btn" id="lp-preset">Passa-Baixas</button>
                                <button class="fw-kernel-preset-btn" id="hp-preset">Passa-Altas</button>
                                <button class="fw-kernel-preset-btn" id="reset-fft">Restaurar</button>
                            </div>
                            <span style="font-size: 10px; color: var(--text-muted); margin-top: 4px;">Pinte no espectro com o mouse para cortar frequências (áreas cortadas ficam em vermelho escuro).</span>
                        </div>
                    </div>
                </div>
            `,
            onInit: async (win) => {
                const sCanvas = win.querySelector("#spectrum-canvas");
                const sCtx = sCanvas.getContext("2d");
                const prevImg = win.querySelector("#fw-prev-img");

                // Calcula FFT na miniatura para preview interativo
                let fftData;

                // Recalcula a FFT a partir da currentImage; preserva a máscara se o tamanho não mudou
                function loadFft() {
                    fftData = frequency.fft2D(makePreviewClone(currentImage, 128));
                    if (!maskArray || fftData.width !== fftWidth || fftData.height !== fftHeight) {
                        fftWidth = fftData.width;
                        fftHeight = fftData.height;
                        maskArray = new Float64Array(fftWidth * fftHeight).fill(1.0);
                    }
                }
                loadFft();

                async function renderSpectrumAndPreview() {
                    // Espectro já multiplicado pela máscara; regiões cortadas recebem um tom avermelhado
                    // para ficarem visíveis mesmo sobre frequências que já eram escuras
                    const specImg = frequency.getFourierSpectrum(fftData, maskArray);
                    const specPixels = new Uint8ClampedArray(specImg.bitmap.data);
                    for (let i = 0; i < maskArray.length; i++) {
                        const cut = 1 - maskArray[i];
                        if (cut > 0) specPixels[i * 4] = Math.min(255, specPixels[i * 4] + cut * 110);
                    }
                    const sData = new ImageData(specPixels, specImg.bitmap.width, specImg.bitmap.height);

                    // Cria canvas temporário
                    const tCanvas = document.createElement("canvas");
                    tCanvas.width = specImg.bitmap.width;
                    tCanvas.height = specImg.bitmap.height;
                    tCanvas.getContext("2d").putImageData(sData, 0, 0);

                    // Desenha no canvas da janela com filtro visual de máscara
                    sCtx.drawImage(tCanvas, 0, 0, 240, 240);

                    // Executa IFFT da prévia
                    const clonedFft = {
                        real: new Float64Array(fftData.real),
                        imag: new Float64Array(fftData.imag),
                        width: fftData.width,
                        height: fftData.height,
                        origWidth: fftData.origWidth,
                        origHeight: fftData.origHeight
                    };
                    frequency.applyFourierMask(clonedFft, maskArray);
                    const reconstructed = frequency.ifft2D(clonedFft);
                    prevImg.src = await imageToDataUrl(reconstructed);
                }

                // Desenho com mouse no espectro (pincel passa-baixas / corte de frequência)
                let isPainting = false;
                function paintAt(e) {
                    const rect = sCanvas.getBoundingClientRect();
                    const x = Math.floor(((e.clientX - rect.left) / rect.width) * fftData.width);
                    const y = Math.floor(((e.clientY - rect.top) / rect.height) * fftData.height);
                    const radius = 6;

                    for (let dy = -radius; dy <= radius; dy++) {
                        for (let dx = -radius; dx <= radius; dx++) {
                            const px = x + dx;
                            const py = y + dy;
                            if (px >= 0 && px < fftData.width && py >= 0 && py < fftData.height) {
                                if (dx * dx + dy * dy <= radius * radius) {
                                    maskArray[py * fftData.width + px] = 0; // zera componente de frequência
                                }
                            }
                        }
                    }
                    renderSpectrumAndPreview();
                }

                sCanvas.addEventListener("mousedown", (e) => {
                    isPainting = true;
                    paintAt(e);
                });

                window.addEventListener("mousemove", (e) => {
                    if (isPainting) paintAt(e);
                });

                window.addEventListener("mouseup", () => {
                    isPainting = false;
                });

                // Presets
                win.querySelector("#lp-preset").addEventListener("click", () => {
                    const cx = fftData.width / 2;
                    const cy = fftData.height / 2;
                    const cutoff = 25;
                    for (let y = 0; y < fftData.height; y++) {
                        for (let x = 0; x < fftData.width; x++) {
                            const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                            maskArray[y * fftData.width + x] = d <= cutoff ? 1.0 : 0.0;
                        }
                    }
                    renderSpectrumAndPreview();
                });

                win.querySelector("#hp-preset").addEventListener("click", () => {
                    const cx = fftData.width / 2;
                    const cy = fftData.height / 2;
                    const cutoff = 15;
                    for (let y = 0; y < fftData.height; y++) {
                        for (let x = 0; x < fftData.width; x++) {
                            const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
                            maskArray[y * fftData.width + x] = d >= cutoff ? 1.0 : 0.0;
                        }
                    }
                    renderSpectrumAndPreview();
                });

                win.querySelector("#reset-fft").addEventListener("click", () => {
                    maskArray.fill(1.0);
                    renderSpectrumAndPreview();
                });

                win.refresh = () => {
                    loadFft();
                    return renderSpectrumAndPreview();
                };

                await renderSpectrumAndPreview();
            },
            onApply: () => {
                if (!maskArray) return;
                const savedMask = new Float64Array(maskArray);
                const mW = fftWidth;
                const mH = fftHeight;

                // Função de máscara normalizada para resolução arbitrária do pipeline
                const maskFn = (u, v, M, N) => {
                    const normU = u / M;
                    const normV = v / N;
                    const px = Math.min(mW - 1, Math.max(0, Math.floor(normU * mW)));
                    const py = Math.min(mH - 1, Math.max(0, Math.floor(normV * mH)));
                    return savedMask[py * mW + px];
                };

                addLayer("Filtragem de Fourier (FFT)", "fourier", { mask: maskFn });
            }
        });
    });
}

// 19. Processamento de Cores (Sépia, HSI, Balanço de Canais, Chroma-Key)
if (filterButtons.colorProcessing) {
    filterButtons.colorProcessing.addEventListener("click", () => {
        if (!currentImage) return;
        let selectedTab = "sepia";
        let deltaH = 0, deltaS = 0, deltaI = 0;
        let deltaR = 0, deltaG = 0, deltaB = 0;
        let grayMethod = "luminance";

        createWindow({
            title: "Processamento de Cores",
            extraClass: "fw-wide",
            bodyHtml: splitLayout(`
                <div class="fw-channel-tabs">
                    <button class="fw-channel-tab active" data-tab="sepia">Sépia</button>
                    <button class="fw-channel-tab" data-tab="grayscale">Cinza</button>
                    <button class="fw-channel-tab" data-tab="hsi">HSI</button>
                    <button class="fw-channel-tab" data-tab="channels">C/M/Y</button>
                </div>
                <div id="color-tab-content"></div>
            `),
            onInit: (win) => {
                const tabs = win.querySelectorAll(".fw-channel-tab");
                const content = win.querySelector("#color-tab-content");
                const prevImg = win.querySelector("#fw-prev-img");

                function renderTabControls() {
                    if (selectedTab === "sepia") {
                        content.innerHTML = `<p style="font-size: 11px; color: var(--text-muted);">Aplica matriz de pigmentação clássica estilo fotografia envelhecida.</p>`;
                    } else if (selectedTab === "grayscale") {
                        content.innerHTML = `
                            <div class="fw-radio-row">
                                <label><input type="radio" name="gray-m" value="luminance" checked> Média Ponderada (Luminância ITU-R BT.601)</label>
                                <label><input type="radio" name="gray-m" value="average"> Média Simples (R+G+B)/3</label>
                            </div>
                        `;
                    } else if (selectedTab === "hsi") {
                        content.innerHTML = `
                            <div class="fw-controls">
                                <div class="fw-control-header"><label>Matiz (Hue °)</label><span id="h-val">0°</span></div>
                                <input type="range" id="h-range" min="-180" max="180" value="0">
                                <div class="fw-control-header"><label>Saturação</label><span id="s-val">0%</span></div>
                                <input type="range" id="s-range" min="-100" max="100" value="0">
                                <div class="fw-control-header"><label>Brilho (Intensidade)</label><span id="i-val">0%</span></div>
                                <input type="range" id="i-range" min="-100" max="100" value="0">
                            </div>
                        `;
                    } else if (selectedTab === "channels") {
                        content.innerHTML = `
                            <div class="fw-controls">
                                <div class="fw-control-header"><label>Ciano / Vermelho (R)</label><span id="r-val">0</span></div>
                                <input type="range" id="r-range" min="-100" max="100" value="0">
                                <div class="fw-control-header"><label>Magenta / Verde (G)</label><span id="g-val">0</span></div>
                                <input type="range" id="g-range" min="-100" max="100" value="0">
                                <div class="fw-control-header"><label>Amarelo / Azul (B)</label><span id="b-val">0</span></div>
                                <input type="range" id="b-range" min="-100" max="100" value="0">
                            </div>
                        `;
                    }
                    wireTabEvents();
                    updatePreview();
                }

                function wireGrayEvents() {
                    content.querySelectorAll("input[name='gray-m']").forEach(r => {
                        r.checked = r.value === grayMethod;
                        r.addEventListener("change", (e) => {
                            grayMethod = e.target.value;
                            updatePreview();
                        });
                    });
                }

                function wireTabEvents() {
                    if (selectedTab === "grayscale") {
                        wireGrayEvents();
                    } else if (selectedTab === "hsi") {
                        content.querySelector("#h-range").addEventListener("input", (e) => {
                            deltaH = parseInt(e.target.value, 10);
                            content.querySelector("#h-val").textContent = `${deltaH}°`;
                            updatePreview();
                        });
                        content.querySelector("#s-range").addEventListener("input", (e) => {
                            deltaS = parseInt(e.target.value, 10) / 100;
                            content.querySelector("#s-val").textContent = `${e.target.value}%`;
                            updatePreview();
                        });
                        content.querySelector("#i-range").addEventListener("input", (e) => {
                            deltaI = parseInt(e.target.value, 10) / 100;
                            content.querySelector("#i-val").textContent = `${e.target.value}%`;
                            updatePreview();
                        });
                    } else if (selectedTab === "channels") {
                        content.querySelector("#r-range").addEventListener("input", (e) => {
                            deltaR = parseInt(e.target.value, 10);
                            content.querySelector("#r-val").textContent = deltaR;
                            updatePreview();
                        });
                        content.querySelector("#g-range").addEventListener("input", (e) => {
                            deltaG = parseInt(e.target.value, 10);
                            content.querySelector("#g-val").textContent = deltaG;
                            updatePreview();
                        });
                        content.querySelector("#b-range").addEventListener("input", (e) => {
                            deltaB = parseInt(e.target.value, 10);
                            content.querySelector("#b-val").textContent = deltaB;
                            updatePreview();
                        });
                    }
                }

                win.refresh = () => updatePreview();

                async function updatePreview() {
                    const prev = makePreviewClone(currentImage, 240);
                    let res;
                    if (selectedTab === "sepia") {
                        res = spacial.sepia(prev);
                    } else if (selectedTab === "grayscale") {
                        res = spacial.convertToGrayscale(prev, grayMethod);
                    } else if (selectedTab === "hsi") {
                        res = spacial.adjustHSI(prev, deltaH, deltaS, deltaI);
                    } else if (selectedTab === "channels") {
                        res = spacial.adjustColorChannels(prev, deltaR, deltaG, deltaB);
                    }
                    prevImg.src = await imageToDataUrl(res);
                }

                tabs.forEach(tab => {
                    tab.addEventListener("click", () => {
                        tabs.forEach(t => t.classList.remove("active"));
                        tab.classList.add("active");
                        selectedTab = tab.dataset.tab;
                        renderTabControls();
                    });
                });

                renderTabControls();
            },
            onApply: () => {
                if (selectedTab === "sepia") {
                    addLayer("Efeito Sépia", "sepia", {});
                } else if (selectedTab === "grayscale") {
                    addLayer("Escala de Cinza", "grayscale", { method: grayMethod });
                } else if (selectedTab === "hsi") {
                    addLayer("Ajuste HSI", "adjust-hsi", { deltaH, deltaS, deltaI });
                } else if (selectedTab === "channels") {
                    addLayer("Balanço de Canais", "adjust-channels", { deltaR, deltaG, deltaB });
                }
            }
        });
    });
}
