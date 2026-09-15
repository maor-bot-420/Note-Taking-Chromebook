const workspace = document.getElementById('workspace');
const zoomWrapper = document.getElementById('zoomWrapper');

const welcomeScreen = document.getElementById('welcomeScreen');
const noteTitleInput = document.getElementById('noteTitleInput');
const initPageSizeSelect = document.getElementById('initPageSizeSelect');
const initBgSelect = document.getElementById('initBgSelect');
const createNoteBtn = document.getElementById('createNoteBtn');
const openNoteBtn = document.getElementById('openNoteBtn');
const openFileInput = document.getElementById('openFileInput');
const activeNoteTitle = document.getElementById('activeNoteTitle');
const saveBtn = document.getElementById('saveBtn');
const homeBtn = document.getElementById('homeBtn');

const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');

const modeSelect = document.getElementById('modeSelect');
const mouseControls = document.getElementById('mouseControls');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const zoomValText = document.getElementById('zoomVal');

const penBtn = document.getElementById('penBtn');
const markerBtn = document.getElementById('markerBtn');
const strokeEraserBtn = document.getElementById('strokeEraserBtn');
const eraserBtn = document.getElementById('eraserBtn');
const colorPicker = document.getElementById('colorPicker');
const presetPalette = document.getElementById('presetPalette');
const widthSlider = document.getElementById('widthSlider');
const bgSelectToolbar = document.getElementById('bgSelectToolbar');
const toolBtns = [penBtn, markerBtn, strokeEraserBtn, eraserBtn];

let isDrawing = false;
let activePage = null;
let lastX = 0;
let lastY = 0;
let currentTool = 'pen';
let pages = [];
let currentMode = 'pen';
let zoomLevel = 1.0;

let currentStroke = [];
let holdTimer = null;
let isShapeSnapped = false;
let snappedShape = null;
let isScribble = false;
let glowingScribbleActive = false;

let noteConfig = {
  title: 'Untitled Note',
  size: 'a4',
  bg: 'grid-1cm'
};

const presetColors = [
  '#222222', '#555555', '#888888', '#bbbbbb', '#e0e0e0', '#ffffff',
  '#e63946', '#f4a261', '#e9c46a', '#2a9d8f', '#264653', '#4a4e69',
  '#d62828', '#f77f00', '#fcbf49', '#003049', '#80ed99', '#3a86ff',
  '#9b5de5', '#f15bb5', '#00f5d4', '#70e000', '#ffb703', '#8338ec'
];

presetColors.forEach(color => {
  const swatch = document.createElement('div');
  swatch.className = 'color-swatch';
  swatch.style.backgroundColor = color;
  swatch.title = color;

  if (color === colorPicker.value) swatch.classList.add('selected');

  swatch.addEventListener('click', () => {
    colorPicker.value = color;
    updateActiveSwatch(swatch);
    setupToolStyle();
  });

  presetPalette.appendChild(swatch);
});

function updateActiveSwatch(selectedSwatch) {
  document.querySelectorAll('.color-swatch').forEach(sw => sw.classList.remove('selected'));
  if (selectedSwatch) selectedSwatch.classList.add('selected');
}

const cmHelper = document.createElement('div');
cmHelper.style.width = '1cm';
cmHelper.style.position = 'absolute';
cmHelper.style.visibility = 'hidden';
document.body.appendChild(cmHelper);
const cmInPixels = Math.round(cmHelper.getBoundingClientRect().width);
document.body.removeChild(cmHelper);

const toolConfig = {
  pen: { min: 1, max: cmInPixels },
  marker: { min: 16, max: cmInPixels }, 
  strokeEraser: { min: 5, max: cmInPixels },
  eraser: { min: 5, max: cmInPixels }
};

const toolSizes = {
  pen: 2.5,
  marker: 16,
  strokeEraser: 20,
  eraser: 20
};

function cloneStrokes(strokes) {
  return JSON.parse(JSON.stringify(strokes));
}

function getUndoPage() {
  if (activePage && activePage.undoStack.length > 0) return activePage;
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].undoStack.length > 0) return pages[i];
  }
  return pages[pages.length - 1] || null;
}

function getRedoPage() {
  if (activePage && activePage.redoStack.length > 0) return activePage;
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].redoStack.length > 0) return pages[i];
  }
  return pages[pages.length - 1] || null;
}

function undo() {
  const page = getUndoPage();
  if (!page || page.undoStack.length === 0) return;
  page.redoStack.push(cloneStrokes(page.strokes));
  page.strokes = page.undoStack.pop();
  page.redrawStrokes();
  page.render();
}

function redo() {
  const page = getRedoPage();
  if (!page || page.redoStack.length === 0) return;
  page.undoStack.push(cloneStrokes(page.strokes));
  page.strokes = page.redoStack.pop();
  page.redrawStrokes();
  page.render();
}

function computeStrokeBBox(stroke) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  if (stroke.shape) {
    const sh = stroke.shape;
    if (sh.type === 'line') {
      minX = Math.min(sh.x1, sh.x2); maxX = Math.max(sh.x1, sh.x2);
      minY = Math.min(sh.y1, sh.y2); maxY = Math.max(sh.y1, sh.y2);
    } else if (sh.type === 'rect') {
      minX = sh.x; maxX = sh.x + sh.w;
      minY = sh.y; maxY = sh.y + sh.h;
    } else if (sh.type === 'circle') {
      minX = sh.cx - sh.rx; maxX = sh.cx + sh.rx;
      minY = sh.cy - sh.ry; maxY = sh.cy + sh.ry;
    }
  } else if (stroke.points) {
    for (let i = 0; i < stroke.points.length; i++) {
      const pt = stroke.points[i];
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  return { minX, maxX, minY, maxY };
}

class Page {
  constructor(index) {
    this.index = index;
    this.hasBeenDrawnOn = false;
    this.strokeSnapshot = null;
    this.strokes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.preActionStrokes = null;
    this.backgroundImage = null;

    this.container = document.createElement('div');
    this.updateClass();

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    this.mainCanvas = document.createElement('canvas');
    this.mainCtx = this.mainCanvas.getContext('2d');

    this.strokeCanvas = document.createElement('canvas');
    this.strokeCtx = this.strokeCanvas.getContext('2d');

    this.container.appendChild(this.canvas);
    zoomWrapper.appendChild(this.container);

    this.attachEvents();
    this.resize();
  }

  updateClass() {
    this.container.className = `page-container ${noteConfig.size} ${noteConfig.bg}`;
  }

  resize() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    if (width === 0 || height === 0) return;

    this.canvas.width = width;
    this.canvas.height = height;
    this.mainCanvas.width = width;
    this.mainCanvas.height = height;
    this.strokeCanvas.width = width;
    this.strokeCanvas.height = height;

    this.redrawStrokes();
    this.render();
  }

  redrawStrokes() {
    this.mainCtx.clearRect(0, 0, this.mainCanvas.width, this.mainCanvas.height);

    if (this.backgroundImage) {
      this.mainCtx.drawImage(this.backgroundImage, 0, 0);
    }

    this.strokes.forEach(s => {
      this.mainCtx.save();
      if (s.tool === 'eraser') {
        this.mainCtx.globalCompositeOperation = 'destination-out';
        this.mainCtx.lineWidth = s.width;
        this.mainCtx.lineCap = 'round';
        this.mainCtx.lineJoin = 'round';
        this.mainCtx.beginPath();
        s.points.forEach((pt, i) => {
          if (i === 0) this.mainCtx.moveTo(pt.x, pt.y);
          else this.mainCtx.lineTo(pt.x, pt.y);
        });
        this.mainCtx.stroke();
      } else if (s.tool === 'pen') {
        this.mainCtx.globalCompositeOperation = 'source-over';
        this.mainCtx.strokeStyle = s.color;
        this.mainCtx.lineWidth = s.width;
        this.mainCtx.lineCap = 'round';
        this.mainCtx.lineJoin = 'round';
        this.mainCtx.beginPath();
        s.points.forEach((pt, i) => {
          if (i === 0) this.mainCtx.moveTo(pt.x, pt.y);
          else this.mainCtx.lineTo(pt.x, pt.y);
        });
        this.mainCtx.stroke();
      } else if (s.tool === 'marker') {
        this.mainCtx.globalCompositeOperation = 'source-over';
        this.mainCtx.globalAlpha = 0.25;
        this.mainCtx.strokeStyle = s.color;
        this.mainCtx.lineWidth = s.width;
        this.mainCtx.lineCap = 'square';
        this.mainCtx.lineJoin = 'miter';
        this.mainCtx.beginPath();
        s.points.forEach((pt, i) => {
          if (i === 0) this.mainCtx.moveTo(pt.x, pt.y);
          else this.mainCtx.lineTo(pt.x, pt.y);
        });
        this.mainCtx.stroke();
      } else if (s.tool === 'shape' && s.shape) {
        this.mainCtx.globalCompositeOperation = 'source-over';
        this.mainCtx.globalAlpha = s.isMarker ? 0.25 : 1.0;
        this.mainCtx.strokeStyle = s.color;
        this.mainCtx.lineWidth = s.width;
        this.mainCtx.lineCap = 'round';
        this.mainCtx.lineJoin = 'round';
        const sh = s.shape;
        if (sh.type === 'line') {
          this.mainCtx.beginPath();
          this.mainCtx.moveTo(sh.x1, sh.y1);
          this.mainCtx.lineTo(sh.x2, sh.y2);
          this.mainCtx.stroke();
        } else if (sh.type === 'rect') {
          this.mainCtx.strokeRect(sh.x, sh.y, sh.w, sh.h);
        } else if (sh.type === 'circle') {
          this.mainCtx.beginPath();
          this.mainCtx.ellipse(sh.cx, sh.cy, sh.rx, sh.ry, 0, 0, 2 * Math.PI);
          this.mainCtx.stroke();
        }
      }
      this.mainCtx.restore();
    });
  }

  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.mainCanvas, 0, 0);

    if (isDrawing && activePage === this && currentTool === 'marker') {
      this.ctx.save();
      this.ctx.globalAlpha = 0.25;
      this.ctx.drawImage(this.strokeCanvas, 0, 0);
      this.ctx.restore();
    }

    if (isDrawing && activePage === this && (currentTool === 'eraser' || currentTool === 'strokeEraser')) {
      this.ctx.save();
      this.ctx.strokeStyle = currentTool === 'strokeEraser' ? '#ff3333' : '#222222';
      this.ctx.lineWidth = 1.5;
      this.ctx.setLineDash([4, 4]);
      this.ctx.beginPath();
      this.ctx.arc(lastX, lastY, toolSizes[currentTool] / 2, 0, 2 * Math.PI);
      this.ctx.stroke();
      this.ctx.restore();
    }

    if (isDrawing && activePage === this && isShapeSnapped && snappedShape) {
      this.ctx.save();
      if (currentTool === 'marker') {
        this.ctx.globalAlpha = 0.25;
      }
      this.ctx.strokeStyle = colorPicker.value;
      this.ctx.lineWidth = toolSizes[currentTool];
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      if (snappedShape.type === 'line') {
        this.ctx.beginPath();
        this.ctx.moveTo(snappedShape.x1, snappedShape.y1);
        this.ctx.lineTo(snappedShape.x2, snappedShape.y2);
        this.ctx.stroke();
      } else if (snappedShape.type === 'rect') {
        this.ctx.strokeRect(snappedShape.x, snappedShape.y, snappedShape.w, snappedShape.h);
      } else if (snappedShape.type === 'circle') {
        this.ctx.beginPath();
        this.ctx.ellipse(snappedShape.cx, snappedShape.cy, snappedShape.rx, snappedShape.ry, 0, 0, 2 * Math.PI);
        this.ctx.stroke();
      }
      this.ctx.restore();
    }

    if (isDrawing && activePage === this && isScribble) {
      this.ctx.save();
      this.ctx.strokeStyle = '#00f0ff';
      this.ctx.shadowColor = '#00f0ff';
      this.ctx.shadowBlur = 18;
      this.ctx.lineWidth = toolSizes['pen'] * 2;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';

      this.ctx.beginPath();
      currentStroke.forEach((pt, i) => {
        if (i === 0) this.ctx.moveTo(pt.x, pt.y);
        else this.ctx.lineTo(pt.x, pt.y);
      });
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  attachEvents() {
    const handleStart = (e) => startDrawing(e, this);
    const handleMove = (e) => draw(e, this);
    const handleEnd = (e) => stopDrawing(this, e);

    this.canvas.addEventListener('pointerdown', handleStart, { passive: false });
    this.canvas.addEventListener('pointermove', handleMove, { passive: false });
    this.canvas.addEventListener('pointerup', handleEnd, { passive: false });
    this.canvas.addEventListener('pointercancel', handleEnd, { passive: false });
    this.canvas.addEventListener('pointerleave', handleEnd, { passive: false });

    // Force touch event suppression so Safari mobile doesn't convert strokes to scrolls
    this.canvas.addEventListener('touchstart', (e) => {
      if (currentMode === 'mouse' || e.touches[0].touchType === 'stylus') {
        e.preventDefault();
      }
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      if (isDrawing) e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}

function updateModeUI() {
  currentMode = modeSelect.value;
  document.body.className = `mode-${currentMode}`;

  if (currentMode === 'mouse') {
    mouseControls.classList.remove('hidden');
  } else {
    mouseControls.classList.add('hidden');
  }
}

function applyZoom(newZoom) {
  zoomLevel = Math.max(0.4, Math.min(2.5, newZoom));
  zoomWrapper.style.transform = `scale(${zoomLevel})`;
  zoomValText.textContent = `${Math.round(zoomLevel * 100)}%`;
}

function setupToolStyle() {
  pages.forEach(page => {
    page.mainCtx.lineCap = 'round';
    page.mainCtx.lineJoin = 'round';

    const selectedColor = colorPicker.value;
    const selectedWidth = toolSizes[currentTool];

    if (currentTool === 'pen') {
      page.mainCtx.globalCompositeOperation = 'source-over';
      page.mainCtx.strokeStyle = selectedColor;
      page.mainCtx.lineWidth = selectedWidth;
    } else if (currentTool === 'marker') {
      page.strokeCtx.fillStyle = selectedColor;
    } else if (currentTool === 'eraser' || currentTool === 'strokeEraser') {
      page.mainCtx.globalCompositeOperation = 'destination-out';
      page.mainCtx.lineWidth = selectedWidth;
    }
  });
}

function setTool(toolName, selectedBtn) {
  currentTool = toolName;
  toolBtns.forEach(btn => btn.classList.remove('active'));
  if (selectedBtn) selectedBtn.classList.add('active');

  widthSlider.min = toolConfig[toolName].min;
  widthSlider.max = toolConfig[toolName].max;
  widthSlider.value = toolSizes[toolName];

  setupToolStyle();
}

function createNewPage() {
  const newPage = new Page(pages.length);
  pages.push(newPage);
  setupToolStyle();
  return newPage;
}

function getPos(e, page) {
  const rect = page.canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (page.canvas.width / rect.width),
    y: (e.clientY - rect.top) * (page.canvas.height / rect.height)
  };
}

function distToSegmentSq(p, v, w) {
  const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
  if (l2 === 0) return (p.x - v.x) ** 2 + (p.y - v.y) ** 2;
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  return (p.x - (v.x + t * (w.x - v.x))) ** 2 + (p.y - (v.y + t * (w.y - v.y))) ** 2;
}

function checkStrokeHit(point, stroke) {
  if (stroke.tool === 'eraser') return false;

  const threshold = (stroke.width / 2) + 12;

  if (stroke.bbox) {
    if (point.x < stroke.bbox.minX - threshold ||
        point.x > stroke.bbox.maxX + threshold ||
        point.y < stroke.bbox.minY - threshold ||
        point.y > stroke.bbox.maxY + threshold) {
      return false;
    }
  }

  const threshSq = threshold * threshold;

  if (stroke.tool === 'shape' && stroke.shape) {
    const sh = stroke.shape;
    if (sh.type === 'line') {
      return distToSegmentSq(point, { x: sh.x1, y: sh.y1 }, { x: sh.x2, y: sh.y2 }) <= threshSq;
    } else if (sh.type === 'rect') {
      const p1 = { x: sh.x, y: sh.y };
      const p2 = { x: sh.x + sh.w, y: sh.y };
      const p3 = { x: sh.x + sh.w, y: sh.y + sh.h };
      const p4 = { x: sh.x, y: sh.y + sh.h };
      return distToSegmentSq(point, p1, p2) <= threshSq ||
             distToSegmentSq(point, p2, p3) <= threshSq ||
             distToSegmentSq(point, p3, p4) <= threshSq ||
             distToSegmentSq(point, p4, p1) <= threshSq;
    } else if (sh.type === 'circle') {
      const dist = Math.hypot(point.x - sh.cx, point.y - sh.cy);
      return Math.abs(dist - Math.max(sh.rx, sh.ry)) <= threshold;
    }
  }

  if (stroke.points) {
    for (let i = 0; i < stroke.points.length - 1; i++) {
      if (distToSegmentSq(point, stroke.points[i], stroke.points[i + 1]) <= threshSq) {
        return true;
      }
    }
  }
  return false;
}

function analyzeShape(points) {
  if (points.length < 6) return null;

  const cleanPoints = [...points];
  while (cleanPoints.length > 2) {
    const pLast = cleanPoints[cleanPoints.length - 1];
    const pPrev = cleanPoints[cleanPoints.length - 2];
    if (Math.hypot(pLast.x - pPrev.x, pLast.y - pPrev.y) < 4) {
      cleanPoints.pop();
    } else {
      break;
    }
  }

  if (cleanPoints.length < 4) return null;

  const start = cleanPoints[0];
  const end = cleanPoints[cleanPoints.length - 1];
  const endDist = Math.hypot(end.x - start.x, end.y - start.y);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let pathLength = 0;

  for (let i = 0; i < cleanPoints.length; i++) {
    minX = Math.min(minX, cleanPoints[i].x);
    maxX = Math.max(maxX, cleanPoints[i].x);
    minY = Math.min(minY, cleanPoints[i].y);
    maxY = Math.max(maxY, cleanPoints[i].y);

    if (i > 0) {
      pathLength += Math.hypot(cleanPoints[i].x - cleanPoints[i - 1].x, cleanPoints[i].y - cleanPoints[i - 1].y);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const maxDim = Math.max(width, height);
  const isClosed = endDist < maxDim * 0.45 || (cleanPoints.length > 18 && endDist < 35);

  if (isClosed && maxDim > 20) {
    const isSquareish = Math.min(width, height) / maxDim > 0.65;
    const area = width * height;
    const circularity = (4 * Math.PI * (area * 0.8)) / (pathLength * pathLength);

    if (circularity > 0.35 && isSquareish) {
      return { type: 'circle', cx: minX + width / 2, cy: minY + height / 2, rx: width / 2, ry: height / 2 };
    } else {
      return { type: 'rect', x: minX, y: minY, w: width, h: height };
    }
  } else {
    return { type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  }
}

function checkScribbleGesture(points) {
  if (points.length < 10 || currentTool !== 'pen') return false;

  let directionFlips = 0;
  let lastAngle = null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 3; i < points.length; i += 2) {
    const p1 = points[i - 3];
    const p2 = points[i];
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

    minX = Math.min(minX, p2.x);
    maxX = Math.max(maxX, p2.x);
    minY = Math.min(minY, p2.y);
    maxY = Math.max(maxY, p2.y);

    if (lastAngle !== null) {
      let diff = Math.abs(angle - lastAngle);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff > Math.PI * 0.6) directionFlips++;
    }
    lastAngle = angle;
  }

  const boxSize = Math.max(maxX - minX, maxY - minY);
  return directionFlips >= 4 && boxSize < 220;
}

function hasStrokesUnderScribble(page, points) {
  for (let i = 0; i < points.length; i++) {
    for (let j = 0; j < page.strokes.length; j++) {
      if (checkStrokeHit(points[i], page.strokes[j])) {
        return true;
      }
    }
  }
  return false;
}

function executeScribbleErase(page) {
  if (currentStroke.length < 2) return;

  if (page.strokeSnapshot) {
    page.mainCtx.putImageData(page.strokeSnapshot, 0, 0);
  }

  let erasedAny = false;
  currentStroke.forEach(pt => {
    const initialCount = page.strokes.length;
    page.strokes = page.strokes.filter(s => {
      if (s.tool === 'eraser') return true;
      return !checkStrokeHit(pt, s);
    });
    if (page.strokes.length < initialCount) erasedAny = true;
  });

  if (erasedAny) {
    page.redrawStrokes();
  }

  setTool('strokeEraser', strokeEraserBtn);
  glowingScribbleActive = true;
}

function startDrawing(e, page) {
  if (e.button !== undefined && e.button !== 0) return;

  // In Pen mode: stylus draws, finger scrolls.
  if (currentMode === 'pen' && e.pointerType === 'touch') {
    return;
  }

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
  } else if (currentTool === 'marker') {
    page.strokeCtx.clearRect(0, 0, page.strokeCanvas.width, page.strokeCanvas.height);
  }

  resetHoldTimer(page);
  page.render();
}

function eraseStrokeAtPos(page, pos) {
  const initialCount = page.strokes.length;
  page.strokes = page.strokes.filter(s => {
    if (s.tool === 'eraser') return true;
    return !checkStrokeHit(pos, s);
  });
  if (page.strokes.length < initialCount) {
    page.redrawStrokes();
  }
}

function restoreFreehandStroke(page) {
  if (!page.strokeSnapshot) return;

  page.mainCtx.putImageData(page.strokeSnapshot, 0, 0);

  if (currentStroke.length < 2) return;

  page.mainCtx.save();
  page.mainCtx.strokeStyle = colorPicker.value;
  page.mainCtx.lineWidth = toolSizes[currentTool];
  page.mainCtx.lineCap = 'round';
  page.mainCtx.lineJoin = 'round';

  if (currentTool === 'eraser' || currentTool === 'strokeEraser') {
    page.mainCtx.globalCompositeOperation = 'destination-out';
  } else {
    page.mainCtx.globalCompositeOperation = 'source-over';
  }

  page.mainCtx.beginPath();
  page.mainCtx.moveTo(currentStroke[0].x, currentStroke[0].y);
  for (let i = 1; i < currentStroke.length; i++) {
    page.mainCtx.lineTo(currentStroke[i].x, currentStroke[i].y);
  }
  page.mainCtx.stroke();
  page.mainCtx.restore();
}

function resetHoldTimer(page) {
  clearTimeout(holdTimer);

  if (currentTool === 'eraser' || currentTool === 'strokeEraser') return;

  holdTimer = setTimeout(() => {
    if (isDrawing && currentStroke.length > 5 && !isScribble) {
      snappedShape = analyzeShape(currentStroke);
      if (snappedShape) {
        isShapeSnapped = true;
        if (page.strokeSnapshot) {
          page.mainCtx.putImageData(page.strokeSnapshot, 0, 0);
        }
        if (currentTool === 'marker') {
          page.strokeCtx.clearRect(0, 0, page.strokeCanvas.width, page.strokeCanvas.height);
        }
        page.render();
      }
    }
  }, 450);
}

function draw(e, page) {
  if (!isDrawing || activePage !== page) return;
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
    if (currentTool === 'marker') {
      page.strokeCtx.strokeStyle = colorPicker.value;
      page.strokeCtx.lineWidth = toolSizes['marker'];
      page.strokeCtx.lineCap = 'square';
      page.strokeCtx.lineJoin = 'miter';
      page.strokeCtx.beginPath();
      page.strokeCtx.moveTo(lastX, lastY);
      page.strokeCtx.lineTo(pos.x, pos.y);
      page.strokeCtx.stroke();
    } else {
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
  if (!isDrawing || activePage !== page) return;
  if (e && e.cancelable) e.preventDefault();

  isDrawing = false;
  clearTimeout(holdTimer);

  try {
    if (e && e.pointerId) page.canvas.releasePointerCapture(e.pointerId);
  } catch (err) {}

  let strokeAddedOrModified = false;

  if (currentTool === 'strokeEraser') {
    if (JSON.stringify(page.strokes) !== JSON.stringify(page.preActionStrokes)) {
      strokeAddedOrModified = true;
    }
    page.strokeSnapshot = null;
    page.render();
  } else if (isShapeSnapped && snappedShape && currentTool !== 'eraser') {
    const newStroke = {
      tool: 'shape',
      shape: snappedShape,
      color: colorPicker.value,
      width: toolSizes[currentTool],
      isMarker: currentTool === 'marker'
    };
    newStroke.bbox = computeStrokeBBox(newStroke);
    page.strokes.push(newStroke);
    page.redrawStrokes();
    strokeAddedOrModified = true;
  } else if ((currentTool === 'pen' || currentTool === 'marker') && !isScribble) {
    if (currentStroke.length > 0) {
      const newStroke = {
        tool: currentTool,
        color: colorPicker.value,
        width: toolSizes[currentTool],
        points: [...currentStroke]
      };
      newStroke.bbox = computeStrokeBBox(newStroke);
      page.strokes.push(newStroke);
      page.redrawStrokes();
      strokeAddedOrModified = true;
    }
  } else if (currentTool === 'eraser') {
    if (currentStroke.length > 0) {
      const newStroke = {
        tool: 'eraser',
        width: toolSizes['eraser'],
        points: [...currentStroke]
      };
      newStroke.bbox = computeStrokeBBox(newStroke);
      page.strokes.push(newStroke);
      page.redrawStrokes();
      strokeAddedOrModified = true;
    }
  }

  if (strokeAddedOrModified && page.preActionStrokes) {
    page.undoStack.push(page.preActionStrokes);
    page.redoStack = [];
  }

  if (glowingScribbleActive) {
    setTool('pen', penBtn);
    glowingScribbleActive = false;
  }

  page.strokeSnapshot = null;
  page.preActionStrokes = null;
  isShapeSnapped = false;
  snappedShape = null;
  isScribble = false;

  page.render();

  if (!page.hasBeenDrawnOn) {
    page.hasBeenDrawnOn = true;
    if (page.index === pages.length - 1) {
      createNewPage();
    }
  }

  activePage = null;
}

function startSession(title, size, bg) {
  noteConfig.title = title || 'Untitled Note';
  noteConfig.size = size;
  noteConfig.bg = bg;

  bgSelectToolbar.value = bg;
  activeNoteTitle.textContent = noteConfig.title;
  zoomWrapper.innerHTML = '';
  pages = [];

  welcomeScreen.style.display = 'none';

  createNewPage();
  setTool('pen', penBtn);
  updateModeUI();
}

function updateBackgroundStyle(newBg) {
  noteConfig.bg = newBg;
  bgSelectToolbar.value = newBg;
  pages.forEach(page => page.updateClass());
}

async function saveFile() {
  const fileData = {
    title: noteConfig.title,
    size: noteConfig.size,
    bg: noteConfig.bg,
    pagesData: pages.map(page => page.mainCanvas.toDataURL('image/png')),
    pagesStrokes: pages.map(page => page.strokes)
  };

  const jsonString = JSON.stringify(fileData, null, 2);
  const defaultFileName = `${noteConfig.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.note`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultFileName,
        types: [{
          description: 'Note File',
          accept: { 'application/json': ['.note', '.json'] },
        }],
      });
      const writable = await handle.createWritable();
      await writable.write(jsonString);
      await writable.close();
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('File save failed:', err);
    }
  }

  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFileName;
  a.click();
  URL.revokeObjectURL(url);
}

function openFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      noteConfig.title = data.title || 'Loaded Note';
      noteConfig.size = data.size || 'a4';
      noteConfig.bg = data.bg || 'grid-1cm';

      bgSelectToolbar.value = noteConfig.bg;
      activeNoteTitle.textContent = noteConfig.title;
      zoomWrapper.innerHTML = '';
      pages = [];

      welcomeScreen.style.display = 'none';

      const totalPages = data.pagesData ? data.pagesData.length : 0;

      if (totalPages === 0) {
        createNewPage();
      } else {
        data.pagesData.forEach((dataUrl, idx) => {
          const page = createNewPage();
          const pageStrokes = data.pagesStrokes ? data.pagesStrokes[idx] : null;

          if (pageStrokes) {
            page.strokes = pageStrokes;
            page.hasBeenDrawnOn = pageStrokes.length > 0;
            page.strokes.forEach(s => {
              if (!s.bbox) s.bbox = computeStrokeBBox(s);
            });
            page.redrawStrokes();
            page.render();
          } else {
            page.hasBeenDrawnOn = true;
            const img = new Image();
            img.onload = () => {
              page.backgroundImage = img;
              page.redrawStrokes();
              page.render();
            };
            img.src = dataUrl;
          }
        });

        const lastPage = pages[pages.length - 1];
        if (lastPage && lastPage.hasBeenDrawnOn) {
          createNewPage();
        }
      }

      setTool('pen', penBtn);
      updateModeUI();
    } catch (err) {
      alert('Invalid note file format.');
    }
  };
  reader.readAsText(file);
  openFileInput.value = '';
}

window.addEventListener('keydown', (e) => {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

  const isCmdOrCtrl = e.ctrlKey || e.metaKey;
  if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      redo();
    } else {
      undo();
    }
  } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    redo();
  }
});

if (undoBtn) undoBtn.addEventListener('click', () => undo());
if (redoBtn) redoBtn.addEventListener('click', () => redo());

modeSelect.addEventListener('change', updateModeUI);

zoomInBtn.addEventListener('click', () => applyZoom(zoomLevel + 0.15));
zoomOutBtn.addEventListener('click', () => applyZoom(zoomLevel - 0.15));
resetZoomBtn.addEventListener('click', () => applyZoom(1.0));

createNoteBtn.addEventListener('click', () => {
  const title = noteTitleInput.value.trim();
  const size = initPageSizeSelect.value;
  const bg = initBgSelect.value;
  startSession(title, size, bg);
});

bgSelectToolbar.addEventListener('change', (e) => {
  updateBackgroundStyle(e.target.value);
});

openNoteBtn.addEventListener('click', () => openFileInput.click());
openFileInput.addEventListener('change', openFile);

saveBtn.addEventListener('click', saveFile);
homeBtn.addEventListener('click', () => {
  welcomeScreen.style.display = 'flex';
});

penBtn.addEventListener('click', () => setTool('pen', penBtn));
markerBtn.addEventListener('click', () => setTool('marker', markerBtn));
strokeEraserBtn.addEventListener('click', () => setTool('strokeEraser', strokeEraserBtn));
eraserBtn.addEventListener('click', () => setTool('eraser', eraserBtn));

colorPicker.addEventListener('input', () => {
  const currentVal = colorPicker.value.toLowerCase();
  const swatches = document.querySelectorAll('.color-swatch');
  let matchedSwatch = null;

  swatches.forEach(swatch => {
    if (swatch.title.toLowerCase() === currentVal) matchedSwatch = swatch;
  });

  updateActiveSwatch(matchedSwatch);
  setupToolStyle();
});

widthSlider.addEventListener('input', () => {
  toolSizes[currentTool] = parseFloat(widthSlider.value);
  setupToolStyle();
});

function handleResize() {
  pages.forEach(page => page.resize());
}

window.addEventListener('resize', handleResize);
window.addEventListener('orientationchange', () => {
  setTimeout(handleResize, 200);
});

updateModeUI();
