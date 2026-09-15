/* ==========================================
   GLOBAL VARIABLES & CONFIGURATION
   ========================================== */
let pages = [];
let activePage = null;
let currentTool = 'pen'; // 'pen', 'marker', 'strokeEraser'
let currentMode = 'mouse'; // 'mouse', 'pen'
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentStroke = [];
let holdTimer = null;
let isShapeSnapped = false;
let snappedShape = null;
let isScribble = false;

const colorPicker = document.getElementById('colorPicker') || { value: '#000000' };
const toolSizes = {
  pen: 2,
  marker: 12,
  strokeEraser: 10
};

/* ==========================================
   UTILITY FUNCTIONS
   ========================================== */
function cloneStrokes(strokes) {
  return JSON.parse(JSON.stringify(strokes || []));
}

function getPos(e, page) {
  const rect = page.canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function resetHoldTimer(page) {
  if (holdTimer) clearTimeout(holdTimer);
  holdTimer = null;
}

function restoreFreehandStroke(page) {
  page.render();
}

function checkScribbleGesture(stroke) {
  return false; // Dynamic scribble check implementation placeholder
}

function hasStrokesUnderScribble(page, stroke) {
  return false;
}

function executeScribbleErase(page) {
  // Implementation for scribble erasing
}

function eraseStrokeAtPos(page, pos) {
  // Implementation for erasing stroke at position
}

/* ==========================================
   PAGE CLASS DEFINITION
   ========================================== */
class Page {
  constructor(canvasId, strokeCanvasId) {
    this.canvas = document.getElementById(canvasId);
    this.mainCtx = this.canvas.getContext('2d');
    
    this.strokeCanvas = document.getElementById(strokeCanvasId);
    this.strokeCtx = this.strokeCanvas ? this.strokeCanvas.getContext('2d') : null;

    this.strokes = [];
    this.preActionStrokes = [];
    this.strokeSnapshot = null;

    this.attachEvents();
  }

  attachEvents() {
    const handleStart = (e) => startDrawing(e, this);
    const handleMove = (e) => draw(e, this);
    const handleEnd = (e) => stopDrawing(this, e);

    // Pointer events for drawing hardware
    this.canvas.addEventListener('pointerdown', handleStart, { passive: false });
    this.canvas.addEventListener('pointermove', handleMove, { passive: false });
    this.canvas.addEventListener('pointerup', handleEnd, { passive: false });
    this.canvas.addEventListener('pointercancel', handleEnd, { passive: false });

    // Explicit touch event overrides to force-block page scrolling
    this.canvas.addEventListener('touchstart', (e) => {
      if (currentMode === 'mouse' || (e.touches && e.touches[0].touchType === 'stylus') || isDrawing) {
        if (e.cancelable) e.preventDefault();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  render() {
    // Redraw logic for mainCtx and strokeCtx
  }
}

/* ==========================================
   DRAWING ENGINE CORE
   ========================================== */
function startDrawing(e, page) {
  if (e.button !== undefined && e.button !== 0) return;

  // In Pen mode: stylus draws, touch/finger scrolls
  if (currentMode === 'pen' && e.pointerType === 'touch') {
    return;
  }

  // Prevent default scrolling takeover
  if (e.cancelable) e.preventDefault();

  isDrawing = true;
  activePage = page;

  try {
    page.canvas.setPointerCapture(e.pointerId);
  } catch (err) {}

  page.preActionStrokes = cloneStrokes(page.strokes);
  page.strokeSnapshot = page.mainCtx.getImageData(0, 0, page.canvas.width, page.canvas.height);

  const pos = getPos(e, page);
  lastX = pos.x;
  lastY = pos.y;

  currentStroke = [{ x: pos.x, y: pos.y }];
  isShapeSnapped = false;
  snappedShape = null;
  isScribble = false;

  if (currentTool === 'strokeEraser') {
    eraseStrokeAtPos(page, pos);
  } else if (currentTool === 'marker' && page.strokeCanvas) {
    page.strokeCtx.clearRect(0, 0, page.strokeCanvas.width, page.strokeCanvas.height);
  }

  resetHoldTimer(page);
  page.render();
}

function draw(e, page) {
  if (!isDrawing || activePage !== page) return;

  // Force block scroll during draw
  if (e.cancelable) e.preventDefault();

  const pos = getPos(e, page);
  const distFromLast = Math.hypot(pos.x - lastX, pos.y - lastY);

  currentStroke.push({ x: pos.x, y: pos.y });

  if (distFromLast > 4) {
    if (isShapeSnapped) {
      isShapeSnapped = false;
      snappedShape = null;
      restoreFreehandStroke(page);
    }
    resetHoldTimer(page);
  }

  if (currentTool === 'strokeEraser') {
    eraseStrokeAtPos(page, pos);
  } else if (currentTool === 'pen' && !isScribble && checkScribbleGesture(currentStroke)) {
    if (hasStrokesUnderScribble(page, currentStroke)) {
      isScribble = true;
      executeScribbleErase(page);
    }
  }

  if (isScribble) {
    eraseStrokeAtPos(page, pos);
  } else if (!isShapeSnapped && currentTool !== 'strokeEraser') {
    if (currentTool === 'marker' && page.strokeCtx) {
      page.strokeCtx.strokeStyle = colorPicker.value;
      page.strokeCtx.lineWidth = toolSizes['marker'];
      page.strokeCtx.lineCap = 'square';
      page.strokeCtx.lineJoin = 'miter';
      page.strokeCtx.beginPath();
      page.strokeCtx.moveTo(lastX, lastY);
      page.strokeCtx.lineTo(pos.x, pos.y);
      page.strokeCtx.stroke();
    } else {
      page.mainCtx.strokeStyle = colorPicker.value;
      page.mainCtx.lineWidth = toolSizes[currentTool] || 2;
      page.mainCtx.lineCap = 'round';
      page.mainCtx.lineJoin = 'round';
      page.mainCtx.beginPath();
      page.mainCtx.moveTo(lastX, lastY);
      page.mainCtx.lineTo(pos.x, pos.y);
      page.mainCtx.stroke();
    }
  }

  lastX = pos.x;
  lastY = pos.y;
  page.render();
}

function stopDrawing(page, e) {
  if (!isDrawing) return;
  isDrawing = false;
  
  try {
    if (e && e.pointerId) page.canvas.releasePointerCapture(e.pointerId);
  } catch (err) {}

  resetHoldTimer(page);

  if (currentStroke.length > 0) {
    page.strokes.push({
      tool: currentTool,
      color: colorPicker.value,
      size: toolSizes[currentTool] || 2,
      points: currentStroke
    });
  }

  currentStroke = [];
  activePage = null;
  page.render();
}

/* ==========================================
   INITIALIZATION
   ========================================== */
document.addEventListener('DOMContentLoaded', () => {
  const mainCanvas = document.getElementById('canvas');
  if (mainCanvas) {
    pages.push(new Page('canvas', 'strokeCanvas'));
  }
});
