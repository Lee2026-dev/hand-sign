/**
 * Hand Sign — Canvas Signature Engine
 * Smooth Bézier curve drawing with pen customization and export.
 */

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
    if (history.length <= 0) return;

    history.pop(); // remove current state

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (history.length > 0) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
      };
      img.src = history[history.length - 1];
    } else {
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

    // Draw from the current canvas data
    const img = new Image();
    img.onload = () => {
      exportCtx.drawImage(img, 0, 0);

      exportCanvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const now = new Date();
        const dateStr =
          now.getFullYear().toString() +
          (now.getMonth() + 1).toString().padStart(2, '0') +
          now.getDate().toString().padStart(2, '0');
        a.download = `signature_${dateStr}.png`;
        a.href = url;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/png');
    };
    img.src = history[history.length - 1];
  }

  // --- UI Updates ---
  function updateUI() {
    const hasContent = history.length > 0;
    btnUndo.disabled = !hasContent;
    btnExport.disabled = !hasContent;
  }

  function updateWidthDisplay() {
    widthValue.textContent = `${widthInput.value}px`;
  }

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

  // Resize handling
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 150);
  });

  // --- Init ---
  resizeCanvas();
  updateWidthDisplay();
  updateUI();
})();
