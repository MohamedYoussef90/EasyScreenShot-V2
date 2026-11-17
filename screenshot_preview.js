document.addEventListener('DOMContentLoaded', function() {
  const loading = document.getElementById('loading');
  const screenshotContainer = document.getElementById('screenshotContainer');
  const screenshotCanvas = document.getElementById('screenshotCanvas');
  const annotationToolbar = document.getElementById('annotationToolbar');
  const infoBar = document.getElementById('infoBar');
  const urlInfo = document.getElementById('urlInfo');
  const timestamp = document.getElementById('timestamp');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const closeBtn = document.getElementById('closeBtn');
  const selectToolButton = document.getElementById('selectTool');
  const rectangleTool = document.getElementById('rectangleTool');
  const penTool = document.getElementById('penTool');
  const arrowTool = document.getElementById('arrowTool');
  const redactTool = document.getElementById('redactTool');
  const textTool = document.getElementById('textTool');
  const annotationColor = document.getElementById('annotationColor');
  const textFontSize = document.getElementById('textFontSize');
  const annotationThickness = document.getElementById('annotationThickness');
  const colorProperty = document.getElementById('colorProperty');
  const fontSizeProperty = document.getElementById('fontSizeProperty');
  const thicknessProperty = document.getElementById('thicknessProperty');
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');

  if (!loading || !screenshotContainer || !screenshotCanvas || !annotationToolbar ||
      !infoBar || !urlInfo || !timestamp || !downloadBtn || !copyBtn || !closeBtn ||
      !selectToolButton || !rectangleTool || !penTool || !arrowTool || !redactTool || !textTool || !annotationColor ||
      !textFontSize || !annotationThickness || !colorProperty || !fontSizeProperty ||
      !thicknessProperty || !undoBtn || !clearBtn) {
    console.error('Critical preview elements are missing.');
    if (loading) loading.textContent = 'Error: Missing required elements';
    return;
  }

  const context = screenshotCanvas.getContext('2d');
  if (!context) {
    loading.textContent = 'Error: Canvas is not available.';
    console.error('Failed to create the screenshot canvas context.');
    return;
  }

  const historyStack = [];
  const thicknesses = { thin: 2, medium: 5, thick: 9 };
  let baseImage = null;
  let currentDataUrl = '';
  let currentTool = 'rectangle';
  let currentFontSize = Number(textFontSize.value);
  let currentFontColor = annotationColor.value;
  let activeAction = null;
  let selectedShape = null;
  let lastShapeDragPoint = null;
  let shapeDragMode = null;
  let activeResizeHandle = null;
  let resizeOrigin = null;
  let activeTextInput = null;
  let finishActiveTextInput = null;

  function showNotification(message, isError) {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      max-width: 360px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      background: ${isError ? '#d93025' : '#188038'};
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-size: 14px;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3500);
  }

  function showError(message) {
    console.error('EasyScreenshot Preview Error:', message);
    showNotification(message, true);
  }

  function loadScreenshotData() {
    const params = new URLSearchParams(window.location.hash.substring(1));
    const screenshotId = params.get('id');
    if (!screenshotId) {
      loading.textContent = 'Error: No screenshot data found.';
      showError('No screenshot ID found in the preview URL.');
      return;
    }

    chrome.storage.local.get(screenshotId, (result) => {
      if (chrome.runtime.lastError) {
        loading.textContent = 'Error: Failed to load screenshot data.';
        showError(`Error retrieving screenshot: ${chrome.runtime.lastError.message}`);
        return;
      }

      const data = result[screenshotId];
      if (!data || !data.dataUrl) {
        loading.textContent = 'Error: Screenshot data is missing or invalid.';
        showError('Screenshot data is missing or invalid.');
        return;
      }

      chrome.storage.local.remove(screenshotId, () => {
        if (chrome.runtime.lastError) {
          console.warn('Failed to remove temporary screenshot data:', chrome.runtime.lastError);
        }
      });

      displayScreenshot(data.dataUrl, data.url, data.includeUrl, data.urlAlreadyIncluded);
    });
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action !== 'displayScreenshot') return;

    if (!message.dataUrl) {
      sendResponse({ error: 'No screenshot data received' });
      showError('No screenshot data received.');
      return;
    }

    displayScreenshot(message.dataUrl, message.url, message.includeUrl, message.urlAlreadyIncluded);
    sendResponse({ success: true });
  });

  function displayScreenshot(dataUrl, url, includeUrl, urlAlreadyIncluded) {
    const imageData = includeUrl && url && !urlAlreadyIncluded
      ? processImageWithUrl(dataUrl, url).catch((error) => {
          showError(`Could not add the URL header: ${error.message}`);
          return dataUrl;
        })
      : Promise.resolve(dataUrl);

    imageData.then((processedDataUrl) => {
      const image = new Image();
      image.onload = () => {
        baseImage = image;
        currentDataUrl = processedDataUrl;
        screenshotCanvas.width = image.naturalWidth;
        screenshotCanvas.height = image.naturalHeight;
        screenshotContainer.style.display = 'block';
        annotationToolbar.style.display = 'flex';
        infoBar.style.display = 'flex';
        loading.style.display = 'none';
        urlInfo.textContent = url || 'Unknown URL';
        timestamp.textContent = new Date().toLocaleString();
        redrawCanvas();
      };
      image.onerror = () => {
        loading.textContent = 'Error: Failed to load screenshot image.';
        showError('Failed to load the screenshot image.');
      };
      image.src = processedDataUrl;
    }).catch((error) => {
      loading.textContent = 'Error: Failed to process screenshot.';
      showError(`Failed to display screenshot: ${error.message}`);
    });
  }

  function processImageWithUrl(dataUrl, url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Failed to create canvas context');

          const horizontalPadding = Math.min(15, canvas.width / 2);
          const textWidth = Math.max(1, canvas.width - horizontalPadding * 2);
          const font = '16px Arial';
          const lineHeight = 20;
          ctx.font = font;
          const lines = getWrappedTextLines(ctx, url, textWidth);
          const urlHeight = Math.max(50, 12 + lines.length * lineHeight + 12);
          canvas.height = image.naturalHeight + urlHeight;

          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#000';
          ctx.font = font;
          ctx.textBaseline = 'top';
          lines.forEach((line, index) => {
            ctx.fillText(line, horizontalPadding, 12 + index * lineHeight);
          });
          ctx.strokeStyle = '#ccc';
          ctx.beginPath();
          ctx.moveTo(horizontalPadding, urlHeight - 1);
          ctx.lineTo(canvas.width - horizontalPadding, urlHeight - 1);
          ctx.stroke();
          ctx.drawImage(image, 0, urlHeight);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error('Failed to load image for URL processing.'));
      image.src = dataUrl;
    });
  }

  function getPoint(event) {
    const bounds = screenshotCanvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(screenshotCanvas.width, (event.clientX - bounds.left) * screenshotCanvas.width / bounds.width)),
      y: Math.max(0, Math.min(screenshotCanvas.height, (event.clientY - bounds.top) * screenshotCanvas.height / bounds.height))
    };
  }

  function getThickness(tool) {
    const thickness = thicknesses[annotationThickness.value] || thicknesses.medium;
    return tool === 'redact' ? thickness * 5 : thickness;
  }

  function drawSmoothPath(ctx, points) {
    if (!points.length) return;
    if (points.length === 1) {
      ctx.beginPath();
      ctx.arc(points[0].x, points[0].y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midpointX = (points[i].x + points[i + 1].x) / 2;
      const midpointY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midpointX, midpointY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function drawArrow(ctx, action) {
    const deltaX = action.endX - action.startX;
    const deltaY = action.endY - action.startY;
    const length = Math.hypot(deltaX, deltaY);
    if (!length) return;

    const angle = Math.atan2(deltaY, deltaX);
    const headLength = Math.min(length * 0.45, Math.max(action.size * 3, 10));
    const headAngle = Math.PI / 6;

    ctx.beginPath();
    ctx.moveTo(action.startX, action.startY);
    ctx.lineTo(action.endX, action.endY);
    ctx.moveTo(action.endX, action.endY);
    ctx.lineTo(
      action.endX - headLength * Math.cos(angle - headAngle),
      action.endY - headLength * Math.sin(angle - headAngle)
    );
    ctx.moveTo(action.endX, action.endY);
    ctx.lineTo(
      action.endX - headLength * Math.cos(angle + headAngle),
      action.endY - headLength * Math.sin(angle + headAngle)
    );
    ctx.stroke();
  }

  function getWrappedTextLines(ctx, text, maxWidth) {
    const lines = [];
    const paragraphs = text.split(/\r\n|\r|\n/);

    paragraphs.forEach((paragraph) => {
      let line = '';
      const tokens = paragraph.match(/\s+|\S+/g) || [];

      tokens.forEach((token) => {
        if (/^\s+$/.test(token)) {
          if (!line) {
            for (const character of Array.from(token)) {
              if (line && ctx.measureText(line + character).width > maxWidth) {
                lines.push(line);
                line = '';
              }
              line += character;
            }
          } else if (ctx.measureText(line + token).width <= maxWidth) {
            line += token;
          } else {
            lines.push(line);
            line = '';
          }
          return;
        }

        if (ctx.measureText(line + token).width <= maxWidth) {
          line += token;
          return;
        }

        if (line) {
          lines.push(line);
          line = '';
        }
        for (const character of Array.from(token)) {
          if (line && ctx.measureText(line + character).width > maxWidth) {
            lines.push(line);
            line = '';
          }
          line += character;
        }
      });

      lines.push(line);
    });

    return lines;
  }

  function drawAction(ctx, action) {
    ctx.save();
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;

    if (action.tool === 'arrow') {
      ctx.lineWidth = action.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawArrow(ctx, action);
    } else if (action.tool === 'text') {
      const fontSize = action.fontSize || action.size * 5;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      const lineHeight = action.lineHeight || fontSize * 1.2;
      const lines = getWrappedTextLines(ctx, action.text, action.width);
      lines.forEach((line, index) => {
        ctx.fillText(line, action.x, action.y + index * lineHeight);
      });
    } else if (action.type === 'rectangle') {
      ctx.lineWidth = action.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const left = Math.min(action.startX, action.endX);
      const top = Math.min(action.startY, action.endY);
      ctx.strokeRect(left, top, Math.abs(action.endX - action.startX), Math.abs(action.endY - action.startY));
    } else if (action.type === 'pen' || action.type === 'redact') {
      ctx.lineWidth = action.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      drawSmoothPath(ctx, action.points);
    }

    ctx.restore();
  }

  function redrawCanvas(includeSelectionHandles = true) {
    if (!baseImage) return;

    context.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
    context.drawImage(baseImage, 0, 0, screenshotCanvas.width, screenshotCanvas.height);
    historyStack.forEach((action) => drawAction(context, action));
    if (activeAction) drawAction(context, activeAction);
    if (includeSelectionHandles && currentTool === 'select' && selectedShape && selectedShape.type === 'rectangle') {
      drawSelectionHandles(context, selectedShape);
    }
  }

  function selectTool(tool) {
    currentTool = tool;
    if (tool !== 'select') {
      selectedShape = null;
      shapeDragMode = null;
      activeResizeHandle = null;
      lastShapeDragPoint = null;
      resizeOrigin = null;
    }
    const tools = [
      [selectToolButton, 'select'],
      [rectangleTool, 'rectangle'],
      [penTool, 'pen'],
      [arrowTool, 'arrow'],
      [redactTool, 'redact'],
      [textTool, 'text']
    ];
    tools.forEach(([button, name]) => {
      button.setAttribute('aria-pressed', String(name === currentTool));
    });
    screenshotCanvas.style.cursor = tool === 'redact'
      ? 'cell'
      : tool === 'select'
        ? 'grab'
        : 'crosshair';
    updateToolbarVisibility();
    redrawCanvas();
  }

  function updateToolbarVisibility() {
    const activePropertyTool = activeTextInput ? 'text' : currentTool;
    const isTextTool = activePropertyTool === 'text';
    const isSelectTool = activePropertyTool === 'select';

    colorProperty.hidden = isSelectTool;
    fontSizeProperty.hidden = !isTextTool;
    thicknessProperty.hidden = isSelectTool || isTextTool;
  }

  updateToolbarVisibility();

  function updateHistoryControls() {
    const hasActions = historyStack.length > 0;
    undoBtn.disabled = !hasActions;
    clearBtn.disabled = !hasActions;
  }

  function isTextEditorControl(element) {
    return element === textFontSize || element === annotationColor;
  }

  function finishTextEditorIfFocusLeavesControls() {
    if (activeTextInput && !isTextEditorControl(document.activeElement) &&
        document.activeElement !== activeTextInput && finishActiveTextInput) {
      finishActiveTextInput(true);
    }
  }

  function findTextAnnotationAt(point) {
    for (let i = historyStack.length - 1; i >= 0; i--) {
      const action = historyStack[i];
      if (action.tool === 'text' &&
          point.x >= action.x && point.x <= action.x + action.width &&
          point.y >= action.y && point.y <= action.y + action.height) {
        return action;
      }
    }
    return null;
  }

  function distanceToSegment(point, startX, startY, endX, endY) {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const lengthSquared = deltaX * deltaX + deltaY * deltaY;
    const projection = lengthSquared
      ? Math.max(0, Math.min(1, ((point.x - startX) * deltaX + (point.y - startY) * deltaY) / lengthSquared))
      : 0;
    const nearestX = startX + projection * deltaX;
    const nearestY = startY + projection * deltaY;
    return Math.hypot(point.x - nearestX, point.y - nearestY);
  }

  function getRectangleBounds(rectangle) {
    const left = Math.min(rectangle.startX, rectangle.endX);
    const top = Math.min(rectangle.startY, rectangle.endY);
    const right = Math.max(rectangle.startX, rectangle.endX);
    const bottom = Math.max(rectangle.startY, rectangle.endY);
    return { left, top, right, bottom };
  }

  function getRectangleHandles(rectangle) {
    const { left, top, right, bottom } = getRectangleBounds(rectangle);
    const middleX = (left + right) / 2;
    const middleY = (top + bottom) / 2;
    return [
      { name: 'nw', x: left, y: top, cursor: 'nwse-resize' },
      { name: 'n', x: middleX, y: top, cursor: 'ns-resize' },
      { name: 'ne', x: right, y: top, cursor: 'nesw-resize' },
      { name: 'e', x: right, y: middleY, cursor: 'ew-resize' },
      { name: 'se', x: right, y: bottom, cursor: 'nwse-resize' },
      { name: 's', x: middleX, y: bottom, cursor: 'ns-resize' },
      { name: 'sw', x: left, y: bottom, cursor: 'nesw-resize' },
      { name: 'w', x: left, y: middleY, cursor: 'ew-resize' }
    ];
  }

  function findRectangleHandleAt(point, rectangle) {
    const canvasBounds = screenshotCanvas.getBoundingClientRect();
    const scaleX = canvasBounds.width / screenshotCanvas.width || 1;
    const scaleY = canvasBounds.height / screenshotCanvas.height || 1;
    const toleranceX = 7 / scaleX;
    const toleranceY = 7 / scaleY;

    return getRectangleHandles(rectangle).find((handle) =>
      Math.abs(point.x - handle.x) <= toleranceX &&
      Math.abs(point.y - handle.y) <= toleranceY
    ) || null;
  }

  function drawSelectionHandles(ctx, rectangle) {
    const canvasBounds = screenshotCanvas.getBoundingClientRect();
    const scaleX = canvasBounds.width / screenshotCanvas.width || 1;
    const scaleY = canvasBounds.height / screenshotCanvas.height || 1;
    const handleWidth = 8 / scaleX;
    const handleHeight = 8 / scaleY;
    const { left, top, right, bottom } = getRectangleBounds(rectangle);

    ctx.save();
    ctx.strokeStyle = '#1a73e8';
    ctx.lineWidth = 1 / scaleX;
    ctx.setLineDash([5 / scaleX, 3 / scaleX]);
    ctx.strokeRect(left, top, right - left, bottom - top);
    ctx.setLineDash([]);

    getRectangleHandles(rectangle).forEach(({ x, y }) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#1a73e8';
      ctx.lineWidth = 1 / scaleX;
      ctx.fillRect(x - handleWidth / 2, y - handleHeight / 2, handleWidth, handleHeight);
      ctx.strokeRect(x - handleWidth / 2, y - handleHeight / 2, handleWidth, handleHeight);
    });
    ctx.restore();
  }

  function findShapeAt(point) {
    for (let i = historyStack.length - 1; i >= 0; i--) {
      const action = historyStack[i];
      if (action.type === 'rectangle') {
        const { left, right, top, bottom } = getRectangleBounds(action);
        if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
          return action;
        }
      } else if (action.tool === 'arrow') {
        const hitTolerance = Math.max(action.size / 2 + 5, 8);
        if (distanceToSegment(point, action.startX, action.startY, action.endX, action.endY) <= hitTolerance) {
          return action;
        }
      }
    }
    return null;
  }

  function updateSelectedShape(point) {
    if (!selectedShape || !shapeDragMode || !lastShapeDragPoint) return;

    if (shapeDragMode === 'resize' && resizeOrigin && activeResizeHandle) {
      const bounds = { ...resizeOrigin };
      if (activeResizeHandle.name.includes('w')) bounds.left = point.x;
      if (activeResizeHandle.name.includes('e')) bounds.right = point.x;
      if (activeResizeHandle.name.includes('n')) bounds.top = point.y;
      if (activeResizeHandle.name.includes('s')) bounds.bottom = point.y;
      selectedShape.startX = bounds.left;
      selectedShape.startY = bounds.top;
      selectedShape.endX = bounds.right;
      selectedShape.endY = bounds.bottom;
    } else {
      const deltaX = point.x - lastShapeDragPoint.x;
      const deltaY = point.y - lastShapeDragPoint.y;
      selectedShape.startX += deltaX;
      selectedShape.startY += deltaY;
      selectedShape.endX += deltaX;
      selectedShape.endY += deltaY;
    }
    lastShapeDragPoint = point;
  }

  function createTextInput(point, existingAction) {
    if (activeTextInput) {
      if (document.activeElement === activeTextInput) {
        activeTextInput.blur();
      } else if (finishActiveTextInput) {
        finishActiveTextInput(true);
      }
    }

    const input = document.createElement('textarea');
    currentFontColor = existingAction ? existingAction.color : annotationColor.value;
    annotationColor.value = currentFontColor;
    const savedFontSize = existingAction ? Number(existingAction.fontSize) : NaN;
    const fontSize = [12, 16, 24, 32].includes(savedFontSize)
      ? savedFontSize
      : currentFontSize;
    currentFontSize = fontSize;
    textFontSize.value = String(fontSize);
    const bounds = screenshotCanvas.getBoundingClientRect();
    const displayScale = bounds.width / screenshotCanvas.width;
    const left = bounds.left + point.x * displayScale;
    const top = bounds.top + point.y * displayScale;
    const maxInputWidth = Math.max(40, window.innerWidth - left - 8);
    const maxInputHeight = Math.max(40, window.innerHeight - top - 8);
    const initialWidth = existingAction
      ? existingAction.width * displayScale + 16
      : Math.min(280, maxInputWidth);
    const initialHeight = existingAction
      ? existingAction.height * displayScale + 12
      : Math.min(100, maxInputHeight);
    const originalIndex = existingAction ? historyStack.indexOf(existingAction) : -1;
    const dragHandle = document.createElement('div');

    input.setAttribute('aria-label', 'Annotation text');
    input.placeholder = 'Type text; Enter to finish, Shift+Enter for a new line';
    input.style.cssText = `
      position: fixed;
      left: ${left}px;
      top: ${top}px;
      z-index: 10000;
      width: ${Math.min(initialWidth, maxInputWidth)}px;
      height: ${Math.min(initialHeight, maxInputHeight)}px;
      min-width: 40px;
      min-height: 40px;
      max-width: ${maxInputWidth}px;
      max-height: ${maxInputHeight}px;
      box-sizing: border-box;
      resize: both;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-wrap: anywhere;
      padding: 5px 7px;
      border: 1px solid ${currentFontColor};
      border-radius: 4px;
      outline: none;
      color: ${currentFontColor};
      background: rgba(32, 33, 36, 0.94);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      font-family: sans-serif;
      font-size: ${fontSize}px;
      line-height: ${fontSize * 1.2}px;
    `;
    input.value = existingAction ? existingAction.text : '';

    dragHandle.textContent = '↕ Move';
    dragHandle.setAttribute('role', 'button');
    dragHandle.setAttribute('aria-label', 'Drag to move text annotation');
    dragHandle.style.cssText = `
      position: fixed;
      left: ${left}px;
      top: ${Math.max(0, top - 22)}px;
      z-index: 10001;
      padding: 2px 6px;
      border: 1px solid #5f6368;
      border-radius: 4px;
      color: #fff;
      background: #3c4043;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.3);
      font: 11px/16px sans-serif;
      cursor: grab;
      user-select: none;
      touch-action: none;
    `;

    const positionDragHandle = () => {
      dragHandle.style.left = input.style.left;
      dragHandle.style.top = `${Math.max(0, parseFloat(input.style.top) - 22)}px`;
    };

    dragHandle.addEventListener('pointerdown', (dragEvent) => {
      dragEvent.preventDefault();
      dragEvent.stopPropagation();
      const startX = dragEvent.clientX;
      const startY = dragEvent.clientY;
      const startLeft = parseFloat(input.style.left);
      const startTop = parseFloat(input.style.top);
      dragHandle.setPointerCapture(dragEvent.pointerId);

      const moveEditor = (moveEvent) => {
        const canvasBounds = screenshotCanvas.getBoundingClientRect();
        const minLeft = canvasBounds.left;
        const minTop = canvasBounds.top;
        const maxLeft = Math.max(minLeft, canvasBounds.right - input.offsetWidth);
        const maxTop = Math.max(minTop, canvasBounds.bottom - input.offsetHeight);
        const nextLeft = Math.max(minLeft, Math.min(maxLeft, startLeft + moveEvent.clientX - startX));
        const nextTop = Math.max(minTop, Math.min(maxTop, startTop + moveEvent.clientY - startY));
        input.style.left = `${nextLeft}px`;
        input.style.top = `${nextTop}px`;
        positionDragHandle();
      };

      const stopDragging = () => {
        dragHandle.removeEventListener('pointermove', moveEditor);
        dragHandle.removeEventListener('pointerup', stopDragging);
        dragHandle.removeEventListener('pointercancel', stopDragging);
      };

      dragHandle.addEventListener('pointermove', moveEditor);
      dragHandle.addEventListener('pointerup', stopDragging);
      dragHandle.addEventListener('pointercancel', stopDragging);
    });

    document.body.appendChild(input);
    document.body.appendChild(dragHandle);
    activeTextInput = input;
    updateToolbarVisibility();

    if (originalIndex !== -1) {
      historyStack.splice(originalIndex, 1);
      updateHistoryControls();
      redrawCanvas();
    }

    const finish = (shouldCommit) => {
      if (activeTextInput !== input) return;
      activeTextInput = null;
      finishActiveTextInput = null;
      updateToolbarVisibility();

      const text = input.value;
      const inputStyle = window.getComputedStyle(input);
      const contentWidth = input.clientWidth -
        parseFloat(inputStyle.paddingLeft) - parseFloat(inputStyle.paddingRight);
      const canvasBounds = screenshotCanvas.getBoundingClientRect();
      const finalPoint = {
        x: Math.max(0, Math.min(
          screenshotCanvas.width,
          (parseFloat(input.style.left) - canvasBounds.left) * screenshotCanvas.width / canvasBounds.width
        )),
        y: Math.max(0, Math.min(
          screenshotCanvas.height,
          (parseFloat(input.style.top) - canvasBounds.top) * screenshotCanvas.height / canvasBounds.height
        ))
      };
      const width = Math.max(
        1,
        Math.min(
          screenshotCanvas.width - finalPoint.x,
          contentWidth / displayScale
        )
      );
      const fontSize = currentFontSize;
      const lineHeight = fontSize * 1.2;
      context.save();
      context.font = `${fontSize}px sans-serif`;
      const height = getWrappedTextLines(context, text, width).length * lineHeight;
      context.restore();

      input.remove();
      dragHandle.remove();
      if (shouldCommit && text.length > 0) {
        const action = existingAction || {};
        Object.assign(action, {
          tool: 'text',
          text,
          x: finalPoint.x,
          y: finalPoint.y,
          color: currentFontColor,
          fontSize,
          width,
          height,
          lineHeight
        });
        historyStack.push(action);
        updateHistoryControls();
        redrawCanvas();
      } else if (existingAction) {
        historyStack.splice(Math.min(originalIndex, historyStack.length), 0, existingAction);
        updateHistoryControls();
        redrawCanvas();
      }
    };

    finishActiveTextInput = finish;
    input.addEventListener('keydown', (keyEvent) => {
      if (keyEvent.key === 'Enter' && (!keyEvent.shiftKey || keyEvent.ctrlKey || keyEvent.metaKey)) {
        keyEvent.preventDefault();
        finish(true);
      } else if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        finish(false);
      }
    });
    input.addEventListener('blur', (blurEvent) => {
      if (isTextEditorControl(blurEvent.relatedTarget) || isTextEditorControl(document.activeElement)) {
        setTimeout(finishTextEditorIfFocusLeavesControls, 0);
        return;
      }
      finish(true);
    });
    input.focus();
  }

  textFontSize.addEventListener('change', () => {
    currentFontSize = Number(textFontSize.value);
    if (activeTextInput) {
      activeTextInput.style.fontSize = `${currentFontSize}px`;
      activeTextInput.style.lineHeight = `${currentFontSize * 1.2}px`;
      activeTextInput.focus();
    }
  });
  textFontSize.addEventListener('blur', () => setTimeout(finishTextEditorIfFocusLeavesControls, 0));
  annotationColor.addEventListener('blur', () => setTimeout(finishTextEditorIfFocusLeavesControls, 0));

  const updateActiveTextColor = () => {
    currentFontColor = annotationColor.value;
    if (activeTextInput) {
      activeTextInput.style.color = currentFontColor;
      activeTextInput.style.borderColor = currentFontColor;
    }
  };
  annotationColor.addEventListener('input', updateActiveTextColor);
  annotationColor.addEventListener('change', updateActiveTextColor);

  screenshotCanvas.addEventListener('pointerdown', (event) => {
    if (!baseImage) return;
    event.preventDefault();
    const point = getPoint(event);
    if (currentTool === 'select') {
      const handle = selectedShape && selectedShape.type === 'rectangle'
        ? findRectangleHandleAt(point, selectedShape)
        : null;
      const targetShape = handle ? selectedShape : findShapeAt(point);
      selectedShape = targetShape;
      shapeDragMode = targetShape ? (handle ? 'resize' : 'move') : null;
      activeResizeHandle = handle;
      lastShapeDragPoint = targetShape ? point : null;
      resizeOrigin = shapeDragMode === 'resize' ? getRectangleBounds(targetShape) : null;
      if (selectedShape) {
        screenshotCanvas.style.cursor = handle ? handle.cursor : 'grabbing';
        screenshotCanvas.setPointerCapture(event.pointerId);
      } else {
        screenshotCanvas.style.cursor = 'grab';
      }
      redrawCanvas();
      return;
    }
    if (currentTool !== 'arrow' && currentTool !== 'select') {
      const textAnnotation = findTextAnnotationAt(point);
      if (textAnnotation) {
        createTextInput({ x: textAnnotation.x, y: textAnnotation.y }, textAnnotation);
        return;
      }
    }
    if (currentTool === 'text') {
      createTextInput(point);
      return;
    }
    if (activeAction) return;

    const type = currentTool;
    activeAction = type === 'arrow'
      ? {
          tool: 'arrow',
          color: annotationColor.value,
          size: getThickness(type),
          startX: point.x,
          startY: point.y,
          endX: point.x,
          endY: point.y
        }
      : {
          type,
          color: annotationColor.value,
          width: getThickness(type),
          startX: point.x,
          startY: point.y,
          endX: point.x,
          endY: point.y,
          points: [point]
        };
    screenshotCanvas.setPointerCapture(event.pointerId);
    redrawCanvas();
  });

  screenshotCanvas.addEventListener('pointermove', (event) => {
    if (selectedShape && shapeDragMode && lastShapeDragPoint) {
      event.preventDefault();
      updateSelectedShape(getPoint(event));
      redrawCanvas();
      return;
    }
    if (!activeAction) return;
    event.preventDefault();
    const point = getPoint(event);
    if (activeAction.type === 'rectangle' || activeAction.tool === 'arrow') {
      activeAction.endX = point.x;
      activeAction.endY = point.y;
    } else {
      activeAction.points.push(point);
    }
    redrawCanvas();
  });

  screenshotCanvas.addEventListener('pointerup', (event) => {
    if (shapeDragMode) {
      updateSelectedShape(getPoint(event));
      shapeDragMode = null;
      activeResizeHandle = null;
      lastShapeDragPoint = null;
      resizeOrigin = null;
      screenshotCanvas.style.cursor = currentTool === 'select'
        ? 'grab'
        : currentTool === 'redact'
          ? 'cell'
          : 'crosshair';
      redrawCanvas();
      return;
    }
    if (!activeAction) return;
    const point = getPoint(event);
    if (activeAction.type === 'rectangle' || activeAction.tool === 'arrow') {
      activeAction.endX = point.x;
      activeAction.endY = point.y;
    } else {
      activeAction.points.push(point);
    }

    const action = activeAction;
    activeAction = null;
    if (action.tool === 'arrow'
      ? Math.hypot(action.endX - action.startX, action.endY - action.startY) >= 2
      : action.type !== 'rectangle' ||
        (Math.abs(action.endX - action.startX) >= 2 && Math.abs(action.endY - action.startY) >= 2)) {
      historyStack.push(action);
    }
    updateHistoryControls();
    redrawCanvas();
  });

  screenshotCanvas.addEventListener('pointercancel', () => {
    shapeDragMode = null;
    activeResizeHandle = null;
    lastShapeDragPoint = null;
    resizeOrigin = null;
    activeAction = null;
    redrawCanvas();
  });

  rectangleTool.addEventListener('click', () => selectTool('rectangle'));
  selectToolButton.addEventListener('click', () => selectTool('select'));
  penTool.addEventListener('click', () => selectTool('pen'));
  arrowTool.addEventListener('click', () => selectTool('arrow'));
  redactTool.addEventListener('click', () => selectTool('redact'));
  textTool.addEventListener('click', () => selectTool('text'));

  undoBtn.addEventListener('click', () => {
    if (historyStack.length) {
      const removedAction = historyStack.pop();
      if (removedAction === selectedShape) selectedShape = null;
      updateHistoryControls();
      redrawCanvas();
    }
  });

  clearBtn.addEventListener('click', () => {
    if (!historyStack.length) return;
    historyStack.length = 0;
    activeAction = null;
    selectedShape = null;
    shapeDragMode = null;
    activeResizeHandle = null;
    lastShapeDragPoint = null;
    resizeOrigin = null;
    updateHistoryControls();
    redrawCanvas();
  });

  function getExportDataUrl() {
    if (!baseImage) throw new Error('No screenshot data available');
    redrawCanvas(false);
    try {
      return screenshotCanvas.toDataURL('image/png');
    } finally {
      redrawCanvas();
    }
  }

  downloadBtn.addEventListener('click', () => {
    try {
      const link = document.createElement('a');
      link.href = getExportDataUrl();
      link.download = `easyscreenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showNotification('Screenshot downloaded.', false);
    } catch (error) {
      showError(`Download failed: ${error.message}`);
    }
  });

  copyBtn.addEventListener('click', async () => {
    try {
      const dataUrl = getExportDataUrl();
      const response = await fetch(dataUrl);
      if (!response.ok) throw new Error(`Failed to read image data (${response.status})`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Image data is empty');

      if (!navigator.clipboard || !window.ClipboardItem) {
        throw new Error('Image clipboard access is not available');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showNotification('Annotated screenshot copied to clipboard.', false);
    } catch (error) {
      console.error('Image clipboard copy failed:', error);
      try {
        const dataUrl = getExportDataUrl();
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          throw new Error('Clipboard access is not available');
        }
        await navigator.clipboard.writeText(dataUrl);
        showNotification('Image copying was unavailable; the image data URL was copied as text.', false);
      } catch (fallbackError) {
        showError(`Copy failed: ${fallbackError.message}`);
      }
    }
  });

  closeBtn.addEventListener('click', () => {
    if (historyStack.length && !confirm(`You have ${historyStack.length} annotation(s) that will be lost. Close the preview?`)) {
      return;
    }
    window.close();
  });

  document.addEventListener('keydown', (event) => {
    const target = event.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undoBtn.click();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      downloadBtn.click();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      copyBtn.click();
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
      event.preventDefault();
      closeBtn.click();
    } else if (event.key === 'Escape') {
      if (activeAction) {
        activeAction = null;
        redrawCanvas();
      } else {
        closeBtn.click();
      }
    } else if (event.key === 'Delete' && historyStack.length) {
      undoBtn.click();
    }
  });

  loadScreenshotData();
});
