const workspace = document.getElementById('workspace');

// Startup & File Elements
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

// UI Toolbar Controls
const penBtn = document.getElementById('penBtn');
const markerBtn = document.getElementById('markerBtn');
const eraserBtn = document.getElementById('eraserBtn');
const colorPicker = document.getElementById('colorPicker');
const presetPalette = document.getElementById('presetPalette');
const widthSlider = document.getElementById('widthSlider');
const bgSelectToolbar = document.getElementById('bgSelectToolbar');
const toolBtns = [penBtn, markerBtn, eraserBtn];

let isDrawing = false;
let activePage = null;
let lastX = 0;
let lastY = 0;
let currentTool = 'pen';
let pages = [];

// Gesture & Shape Hold Tracking
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
  eraser: { min: 5, max: cmInPixels }
};

const toolSizes = {
  pen: 2.5,
  marker: 16,
  eraser: 20
};

class Page {
  constructor(index) {
    this.index = index;
    this.hasBeenDrawnOn = false;
    this.strokeSnapshot = null;

    this.container = document.createElement('div');
    this.updateClass();

    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');

    this.mainCanvas = document.createElement('canvas');
    this.mainCtx = this.mainCanvas.getContext('2d');

    this.strokeCanvas = document.createElement('canvas');
    this.strokeCtx = this.strokeCanvas.getContext('2d');

    this.container.appendChild(this.canvas);
    workspace.appendChild(this.container);

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

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width || width;
    tempCanvas.height = this.canvas.height || height;
    const tempCtx = tempCanvas.getContext('2d');

    if (this.canvas.width > 0 && this.canvas.height > 0) {
      tempCtx.drawImage(this.mainCanvas, 0, 0);
    }

    this.canvas.width = width;
    this.canvas.height = height;
    this.mainCanvas.width = width;
    this.mainCanvas.height = height;
    this.strokeCanvas.width = width;
    this.strokeCanvas.height = height;

    if (tempCanvas.width > 0 && tempCanvas.height > 0) {
      this.mainCtx.drawImage(tempCanvas, 0, 0);
    }

    this.render();
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

    if (isDrawing && activePage === this && isShapeSnapped && snappedShape) {
      this.ctx.save();
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
    this.canvas.addEventListener('pointerdown', (e) => startDrawing(e, this));
    this.canvas.addEventListener('pointermove', (e) => draw(e, this));
    this.canvas.addEventListener('pointerup', () => stopDrawing(this));
    this.canvas.addEventListener('pointercancel', () => stopDrawing(this));
    this.canvas.addEventListener('pointerleave', () => stopDrawing(this));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
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
    } else if (currentTool === 'eraser') {
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
    x: e.clientX - rect.left,
    y: e.clientY - rect.top
  };
}

function analyzeShape(points) {
  if (points.length < 6) return null;

  const start = points[0];
  const end = points[points.length - 1];
  const endDist = Math.hypot(end.x - start.x, end.y - start.y);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  let pathLength = 0;

  for (let i = 0; i < points.length; i++) {
    minX = Math.min(minX, points[i].x);
    maxX = Math.max(maxX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxY = Math.max(maxY, points[i].y);

    if (i > 0) {
      pathLength += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const maxDim = Math.max(width, height);
  const isClosed = endDist < maxDim * 0.45 || (points.length > 18 && endDist < 35);

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

function executeScribbleErase(page) {
  if (currentStroke.length < 2) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  currentStroke.forEach(pt => {
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  });

  const pad = 15;
  page.mainCtx.save();
  page.mainCtx.globalCompositeOperation = 'destination-out';
  page.mainCtx.beginPath();
  page.mainCtx.arc((minX + maxX) / 2, (minY + maxY) / 2, Math.max(maxX - minX, maxY - minY) / 2 + pad, 0, 2 * Math.PI);
  page.mainCtx.fill();
  page.mainCtx.restore();

  setTool('eraser', eraserBtn);
  glowingScribbleActive = true;
}

function startDrawing(e, page) {
  if (e.button !== 0) return;

  isDrawing = true;
  activePage = page;
  page.canvas.setPointerCapture(e.pointerId);

  page.strokeSnapshot = page.mainCtx.getImageData(0, 0, page.canvas.width, page.canvas.height);

  const pos = getPos(e, page);
  lastX = pos.x;
  lastY = pos.y;

  currentStroke = [{ x: pos.x, y: pos.y }];
  isShapeSnapped = false;
  snappedShape = null;
  isScribble = false;

  if (currentTool === 'marker') {
    page.strokeCtx.clearRect(0, 0, page.strokeCanvas.width, page.strokeCanvas.height);
  }

  resetHoldTimer(page);
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

  if (currentTool === 'eraser') {
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

  // Disable shape snapping completely for the eraser tool
  if (currentTool === 'eraser') return;

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

  if (currentTool === 'pen' && !isScribble && checkScribbleGesture(currentStroke)) {
    isScribble = true;
    executeScribbleErase(page);
  }

  if (isScribble) {
    page.mainCtx.save();
    page.mainCtx.globalCompositeOperation = 'destination-out';
    page.mainCtx.beginPath();
    page.mainCtx.arc(pos.x, pos.y, toolSizes['eraser'], 0, 2 * Math.PI);
    page.mainCtx.fill();
    page.mainCtx.restore();
  } else if (!isShapeSnapped) {
    if (currentTool === 'marker') {
      const dx = pos.x - lastX;
      const dy = pos.y - lastY;
      const distance = Math.hypot(dx, dy);

      if (distance > 0) {
        const angle = Math.atan2(dy, dx) + Math.PI / 2;
        const width = toolSizes['marker'];
        const height = Math.max(4, width / 4);
        const steps = Math.ceil(distance / 2);

        for (let i = 0; i <= steps; i++) {
          const x = lastX + (dx * i) / steps;
          const y = lastY + (dy * i) / steps;

          page.strokeCtx.save();
          page.strokeCtx.translate(x, y);
          page.strokeCtx.rotate(angle);
          page.strokeCtx.fillRect(-width / 2, -height / 2, width, height);
          page.strokeCtx.restore();
        }
      }
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

function stopDrawing(page) {
  if (!isDrawing || activePage !== page) return;
  isDrawing = false;
  clearTimeout(holdTimer);

  if (isShapeSnapped && snappedShape && currentTool !== 'eraser') {
    page.mainCtx.save();
    page.mainCtx.globalCompositeOperation = 'source-over';
    page.mainCtx.strokeStyle = colorPicker.value;
    page.mainCtx.lineWidth = toolSizes[currentTool];
    page.mainCtx.lineCap = 'round';
    page.mainCtx.lineJoin = 'round';

    if (snappedShape.type === 'line') {
      page.mainCtx.beginPath();
      page.mainCtx.moveTo(snappedShape.x1, snappedShape.y1);
      page.mainCtx.lineTo(snappedShape.x2, snappedShape.y2);
      page.mainCtx.stroke();
    } else if (snappedShape.type === 'rect') {
      page.mainCtx.strokeRect(snappedShape.x, snappedShape.y, snappedShape.w, snappedShape.h);
    } else if (snappedShape.type === 'circle') {
      page.mainCtx.beginPath();
      page.mainCtx.ellipse(snappedShape.cx, snappedShape.cy, snappedShape.rx, snappedShape.ry, 0, 0, 2 * Math.PI);
      page.mainCtx.stroke();
    }
    page.mainCtx.restore();
  }

  if (currentTool === 'marker') {
    page.mainCtx.save();
    page.mainCtx.globalCompositeOperation = 'source-over';
    page.mainCtx.globalAlpha = 0.25;
    page.mainCtx.drawImage(page.strokeCanvas, 0, 0);
    page.mainCtx.restore();

    page.strokeCtx.clearRect(0, 0, page.strokeCanvas.width, page.strokeCanvas.height);
  }

  if (glowingScribbleActive) {
    setTool('pen', penBtn);
    glowingScribbleActive = false;
  }

  page.strokeSnapshot = null;
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

// Session Management
function startSession(title, size, bg) {
  noteConfig.title = title || 'Untitled Note';
  noteConfig.size = size;
  noteConfig.bg = bg;

  bgSelectToolbar.value = bg;
  activeNoteTitle.textContent = noteConfig.title;
  workspace.innerHTML = '';
  pages = [];

  welcomeScreen.style.display = 'none';

  createNewPage();
  setTool('pen', penBtn);
}

function updateBackgroundStyle(newBg) {
  noteConfig.bg = newBg;
  bgSelectToolbar.value = newBg;
  pages.forEach(page => page.updateClass());
}

function saveFile() {
  const fileData = {
    title: noteConfig.title,
    size: noteConfig.size,
    bg: noteConfig.bg,
    pagesData: pages.map(page => page.mainCanvas.toDataURL('image/png'))
  };

  const jsonString = JSON.stringify(fileData);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${noteConfig.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.note`;
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
      workspace.innerHTML = '';
      pages = [];

      welcomeScreen.style.display = 'none';

      let loadedCount = 0;
      const totalPages = data.pagesData ? data.pagesData.length : 0;

      if (totalPages === 0) {
        createNewPage();
      } else {
        data.pagesData.forEach((dataUrl) => {
          const page = createNewPage();
          page.hasBeenDrawnOn = true;
          const img = new Image();
          img.onload = () => {
            page.mainCtx.drawImage(img, 0, 0);
            page.render();
            loadedCount++;
            
            if (loadedCount === totalPages) {
              createNewPage();
            }
          };
          img.src = dataUrl;
        });
      }

      setTool('pen', penBtn);
    } catch (err) {
      alert('Invalid note file format.');
    }
  };
  reader.readAsText(file);
  openFileInput.value = '';
}

// Event Listeners
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