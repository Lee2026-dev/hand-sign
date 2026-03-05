/**
 * Hand Sign — Canvas Signature Engine
 * Smooth Bézier curve drawing with pen customization and export.
 */

/* ============================================================
   Shared Export Utilities
   ============================================================ */
const ExportUtils = (function () {
  'use strict';

  const FORMAT_CONFIG = {
    png: { mime: 'image/png', ext: '.png', label: '导出 PNG', transparent: true },
    jpeg: { mime: 'image/jpeg', ext: '.jpg', label: '导出 JPEG', transparent: false },
    webp: { mime: 'image/webp', ext: '.webp', label: '导出 WebP', transparent: true },
    svg: { mime: 'image/svg+xml', ext: '.svg', label: '导出 SVG', transparent: true },
  };

  const STORAGE_KEY = 'handsign_export_format';

  function getSavedFormat() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return FORMAT_CONFIG[saved] ? saved : 'png';
  }

  function saveFormat(fmt) {
    localStorage.setItem(STORAGE_KEY, fmt);
  }

  function getDateStr() {
    const now = new Date();
    return now.getFullYear().toString()
      + (now.getMonth() + 1).toString().padStart(2, '0')
      + now.getDate().toString().padStart(2, '0');
  }

  /**
   * Export a canvas to a file download.
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {string} format - 'png' | 'jpeg' | 'webp' | 'svg'
   * @param {string} filenamePrefix - e.g. 'signature' or 'signature_nobg'
   */
  function downloadCanvas(sourceCanvas, format, filenamePrefix) {
    const config = FORMAT_CONFIG[format];
    if (!config) return;

    const dateStr = getDateStr();

    if (format === 'svg') {
      // Wrap canvas data URL inside an SVG <image>
      const dataUrl = sourceCanvas.toDataURL('image/png');
      const w = sourceCanvas.width;
      const h = sourceCanvas.height;
      const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <image width="${w}" height="${h}" xlink:href="${dataUrl}" />
</svg>`;
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      triggerDownload(blob, `${filenamePrefix}_${dateStr}${config.ext}`);
      return;
    }

    // For JPEG, we need a white background
    let exportCanvas = sourceCanvas;
    if (format === 'jpeg') {
      exportCanvas = document.createElement('canvas');
      exportCanvas.width = sourceCanvas.width;
      exportCanvas.height = sourceCanvas.height;
      const ectx = exportCanvas.getContext('2d');
      ectx.fillStyle = '#FFFFFF';
      ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ectx.drawImage(sourceCanvas, 0, 0);
    }

    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      triggerDownload(blob, `${filenamePrefix}_${dateStr}${config.ext}`);
    }, config.mime, format === 'jpeg' ? 0.92 : undefined);
  }

  function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.download = filename;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    // Delay cleanup to allow browser to register the download filename
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /**
   * Copy canvas content to clipboard as PNG.
   * @param {HTMLCanvasElement} sourceCanvas
   * @returns {Promise<boolean>}
   */
  async function copyToClipboard(sourceCanvas) {
    try {
      const blob = await new Promise((resolve, reject) => {
        sourceCanvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error('toBlob failed'));
        }, 'image/png');
      });

      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      return true;
    } catch (err) {
      console.error('Copy to clipboard failed:', err);
      return false;
    }
  }

  /**
   * Flash a "copied" state on a button.
   * @param {HTMLButtonElement} btn
   */
  function flashCopied(btn) {
    const labelEl = btn.querySelector('.btn__label');
    const origText = labelEl.textContent;
    btn.classList.add('is-copied');
    labelEl.textContent = '✓ 已复制';
    setTimeout(() => {
      btn.classList.remove('is-copied');
      labelEl.textContent = origText;
    }, 1500);
  }

  /**
   * Set up split button + dropdown menu for a panel.
   * @param {Object} opts
   * @param {HTMLElement} opts.toggleBtn - the ▾ button
   * @param {HTMLElement} opts.menu - the dropdown menu
   * @param {HTMLElement} opts.labelEl - the label span inside the main button
   * @param {Function} opts.onFormatChange - callback(format)
   */
  function initSplitMenu({ toggleBtn, menu, labelEl, onFormatChange }) {
    const currentFormat = getSavedFormat();
    const config = FORMAT_CONFIG[currentFormat];
    labelEl.textContent = config.label;

    // Mark the active item in this menu
    menu.querySelectorAll('.export-menu__item').forEach((item) => {
      item.classList.toggle('export-menu__item--active', item.dataset.format === currentFormat);
    });

    // Toggle dropdown
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.toggle('is-open');
      toggleBtn.setAttribute('aria-expanded', isOpen);
    });

    // Select format
    menu.addEventListener('click', (e) => {
      const item = e.target.closest('.export-menu__item');
      if (!item) return;

      const fmt = item.dataset.format;
      saveFormat(fmt);

      // Update active markers
      menu.querySelectorAll('.export-menu__item').forEach((el) => {
        el.classList.toggle('export-menu__item--active', el.dataset.format === fmt);
      });

      // Sync label on ALL panels
      document.getElementById('exportLabel').textContent = FORMAT_CONFIG[fmt].label;
      document.getElementById('bgExportLabel').textContent = FORMAT_CONFIG[fmt].label;
      const scanLabel = document.getElementById('scanExportLabel');
      if (scanLabel) scanLabel.textContent = FORMAT_CONFIG[fmt].label;

      // Sync active markers on the OTHER menus too
      const allMenuIds = ['exportMenu', 'bgExportMenu', 'scanExportMenu'];
      allMenuIds.forEach(id => {
        if (id === menu.id) return;
        const otherMenu = document.getElementById(id);
        if (!otherMenu) return;
        otherMenu.querySelectorAll('.export-menu__item').forEach((el) => {
          el.classList.toggle('export-menu__item--active', el.dataset.format === fmt);
        });
      });

      menu.classList.remove('is-open');
      toggleBtn.setAttribute('aria-expanded', 'false');

      if (onFormatChange) onFormatChange(fmt);
    });

    // Close on outside click
    document.addEventListener('click', () => {
      menu.classList.remove('is-open');
      toggleBtn.setAttribute('aria-expanded', 'false');
    });
  }

  return {
    FORMAT_CONFIG,
    getSavedFormat,
    saveFormat,
    getDateStr,
    downloadCanvas,
    copyToClipboard,
    flashCopied,
    initSplitMenu,
  };
})();


/* ============================================================
   Signature Canvas Module
   ============================================================ */
(function () {
  'use strict';

  // --- DOM Elements ---
  const canvas = document.getElementById('signatureCanvas');
  const ctx = canvas.getContext('2d');
  const wrapper = canvas.closest('.canvas-wrapper');

  const colorInput = document.getElementById('penColor');
  const widthInput = document.getElementById('penWidth');
  const widthValue = document.getElementById('penWidthValue');

  const btnUndo = document.getElementById('btnUndo');
  const btnClear = document.getElementById('btnClear');
  const btnExport = document.getElementById('btnExport');
  const btnExportToggle = document.getElementById('btnExportToggle');
  const btnCopy = document.getElementById('btnCopy');

  // --- State ---
  let isDrawing = false;
  let points = [];        // current stroke points
  let history = [];       // array of ImageData snapshots
  const MAX_HISTORY = 30;

  // --- Canvas Setup ---
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Redraw last snapshot if available
    if (history.length > 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = history[history.length - 1];
    }
  }

  function saveSnapshot() {
    if (history.length >= MAX_HISTORY) {
      history.shift();
    }
    history.push(canvas.toDataURL());
    updateUI();
  }

  // --- Drawing ---
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function startStroke(e) {
    e.preventDefault();
    isDrawing = true;
    points = [getPointerPos(e)];
    wrapper.classList.add('is-active');

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = colorInput.value;
    ctx.lineWidth = parseFloat(widthInput.value);
  }

  function continueStroke(e) {
    if (!isDrawing) return;
    e.preventDefault();

    const pos = getPointerPos(e);
    points.push(pos);

    // Draw with quadratic Bézier for smoothness
    if (points.length >= 3) {
      ctx.beginPath();
      const len = points.length;
      const p0 = points[len - 3];
      const p1 = points[len - 2];
      const p2 = points[len - 1];

      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;

      if (len === 3) {
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
      } else {
        const prevMidX = (p0.x + p1.x) / 2;
        const prevMidY = (p0.y + p1.y) / 2;
        ctx.moveTo(prevMidX, prevMidY);
        ctx.quadraticCurveTo(p1.x, p1.y, midX, midY);
      }

      ctx.stroke();
    } else if (points.length === 2) {
      // Just two points, draw a simple line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.stroke();
    }
  }

  function endStroke(e) {
    if (!isDrawing) return;
    e.preventDefault();
    isDrawing = false;
    wrapper.classList.remove('is-active');

    // Draw a dot for single-point taps
    if (points.length === 1) {
      const p = points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }

    points = [];
    wrapper.classList.add('has-content');
    saveSnapshot();
  }

  // --- Actions ---
  function undo() {
    // history[0] is always the blank floor — nothing to undo beyond that
    if (history.length <= 1) return;

    history.pop(); // remove current state, expose previous

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, rect.width, rect.height);
    };
    img.src = history[history.length - 1];

    // If we're back to the blank floor, remove has-content
    if (history.length === 1) {
      wrapper.classList.remove('has-content');
    }
    updateUI();
  }

  function clearCanvas() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    history = [];
    wrapper.classList.remove('has-content');
    updateUI();
  }

  function exportSignature() {
    if (history.length === 0) return;

    // Create a temporary canvas for a clean export (transparent background)
    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    exportCanvas.width = rect.width * dpr;
    exportCanvas.height = rect.height * dpr;

    const img = new Image();
    img.onload = () => {
      exportCtx.drawImage(img, 0, 0);
      ExportUtils.downloadCanvas(exportCanvas, ExportUtils.getSavedFormat(), 'signature');
    };
    img.src = history[history.length - 1];
  }

  async function copySignature() {
    if (history.length === 0) return;

    const exportCanvas = document.createElement('canvas');
    const exportCtx = exportCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    exportCanvas.width = rect.width * dpr;
    exportCanvas.height = rect.height * dpr;

    const img = new Image();
    img.onload = async () => {
      exportCtx.drawImage(img, 0, 0);
      const ok = await ExportUtils.copyToClipboard(exportCanvas);
      if (ok) ExportUtils.flashCopied(btnCopy);
    };
    img.src = history[history.length - 1];
  }

  // --- UI Updates ---
  function updateUI() {
    // history[0] is the blank floor, so strokes exist only when length > 1
    const hasStrokes = history.length > 1;
    btnUndo.disabled = !hasStrokes;
    btnExport.disabled = !hasStrokes;
    btnExportToggle.disabled = !hasStrokes;
    btnCopy.disabled = !hasStrokes;
  }

  function updateWidthDisplay() {
    widthValue.textContent = `${widthInput.value}px`;
  }

  // --- Split Menu Init ---
  ExportUtils.initSplitMenu({
    toggleBtn: btnExportToggle,
    menu: document.getElementById('exportMenu'),
    labelEl: document.getElementById('exportLabel'),
    onFormatChange: null,
  });

  // --- Event Listeners ---
  // Pointer events (unified mouse + touch)
  canvas.addEventListener('pointerdown', startStroke);
  canvas.addEventListener('pointermove', continueStroke);
  canvas.addEventListener('pointerup', endStroke);
  canvas.addEventListener('pointerleave', endStroke);

  // Prevent context menu on long press (mobile)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // Toolbar controls
  widthInput.addEventListener('input', updateWidthDisplay);
  btnUndo.addEventListener('click', undo);
  btnClear.addEventListener('click', clearCanvas);
  btnExport.addEventListener('click', exportSignature);
  btnCopy.addEventListener('click', copySignature);

  // Resize handling
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 150);
  });

  // --- Init ---
  resizeCanvas();
  saveSnapshot(); // save initial blank state as the undo floor
  updateWidthDisplay();
  updateUI();
})();

/* ============================================================
   Tab Switching
   ============================================================ */
(function () {
  'use strict';

  const tabs = [
    { tab: document.getElementById('tabSign'), panel: document.getElementById('panelSign') },
    { tab: document.getElementById('tabBg'), panel: document.getElementById('panelBg') },
    { tab: document.getElementById('tabScan'), panel: document.getElementById('panelScan') },
  ];

  function activateTab(index) {
    tabs.forEach((t, i) => {
      const isActive = i === index;
      t.tab.classList.toggle('tabs__item--active', isActive);
      t.tab.setAttribute('aria-selected', String(isActive));
      t.panel.classList.toggle('tab-panel--hidden', !isActive);
    });
  }

  tabs.forEach((t, i) => {
    t.tab.addEventListener('click', () => activateTab(i));
  });
})();

/* ============================================================
   Background Removal Module
   ============================================================ */
(function () {
  'use strict';

  // --- DOM ---
  const uploadZone = document.getElementById('uploadZone');
  const fileInput = document.getElementById('fileInput');
  const bgPreview = document.getElementById('bgPreview');
  const bgCanvas = document.getElementById('bgCanvas');
  const bgCtx = bgCanvas.getContext('2d');
  const toleranceInput = document.getElementById('bgTolerance');
  const toleranceValue = document.getElementById('bgToleranceValue');
  const btnBgApply = document.getElementById('btnBgApply');
  const btnBgReset = document.getElementById('btnBgReset');
  const btnBgExport = document.getElementById('btnBgExport');
  const btnBgExportToggle = document.getElementById('btnBgExportToggle');
  const btnBgCopy = document.getElementById('btnBgCopy');

  // --- State ---
  let originalImageData = null;  // raw ImageData before any removal
  let sourceImg = null;  // original Image element
  let bgRemoved = false; // track if background has been removed

  // --- Helper: euclidean color distance ---
  function colorDist(r1, g1, b1, r2, g2, b2) {
    return Math.sqrt(
      (r1 - r2) * (r1 - r2) +
      (g1 - g2) * (g1 - g2) +
      (b1 - b2) * (b1 - b2)
    );
  }

  // --- Sample background color from image corners ---
  function sampleBgColor(data, width, height) {
    const positions = [
      [0, 0],
      [width - 1, 0],
      [0, height - 1],
      [width - 1, height - 1],
    ];
    let r = 0, g = 0, b = 0;
    for (const [x, y] of positions) {
      const idx = (y * width + x) * 4;
      r += data[idx];
      g += data[idx + 1];
      b += data[idx + 2];
    }
    return [Math.round(r / 4), Math.round(g / 4), Math.round(b / 4)];
  }

  // --- Core: remove background pixels within tolerance ---
  function removeBackground(tolerance) {
    if (!originalImageData) return;

    // Work on a copy so we can re-apply with different tolerance
    const copy = new ImageData(
      new Uint8ClampedArray(originalImageData.data),
      originalImageData.width,
      originalImageData.height
    );
    const { data, width, height } = copy;
    const [br, bg, bb] = sampleBgColor(originalImageData.data, width, height);

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (colorDist(r, g, b, br, bg, bb) <= tolerance) {
        data[i + 3] = 0; // set alpha to 0 (transparent)
      }
    }

    bgCtx.putImageData(copy, 0, 0);
    bgRemoved = true;
    updateBgUI();
  }

  // --- Load image onto canvas ---
  function loadImage(file) {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        sourceImg = img;

        // Fit canvas to image aspect ratio (max 720×400)
        const maxW = 720;
        const maxH = 400;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }

        bgCanvas.width = w;
        bgCanvas.height = h;
        bgCanvas.style.height = '';   // let CSS handle display

        bgCtx.clearRect(0, 0, w, h);
        bgCtx.drawImage(img, 0, 0, w, h);

        // Save the original pixel data for re-apply
        originalImageData = bgCtx.getImageData(0, 0, w, h);

        // Show preview area, hide upload zone
        uploadZone.style.display = 'none';
        bgPreview.style.display = 'flex';
        bgRemoved = false;
        updateBgUI();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // --- Export ---
  function exportResult() {
    ExportUtils.downloadCanvas(bgCanvas, ExportUtils.getSavedFormat(), 'signature_nobg');
  }

  // --- Copy ---
  async function copyResult() {
    const ok = await ExportUtils.copyToClipboard(bgCanvas);
    if (ok) ExportUtils.flashCopied(btnBgCopy);
  }

  // --- UI ---
  function updateBgUI() {
    const canExport = bgRemoved;
    btnBgExport.disabled = !canExport;
    btnBgExportToggle.disabled = !canExport;
    btnBgCopy.disabled = !canExport;
  }

  // --- Reset ---
  function reset() {
    originalImageData = null;
    sourceImg = null;
    fileInput.value = '';
    bgRemoved = false;
    updateBgUI();
    bgPreview.style.display = 'none';
    uploadZone.style.display = '';
  }

  // --- Split Menu Init ---
  ExportUtils.initSplitMenu({
    toggleBtn: btnBgExportToggle,
    menu: document.getElementById('bgExportMenu'),
    labelEl: document.getElementById('bgExportLabel'),
    onFormatChange: null,
  });

  // --- Event Listeners ---
  fileInput.addEventListener('change', (e) => loadImage(e.target.files[0]));

  // Drag and drop
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

  toleranceInput.addEventListener('input', () => {
    toleranceValue.textContent = toleranceInput.value;
  });

  btnBgApply.addEventListener('click', () => {
    removeBackground(parseInt(toleranceInput.value, 10));
  });

  btnBgReset.addEventListener('click', reset);
  btnBgExport.addEventListener('click', exportResult);
  btnBgCopy.addEventListener('click', copyResult);
})();
