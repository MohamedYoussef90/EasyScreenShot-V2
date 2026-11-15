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
  const rectangleTool = document.getElementById('rectangleTool');
  const penTool = document.getElementById('penTool');
  const redactTool = document.getElementById('redactTool');
  const annotationColor = document.getElementById('annotationColor');
  const annotationThickness = document.getElementById('annotationThickness');
  const undoBtn = document.getElementById('undoBtn');
  const clearBtn = document.getElementById('clearBtn');

  if (!loading || !screenshotContainer || !screenshotCanvas || !annotationToolbar ||
      !infoBar || !urlInfo || !timestamp || !downloadBtn || !copyBtn || !closeBtn ||
      !rectangleTool || !penTool || !redactTool || !annotationColor ||
      !annotationThickness || !undoBtn || !clearBtn) {
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
  let activeAction = null;

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
          const urlHeight = 50;
          const canvas = document.createElement('canvas');
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight + urlHeight;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Failed to create canvas context');

          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#000';
          ctx.font = '16px Arial';
          ctx.fillText(url, 15, 30);
          ctx.strokeStyle = '#ccc';
          ctx.beginPath();
          ctx.moveTo(15, 40);
          ctx.lineTo(canvas.width - 15, 40);
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

  function drawAction(ctx, action) {
    ctx.save();
    ctx.strokeStyle = action.color;
    ctx.fillStyle = action.color;
    ctx.lineWidth = action.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (action.type === 'rectangle') {
      const left = Math.min(action.startX, action.endX);
      const top = Math.min(action.startY, action.endY);
      ctx.strokeRect(left, top, Math.abs(action.endX - action.startX), Math.abs(action.endY - action.startY));
    } else if (action.type === 'pen' || action.type === 'redact') {
      drawSmoothPath(ctx, action.points);
    }

    ctx.restore();
  }

  function redrawCanvas() {
    if (!baseImage) return;

    context.clearRect(0, 0, screenshotCanvas.width, screenshotCanvas.height);
    context.drawImage(baseImage, 0, 0, screenshotCanvas.width, screenshotCanvas.height);
    historyStack.forEach((action) => drawAction(context, action));
    if (activeAction) drawAction(context, activeAction);
  }

  function selectTool(tool) {
    currentTool = tool;
    const tools = [
      [rectangleTool, 'rectangle'],
      [penTool, 'pen'],
      [redactTool, 'redact']
    ];
    tools.forEach(([button, name]) => {
      button.setAttribute('aria-pressed', String(name === currentTool));
    });
    screenshotCanvas.style.cursor = tool === 'redact' ? 'cell' : 'crosshair';
  }

  function updateHistoryControls() {
    const hasActions = historyStack.length > 0;
    undoBtn.disabled = !hasActions;
    clearBtn.disabled = !hasActions;
  }

  screenshotCanvas.addEventListener('pointerdown', (event) => {
    if (!baseImage || activeAction) return;
    event.preventDefault();
    const point = getPoint(event);
    const type = currentTool;
    activeAction = {
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
    if (!activeAction) return;
    event.preventDefault();
    const point = getPoint(event);
    if (activeAction.type === 'rectangle') {
      activeAction.endX = point.x;
      activeAction.endY = point.y;
    } else {
      activeAction.points.push(point);
    }
    redrawCanvas();
  });

  screenshotCanvas.addEventListener('pointerup', (event) => {
    if (!activeAction) return;
    const point = getPoint(event);
    if (activeAction.type === 'rectangle') {
      activeAction.endX = point.x;
      activeAction.endY = point.y;
    } else {
      activeAction.points.push(point);
    }

    const action = activeAction;
    activeAction = null;
    if (action.type !== 'rectangle' ||
        (Math.abs(action.endX - action.startX) >= 2 && Math.abs(action.endY - action.startY) >= 2)) {
      historyStack.push(action);
    }
    updateHistoryControls();
    redrawCanvas();
  });

  screenshotCanvas.addEventListener('pointercancel', () => {
    activeAction = null;
    redrawCanvas();
  });

  rectangleTool.addEventListener('click', () => selectTool('rectangle'));
  penTool.addEventListener('click', () => selectTool('pen'));
  redactTool.addEventListener('click', () => selectTool('redact'));

  undoBtn.addEventListener('click', () => {
    if (historyStack.length) {
      historyStack.pop();
      updateHistoryControls();
      redrawCanvas();
    }
  });

  clearBtn.addEventListener('click', () => {
    if (!historyStack.length) return;
    historyStack.length = 0;
    activeAction = null;
    updateHistoryControls();
    redrawCanvas();
  });

  function getExportDataUrl() {
    if (!baseImage) throw new Error('No screenshot data available');
    redrawCanvas();
    return screenshotCanvas.toDataURL('image/png');
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
