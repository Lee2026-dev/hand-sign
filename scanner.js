/**
 * Hand Sign — Document Scanner Module
 * Converts phone photos of ID cards into professional scan-quality images.
 *
 * Features:
 * - Four-point perspective correction (triangle mesh)
 * - Document background whitening for scan-quality output
 * - Auto contrast / sharpening / brightness / mode conversion
 * - Multi-format export: PNG, JPEG, PDF
 */

/* ============================================================
   Scanner Module
   ============================================================ */
(function () {
    'use strict';

    // ─── DOM ────────────────────────────────────────────────────
    const uploadZone = document.getElementById('scanUploadZone');
    const fileInput = document.getElementById('scanFileInput');
    const cropSection = document.getElementById('scanCropSection');
    const resultSection = document.getElementById('scanResultSection');

    const cropContainer = document.getElementById('scanCropContainer');
    const cropCanvas = document.getElementById('scanCropCanvas');
    const cropCtx = cropCanvas.getContext('2d');
    const overlayCanvas = document.getElementById('scanOverlayCanvas');
    const overlayCtx = overlayCanvas.getContext('2d');

    const resultCanvas = document.getElementById('scanResultCanvas');
    const resultCtx = resultCanvas.getContext('2d');

    // Controls (now in result section)
    const modeButtons = document.querySelectorAll('#scanResultSection .scan-mode-btn');
    const brightnessInput = document.getElementById('scanBrightness');
    const brightnessValue = document.getElementById('scanBrightnessValue');
    const contrastInput = document.getElementById('scanContrast');
    const contrastValue = document.getElementById('scanContrastValue');
    const sharpnessInput = document.getElementById('scanSharpness');
    const sharpnessValue = document.getElementById('scanSharpnessValue');

    // Buttons
    const btnProcess = document.getElementById('btnScanProcess');
    const btnReset = document.getElementById('btnScanReset');
    const btnExport = document.getElementById('btnScanExport');
    const btnExportToggle = document.getElementById('btnScanExportToggle');
    const btnCopy = document.getElementById('btnScanCopy');
    const btnExportPdf = document.getElementById('btnScanExportPdf');
    const btnReset2 = document.getElementById('btnScanReset2');
    const btnBack = document.getElementById('btnScanBack');

    // ─── STATE ──────────────────────────────────────────────────
    let sourceImg = null;  // original Image element
    let displayW = 0;     // display dimensions
    let displayH = 0;
    let naturalW = 0;     // original image dimensions
    let naturalH = 0;

    // Four corner points in display coordinates [topLeft, topRight, bottomRight, bottomLeft]
    let corners = [];
    let draggingIdx = -1;

    let currentMode = 'color'; // 'color' | 'gray' | 'bw'
    let processed = false;

    // Store raw perspective-corrected pixels so we can re-apply
    // enhancements without redoing perspective correction
    let correctedImageData = null;

    // ─── CONSTANTS ──────────────────────────────────────────────
    const HANDLE_RADIUS = 12;
    const HANDLE_HIT = 20;
    const ID_CARD_RATIO = 85.6 / 54;   // ISO standard ID card ratio
    const OUTPUT_WIDTH = 1280;         // pixels for output

    // ─── IMAGE LOADING ──────────────────────────────────────────

    function loadImage(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                sourceImg = img;
                naturalW = img.naturalWidth;
                naturalH = img.naturalHeight;

                // Fit to container (max 680×450)
                const maxW = 680, maxH = 450;
                let w = naturalW, h = naturalH;
                if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }

                displayW = w;
                displayH = h;

                // Setup crop canvas
                cropCanvas.width = w;
                cropCanvas.height = h;
                cropCanvas.style.width = w + 'px';
                cropCanvas.style.height = h + 'px';

                overlayCanvas.width = w;
                overlayCanvas.height = h;
                overlayCanvas.style.width = w + 'px';
                overlayCanvas.style.height = h + 'px';

                cropContainer.style.width = w + 'px';
                cropContainer.style.height = h + 'px';

                // Draw source image
                cropCtx.clearRect(0, 0, w, h);
                cropCtx.drawImage(img, 0, 0, w, h);

                // Initialize corners with some inset (10%)
                const inset = 0.1;
                corners = [
                    { x: w * inset, y: h * inset },        // top-left
                    { x: w * (1 - inset), y: h * inset },        // top-right
                    { x: w * (1 - inset), y: h * (1 - inset) },  // bottom-right
                    { x: w * inset, y: h * (1 - inset) },  // bottom-left
                ];

                drawOverlay();

                // Show crop, hide upload + result
                uploadZone.style.display = 'none';
                cropSection.style.display = 'flex';
                resultSection.style.display = 'none';
                processed = false;
                correctedImageData = null;
                updateUI();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // ─── OVERLAY DRAWING ───────────────────────────────────────

    function drawOverlay() {
        const ctx = overlayCtx;
        const w = overlayCanvas.width;
        const h = overlayCanvas.height;
        ctx.clearRect(0, 0, w, h);

        // Semi-transparent overlay outside the quad
        ctx.save();
        ctx.fillStyle = 'rgba(15, 17, 23, 0.55)';
        ctx.fillRect(0, 0, w, h);

        // Cut out the quad area
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Draw the quad border
        ctx.strokeStyle = 'rgba(212, 165, 116, 0.9)';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < corners.length; i++) {
            ctx.lineTo(corners[i].x, corners[i].y);
        }
        ctx.closePath();
        ctx.stroke();

        // Draw grid lines inside the quad (3×3)
        ctx.strokeStyle = 'rgba(212, 165, 116, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        for (let i = 1; i <= 2; i++) {
            const t = i / 3;
            // Horizontal
            const hlx = lerp(corners[0].x, corners[3].x, t);
            const hly = lerp(corners[0].y, corners[3].y, t);
            const hrx = lerp(corners[1].x, corners[2].x, t);
            const hry = lerp(corners[1].y, corners[2].y, t);
            ctx.beginPath();
            ctx.moveTo(hlx, hly);
            ctx.lineTo(hrx, hry);
            ctx.stroke();

            // Vertical
            const vtx = lerp(corners[0].x, corners[1].x, t);
            const vty = lerp(corners[0].y, corners[1].y, t);
            const vbx = lerp(corners[3].x, corners[2].x, t);
            const vby = lerp(corners[3].y, corners[2].y, t);
            ctx.beginPath();
            ctx.moveTo(vtx, vty);
            ctx.lineTo(vbx, vby);
            ctx.stroke();
        }
        ctx.setLineDash([]);

        // Draw handles
        for (let i = 0; i < corners.length; i++) {
            const c = corners[i];

            // Outer glow
            ctx.beginPath();
            ctx.arc(c.x, c.y, HANDLE_RADIUS + 4, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(212, 165, 116, 0.15)';
            ctx.fill();

            // Handle circle
            ctx.beginPath();
            ctx.arc(c.x, c.y, HANDLE_RADIUS, 0, Math.PI * 2);
            ctx.fillStyle = draggingIdx === i ? '#E8C9A8' : '#D4A574';
            ctx.fill();
            ctx.strokeStyle = '#0F1117';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Inner dot
            ctx.beginPath();
            ctx.arc(c.x, c.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#0F1117';
            ctx.fill();
        }
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    // ─── HANDLE DRAGGING ──────────────────────────────────────

    function getEventPos(e) {
        const rect = overlayCanvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: clientX - rect.left,
            y: clientY - rect.top,
        };
    }

    function findHandle(pos) {
        for (let i = 0; i < corners.length; i++) {
            const dx = pos.x - corners[i].x;
            const dy = pos.y - corners[i].y;
            if (dx * dx + dy * dy <= HANDLE_HIT * HANDLE_HIT) return i;
        }
        return -1;
    }

    function onPointerDown(e) {
        e.preventDefault();
        const pos = getEventPos(e);
        draggingIdx = findHandle(pos);
        if (draggingIdx >= 0) {
            overlayCanvas.style.cursor = 'grabbing';
        }
    }

    function onPointerMove(e) {
        if (draggingIdx < 0) {
            // Hover cursor
            const pos = getEventPos(e);
            overlayCanvas.style.cursor = findHandle(pos) >= 0 ? 'grab' : 'default';
            return;
        }
        e.preventDefault();
        const pos = getEventPos(e);
        corners[draggingIdx].x = Math.max(0, Math.min(displayW, pos.x));
        corners[draggingIdx].y = Math.max(0, Math.min(displayH, pos.y));
        drawOverlay();
    }

    function onPointerUp() {
        draggingIdx = -1;
        overlayCanvas.style.cursor = 'default';
        drawOverlay();
    }

    // ─── PERSPECTIVE CORRECTION ──────────────────────────────

    /**
     * Perform perspective correction using a triangle mesh approach.
     * Maps the quadrilateral defined by `corners` to a rectangle.
     * Stores the raw corrected pixels for later enhancement passes.
     */
    function perspectiveCorrect() {
        const outW = OUTPUT_WIDTH;
        const outH = Math.round(OUTPUT_WIDTH / ID_CARD_RATIO);

        resultCanvas.width = outW;
        resultCanvas.height = outH;

        // Scale corners from display coords to natural image coords
        const scaleX = naturalW / displayW;
        const scaleY = naturalH / displayH;
        const src = corners.map(c => ({ x: c.x * scaleX, y: c.y * scaleY }));

        // Use direct pixel sampling for high quality
        const tmpCanvas = document.createElement('canvas');
        tmpCanvas.width = naturalW;
        tmpCanvas.height = naturalH;
        const tmpCtx = tmpCanvas.getContext('2d');
        tmpCtx.drawImage(sourceImg, 0, 0, naturalW, naturalH);
        const srcData = tmpCtx.getImageData(0, 0, naturalW, naturalH);

        const dstData = resultCtx.createImageData(outW, outH);

        // Bilinear interpolation from source quad to output rect
        for (let oy = 0; oy < outH; oy++) {
            const v = oy / (outH - 1);
            for (let ox = 0; ox < outW; ox++) {
                const u = ox / (outW - 1);

                // Bilinear mapping: quad -> point
                const topX = src[0].x + (src[1].x - src[0].x) * u;
                const topY = src[0].y + (src[1].y - src[0].y) * u;
                const botX = src[3].x + (src[2].x - src[3].x) * u;
                const botY = src[3].y + (src[2].y - src[3].y) * u;

                const sx = topX + (botX - topX) * v;
                const sy = topY + (botY - topY) * v;

                // Bilinear sample from source
                const px = Math.floor(sx);
                const py = Math.floor(sy);
                const fx = sx - px;
                const fy = sy - py;

                if (px < 0 || px >= naturalW - 1 || py < 0 || py >= naturalH - 1) {
                    // Fill out-of-bounds with white
                    const outIdx = (oy * outW + ox) * 4;
                    dstData.data[outIdx] = 255;
                    dstData.data[outIdx + 1] = 255;
                    dstData.data[outIdx + 2] = 255;
                    dstData.data[outIdx + 3] = 255;
                    continue;
                }

                const idx00 = (py * naturalW + px) * 4;
                const idx10 = (py * naturalW + px + 1) * 4;
                const idx01 = ((py + 1) * naturalW + px) * 4;
                const idx11 = ((py + 1) * naturalW + px + 1) * 4;

                const outIdx = (oy * outW + ox) * 4;
                for (let c = 0; c < 4; c++) {
                    const top = srcData.data[idx00 + c] * (1 - fx) + srcData.data[idx10 + c] * fx;
                    const bot = srcData.data[idx01 + c] * (1 - fx) + srcData.data[idx11 + c] * fx;
                    dstData.data[outIdx + c] = Math.round(top * (1 - fy) + bot * fy);
                }
            }
        }

        resultCtx.putImageData(dstData, 0, 0);

        // Save a copy of the raw corrected pixels
        correctedImageData = resultCtx.getImageData(0, 0, outW, outH);
    }

    // ─── IMAGE ENHANCEMENT ──────────────────────────────────

    /**
     * Apply all enhancement steps to the result canvas.
     * Starts from the saved correctedImageData (raw perspective-corrected pixels)
     * so adjustments are always relative to the original corrected image.
     */
    function applyEnhancement() {
        const w = resultCanvas.width;
        const h = resultCanvas.height;

        // Always start from the raw corrected data
        const imageData = new ImageData(
            new Uint8ClampedArray(correctedImageData.data),
            w, h
        );
        const data = imageData.data;

        const brightness = parseInt(brightnessInput.value, 10);
        const contrast = parseInt(contrastInput.value, 10);
        const sharpness = parseInt(sharpnessInput.value, 10);

        // 1. Document background whitening
        documentWhiten(data, w, h);

        // 2. Auto-contrast (histogram stretch)
        autoContrast(data);

        // 3. Brightness & Contrast adjustment
        applyBrightnessContrast(data, brightness, contrast);

        // 4. Mode conversion
        if (currentMode === 'gray') {
            toGrayscale(data);
        } else if (currentMode === 'bw') {
            toBlackWhite(data);
        }

        resultCtx.putImageData(imageData, 0, 0);

        // 5. Sharpening (uses convolution, needs separate pass)
        if (sharpness > 0) {
            applySharpen(w, h, sharpness / 100);
        }
    }

    // ─── DOCUMENT BACKGROUND WHITENING ─────────────────────

    /**
     * Estimates the document background color and pushes it toward
     * pure white, cleaning up shadows, uneven lighting, and surface
     * color from the desk / hand.
     *
     * Algorithm:
     * 1. Divide image into a grid of blocks
     * 2. For each block, find the brightest pixels (likely background)
     * 3. Build a per-pixel background estimate via bilinear interpolation
     *    of block backgrounds (handles uneven lighting)
     * 4. Divide each pixel by its local background estimate and scale
     *    to [0, 255], pushing background to white while preserving
     *    text / content detail
     */
    function documentWhiten(data, w, h) {
        const BLOCK = 32; // block size for background estimation
        const bCols = Math.ceil(w / BLOCK);
        const bRows = Math.ceil(h / BLOCK);

        // Step 1: For each block, estimate background as the 90th-percentile brightness
        const bgR = new Float32Array(bCols * bRows);
        const bgG = new Float32Array(bCols * bRows);
        const bgB = new Float32Array(bCols * bRows);

        for (let by = 0; by < bRows; by++) {
            for (let bx = 0; bx < bCols; bx++) {
                const x0 = bx * BLOCK;
                const y0 = by * BLOCK;
                const x1 = Math.min(x0 + BLOCK, w);
                const y1 = Math.min(y0 + BLOCK, h);

                // Collect luminance values in this block
                const pixels = [];
                for (let y = y0; y < y1; y++) {
                    for (let x = x0; x < x1; x++) {
                        const idx = (y * w + x) * 4;
                        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                        pixels.push({ lum, r: data[idx], g: data[idx + 1], b: data[idx + 2] });
                    }
                }

                // Sort by luminance, take the 85th-percentile as background estimate
                pixels.sort((a, b) => a.lum - b.lum);
                const p = Math.min(pixels.length - 1, Math.floor(pixels.length * 0.85));
                const count = Math.max(1, pixels.length - p);
                let sr = 0, sg = 0, sb = 0;
                for (let i = p; i < pixels.length; i++) {
                    sr += pixels[i].r;
                    sg += pixels[i].g;
                    sb += pixels[i].b;
                }
                const bi = by * bCols + bx;
                bgR[bi] = Math.max(1, sr / count);
                bgG[bi] = Math.max(1, sg / count);
                bgB[bi] = Math.max(1, sb / count);
            }
        }

        // Step 2: For each pixel, bilinearly interpolate the local background
        // and normalize: pixel = pixel / localBg * 255
        for (let y = 0; y < h; y++) {
            // Block row fractional position
            const byf = (y / BLOCK) - 0.5;
            const by0 = Math.max(0, Math.floor(byf));
            const by1 = Math.min(bRows - 1, by0 + 1);
            const fy = Math.max(0, Math.min(1, byf - by0));

            for (let x = 0; x < w; x++) {
                const bxf = (x / BLOCK) - 0.5;
                const bx0 = Math.max(0, Math.floor(bxf));
                const bx1 = Math.min(bCols - 1, bx0 + 1);
                const fx = Math.max(0, Math.min(1, bxf - bx0));

                // Bilinear interpolation of background
                const i00 = by0 * bCols + bx0;
                const i10 = by0 * bCols + bx1;
                const i01 = by1 * bCols + bx0;
                const i11 = by1 * bCols + bx1;

                const localR = (bgR[i00] * (1 - fx) + bgR[i10] * fx) * (1 - fy) +
                    (bgR[i01] * (1 - fx) + bgR[i11] * fx) * fy;
                const localG = (bgG[i00] * (1 - fx) + bgG[i10] * fx) * (1 - fy) +
                    (bgG[i01] * (1 - fx) + bgG[i11] * fx) * fy;
                const localB = (bgB[i00] * (1 - fx) + bgB[i10] * fx) * (1 - fy) +
                    (bgB[i01] * (1 - fx) + bgB[i11] * fx) * fy;

                const idx = (y * w + x) * 4;

                // Normalize: push background to 255, darken content proportionally
                data[idx] = clamp(data[idx] / localR * 255);
                data[idx + 1] = clamp(data[idx + 1] / localG * 255);
                data[idx + 2] = clamp(data[idx + 2] / localB * 255);
            }
        }
    }

    function autoContrast(data) {
        // Find the 1st and 99th percentile luminance for robust stretching
        const histogram = new Uint32Array(256);
        const total = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
            const l = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[l]++;
        }

        // Find 1st and 99th percentile
        const loTarget = Math.floor(total * 0.01);
        const hiTarget = Math.floor(total * 0.99);
        let cumulative = 0;
        let minL = 0, maxL = 255;
        for (let i = 0; i < 256; i++) {
            cumulative += histogram[i];
            if (cumulative >= loTarget && minL === 0) minL = i;
            if (cumulative >= hiTarget) { maxL = i; break; }
        }

        if (maxL - minL < 10) return; // already good

        const range = maxL - minL;
        for (let i = 0; i < data.length; i += 4) {
            data[i] = clamp((data[i] - minL) / range * 255);
            data[i + 1] = clamp((data[i + 1] - minL) / range * 255);
            data[i + 2] = clamp((data[i + 2] - minL) / range * 255);
        }
    }

    function applyBrightnessContrast(data, brightness, contrast) {
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        for (let i = 0; i < data.length; i += 4) {
            data[i] = clamp(factor * (data[i] - 128) + 128 + brightness);
            data[i + 1] = clamp(factor * (data[i + 1] - 128) + 128 + brightness);
            data[i + 2] = clamp(factor * (data[i + 2] - 128) + 128 + brightness);
        }
    }

    function toGrayscale(data) {
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }

    function toBlackWhite(data) {
        // Otsu's threshold
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[gray]++;
        }

        const total = data.length / 4;
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];

        let sumB = 0, wB = 0, maxVar = 0, threshold = 128;

        for (let t = 0; t < 256; t++) {
            wB += histogram[t];
            if (wB === 0) continue;
            const wF = total - wB;
            if (wF === 0) break;

            sumB += t * histogram[t];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;

            const variance = wB * wF * (mB - mF) * (mB - mF);
            if (variance > maxVar) {
                maxVar = variance;
                threshold = t;
            }
        }

        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            const val = gray > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = val;
        }
    }

    function applySharpen(w, h, amount) {
        const imageData = resultCtx.getImageData(0, 0, w, h);
        const src = imageData.data;
        const copy = new Uint8ClampedArray(src);

        const k = amount;

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = (y * w + x) * 4;
                for (let c = 0; c < 3; c++) {
                    const center = copy[idx + c];
                    const neighbors =
                        copy[((y - 1) * w + x) * 4 + c] +
                        copy[((y + 1) * w + x) * 4 + c] +
                        copy[(y * w + (x - 1)) * 4 + c] +
                        copy[(y * w + (x + 1)) * 4 + c];

                    const laplacian = center * 4 - neighbors;
                    src[idx + c] = clamp(center + laplacian * k);
                }
            }
        }

        resultCtx.putImageData(imageData, 0, 0);
    }

    function clamp(v) {
        return Math.min(255, Math.max(0, Math.round(v)));
    }

    // ─── PROCESS ────────────────────────────────────────────────

    function processImage() {
        if (!sourceImg) return;

        // Step 1: Perspective correction (saves raw pixels)
        perspectiveCorrect();

        // Step 2: Enhancement
        applyEnhancement();

        // Show result
        cropSection.style.display = 'none';
        resultSection.style.display = 'flex';
        processed = true;
        updateUI();
    }

    /**
     * Re-apply enhancements only (no perspective redo).
     * Called when user adjusts mode / brightness / contrast / sharpness.
     */
    function reprocess() {
        if (!correctedImageData) return;
        applyEnhancement();
    }

    // ─── EXPORT ─────────────────────────────────────────────────

    function exportResult() {
        if (!processed) return;
        ExportUtils.downloadCanvas(resultCanvas, ExportUtils.getSavedFormat(), 'scan');
    }

    async function copyResult() {
        if (!processed) return;
        const ok = await ExportUtils.copyToClipboard(resultCanvas);
        if (ok) ExportUtils.flashCopied(btnCopy);
    }

    function exportPdf() {
        if (!processed) return;
        if (typeof window.jspdf === 'undefined') {
            alert('PDF 库正在加载，请稍后重试');
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({
            orientation: resultCanvas.width > resultCanvas.height ? 'l' : 'p',
            unit: 'mm',
            format: 'a4',
        });

        const pageW = pdf.internal.pageSize.getWidth();
        const pageH = pdf.internal.pageSize.getHeight();

        // Fit image onto A4 with margins
        const margin = 10;
        const availW = pageW - margin * 2;
        const availH = pageH - margin * 2;
        const ratio = resultCanvas.width / resultCanvas.height;

        let imgW, imgH;
        if (ratio > availW / availH) {
            imgW = availW;
            imgH = availW / ratio;
        } else {
            imgH = availH;
            imgW = availH * ratio;
        }

        const x = (pageW - imgW) / 2;
        const y = (pageH - imgH) / 2;

        const dataUrl = resultCanvas.toDataURL('image/jpeg', 0.95);
        pdf.addImage(dataUrl, 'JPEG', x, y, imgW, imgH);

        const dateStr = ExportUtils.getDateStr ? ExportUtils.getDateStr() : new Date().toISOString().slice(0, 10).replace(/-/g, '');
        pdf.save(`scan_${dateStr}.pdf`);
    }

    // ─── BACK TO CROP ──────────────────────────────────────────

    function backToCrop() {
        cropSection.style.display = 'flex';
        resultSection.style.display = 'none';
        processed = false;
        updateUI();
    }

    // ─── RESET ──────────────────────────────────────────────────

    function reset() {
        sourceImg = null;
        processed = false;
        correctedImageData = null;
        fileInput.value = '';
        corners = [];

        // Reset controls to defaults
        currentMode = 'color';
        brightnessInput.value = 10;
        contrastInput.value = 20;
        sharpnessInput.value = 40;
        modeButtons.forEach(b => b.classList.remove('scan-mode-btn--active'));
        if (modeButtons.length > 0) modeButtons[0].classList.add('scan-mode-btn--active');

        uploadZone.style.display = '';
        cropSection.style.display = 'none';
        resultSection.style.display = 'none';
        updateSliderDisplays();
        updateUI();
    }

    // ─── UI ─────────────────────────────────────────────────────

    function updateUI() {
        btnExport.disabled = !processed;
        btnExportToggle.disabled = !processed;
        btnCopy.disabled = !processed;
        btnExportPdf.disabled = !processed;
    }

    function updateSliderDisplays() {
        brightnessValue.textContent = brightnessInput.value;
        contrastValue.textContent = contrastInput.value;
        sharpnessValue.textContent = sharpnessInput.value + '%';
    }

    // ─── DEBOUNCE UTILITY ──────────────────────────────────────

    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) cancelAnimationFrame(timer);
            timer = requestAnimationFrame(() => {
                fn(...args);
                timer = null;
            });
        };
    }

    const debouncedReprocess = debounce(() => {
        if (processed) reprocess();
    }, 0);

    // ─── EVENT LISTENERS ────────────────────────────────────────

    // File upload
    fileInput.addEventListener('change', (e) => loadImage(e.target.files[0]));

    // Drag & drop
    uploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadZone.classList.add('drag-over');
    });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.classList.remove('drag-over');
        loadImage(e.dataTransfer.files[0]);
    });

    // Corner dragging — pointer events
    overlayCanvas.addEventListener('pointerdown', onPointerDown);
    overlayCanvas.addEventListener('pointermove', onPointerMove);
    overlayCanvas.addEventListener('pointerup', onPointerUp);
    overlayCanvas.addEventListener('pointerleave', onPointerUp);
    overlayCanvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch events for mobile (prevent page scroll while dragging)
    overlayCanvas.addEventListener('touchstart', (e) => {
        const pos = getEventPos(e);
        if (findHandle(pos) >= 0) e.preventDefault();
    }, { passive: false });
    overlayCanvas.addEventListener('touchmove', (e) => {
        if (draggingIdx >= 0) e.preventDefault();
    }, { passive: false });

    // Process button
    btnProcess.addEventListener('click', processImage);

    // Reset
    btnReset.addEventListener('click', reset);
    btnReset2.addEventListener('click', reset);

    // Back to crop
    btnBack.addEventListener('click', backToCrop);

    // Mode switching — live re-process
    modeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            modeButtons.forEach(b => b.classList.remove('scan-mode-btn--active'));
            btn.classList.add('scan-mode-btn--active');
            currentMode = btn.dataset.mode;

            if (processed) reprocess();
        });
    });

    // Sliders: update display + reprocess on input (debounced for smoothness)
    brightnessInput.addEventListener('input', () => {
        updateSliderDisplays();
        debouncedReprocess();
    });
    contrastInput.addEventListener('input', () => {
        updateSliderDisplays();
        debouncedReprocess();
    });
    sharpnessInput.addEventListener('input', () => {
        updateSliderDisplays();
        debouncedReprocess();
    });

    // Export
    btnExport.addEventListener('click', exportResult);
    btnCopy.addEventListener('click', copyResult);
    btnExportPdf.addEventListener('click', exportPdf);

    // Export split menu
    ExportUtils.initSplitMenu({
        toggleBtn: btnExportToggle,
        menu: document.getElementById('scanExportMenu'),
        labelEl: document.getElementById('scanExportLabel'),
        onFormatChange: null,
    });

    // ─── INIT ───────────────────────────────────────────────────
    updateSliderDisplays();
    updateUI();
})();
