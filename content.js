(() => {
if (globalThis.__easyScreenshotContentInstalled) return;
globalThis.__easyScreenshotContentInstalled = true;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let captureInProgress = false;

function requestBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function createCaptureToast() {
  const host = document.createElement('div');
  host.dataset.easyScreenshotCaptureStatus = 'true';
  host.style.cssText = 'all: initial !important; position: fixed !important; right: 16px !important; bottom: 16px !important; z-index: 2147483647 !important; display: block !important; pointer-events: none !important;';

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    [role="status"] {
      max-width: min(360px, calc(100vw - 32px));
      padding: 11px 15px;
      border: 1px solid rgba(255,255,255,.16);
      border-radius: 9px;
      color: #fff;
      background: #202124;
      box-shadow: 0 4px 16px rgba(0,0,0,.24);
      font: 500 13px/1.4 system-ui, sans-serif;
      overflow-wrap: anywhere;
    }
    [role="status"][data-kind="error"] { background: #8c1d18; }
    [role="status"][data-kind="success"] { background: #137333; }
  `;
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  shadow.append(style, status);
  (document.body || document.documentElement).appendChild(host);
  return { host, status };
}

function friendlyCaptureError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/cannot access|not allowed|restricted|chrome:\/\/|web store|extensions gallery|cannot be scripted|cannot be captured|permission/i.test(message)) {
    return 'Chrome does not allow screenshots of this page. Open a regular website and try again.';
  }
  return message;
}

async function scrollAndCapture(message) {
  const body = document.body;
  const html = document.documentElement;
  let originalScrollTop;
  let originalScrollLeft;
  let originalScrollBehavior;
  let originalScrollBehaviorPriority;
  let pageStateSaved = false;
  let toast;
  const positionedElements = [];

  const setToast = (text, kind) => {
    if (!toast) toast = createCaptureToast();
    toast.host.style.setProperty('display', 'block', 'important');
    toast.status.dataset.kind = kind || 'progress';
    toast.status.textContent = text;
  };

  try {
    if (!message) throw new Error('No message provided');
    if (!body || !html) throw new Error('Document structure not available');

    originalScrollTop = window.scrollY;
    originalScrollLeft = window.scrollX;
    originalScrollBehavior = html.style.getPropertyValue('scroll-behavior');
    originalScrollBehaviorPriority = html.style.getPropertyPriority('scroll-behavior');
    pageStateSaved = true;
    html.style.setProperty('scroll-behavior', 'auto', 'important');

    setToast('Preparing page for capture...', 'progress');
    await delay(150);

    const getPageDimensions = () => ({
      width: Math.max(body.scrollWidth, html.scrollWidth, body.offsetWidth, html.offsetWidth, html.clientWidth),
      height: Math.max(body.scrollHeight, html.scrollHeight, body.offsetHeight, html.offsetHeight, html.clientHeight)
    });

    let { width: fullWidth, height: fullHeight } = getPageDimensions();
    const viewportWidth = html.clientWidth;
    const viewportHeight = html.clientHeight;
    if (!viewportWidth || !viewportHeight) throw new Error('The page viewport has no measurable size.');

    // Visit each viewport before capturing so lazy-loaded sections can settle.
    window.scrollTo(0, 0);
    await delay(100);
    const warmupStep = Math.max(1, viewportHeight - 80);
    for (let y = warmupStep; y < fullHeight; y += warmupStep) {
      window.scrollTo(0, y);
      await delay(100);
    }
    const warmedDimensions = getPageDimensions();
    fullWidth = Math.max(fullWidth, warmedDimensions.width);
    fullHeight = Math.max(fullHeight, warmedDimensions.height);

    window.scrollTo(0, 0);
    await delay(100);
    document.querySelectorAll('*').forEach((element) => {
      if (element === toast.host) return;
      const style = window.getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') return;

      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      positionedElements.push({
        element,
        showAt: rect.top >= viewportHeight * 0.55 ? 'last' : 'first',
        visibility: element.style.getPropertyValue('visibility'),
        visibilityPriority: element.style.getPropertyPriority('visibility')
      });
    });

    window.scrollTo(0, Math.max(0, fullHeight - viewportHeight));
    await delay(200);
    const updatedDimensions = getPageDimensions();
    fullWidth = Math.max(fullWidth, updatedDimensions.width);
    fullHeight = Math.max(fullHeight, updatedDimensions.height);

    const overlapPixels = Math.min(50, Math.max(0, viewportHeight - 1));
    const steps = [0];
    while (steps[steps.length - 1] + viewportHeight < fullHeight) {
      let nextY = steps[steps.length - 1] + viewportHeight - overlapPixels;
      if (nextY + viewportHeight >= fullHeight) nextY = Math.max(0, fullHeight - viewportHeight);
      if (nextY <= steps[steps.length - 1]) break;
      steps.push(nextY);
    }

    const images = [];
    for (let i = 0; i < steps.length; i++) {
      const scrollY = steps[i];
      window.scrollTo(0, scrollY);
      await delay(180);
      const actualY = window.scrollY;

      positionedElements.forEach(({ element, showAt, visibility, visibilityPriority }) => {
        const shouldShow = (showAt === 'first' && i === 0) ||
          (showAt === 'last' && i === steps.length - 1);
        if (shouldShow) {
          if (visibility) {
            element.style.setProperty('visibility', visibility, visibilityPriority);
          } else {
            element.style.removeProperty('visibility');
          }
        } else {
          element.style.setProperty('visibility', 'hidden', 'important');
        }
      });

      setToast(`Capturing page segments... ${i + 1}/${steps.length}`, 'progress');
      toast.host.style.setProperty('display', 'none', 'important');
      const response = await requestBackground({ action: 'captureVisibleAreaForFullPage' });
      toast.host.style.setProperty('display', 'block', 'important');

      if (!response || !response.dataUrl) {
        throw new Error(friendlyCaptureError(response && response.error
          ? response.error
          : 'No screenshot data was returned for a page segment.'));
      }

      const image = new Image();
      image.src = response.dataUrl;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('A captured page segment could not be decoded.'));
      });

      images.push({
        image,
        y: actualY,
        height: Math.min(viewportHeight, Math.max(0, fullHeight - actualY)),
        viewportHeight
      });
    }

    setToast('Stitching screenshot segments...', 'progress');
    const stitchedCanvas = document.createElement('canvas');
    stitchedCanvas.width = fullWidth;
    stitchedCanvas.height = fullHeight;
    const context = stitchedCanvas.getContext('2d');
    if (!context) throw new Error('Could not create the screenshot canvas.');

    context.fillStyle = '#fff';
    context.fillRect(0, 0, fullWidth, fullHeight);

    let previousEnd = 0;
    images.forEach(({ image, y, height, viewportHeight: segmentViewportHeight }) => {
      const drawY = Math.max(y, previousEnd);
      const sourceOffset = drawY - y;
      const drawHeight = Math.min(height - sourceOffset, fullHeight - drawY);
      if (drawHeight <= 0) return;

      const scaleY = image.naturalHeight / segmentViewportHeight;
      context.drawImage(
        image,
        0,
        sourceOffset * scaleY,
        image.naturalWidth,
        drawHeight * scaleY,
        0,
        drawY,
        fullWidth,
        drawHeight
      );
      previousEnd = drawY + drawHeight;
    });

    let finalDataUrl = stitchedCanvas.toDataURL('image/png');
    if (message.includeUrl && message.url) {
      const urlHeight = 50;
      const urlCanvas = document.createElement('canvas');
      urlCanvas.width = stitchedCanvas.width;
      urlCanvas.height = stitchedCanvas.height + urlHeight;
      const urlContext = urlCanvas.getContext('2d');
      if (!urlContext) throw new Error('Could not create the URL header canvas.');

      urlContext.fillStyle = '#fff';
      urlContext.fillRect(0, 0, urlCanvas.width, urlCanvas.height);
      urlContext.fillStyle = '#000';
      urlContext.font = '16px Arial';
      urlContext.fillText(message.url, 15, 30);
      urlContext.strokeStyle = '#ccc';
      urlContext.beginPath();
      urlContext.moveTo(15, 40);
      urlContext.lineTo(urlCanvas.width - 15, 40);
      urlContext.stroke();
      urlContext.drawImage(stitchedCanvas, 0, urlHeight);
      finalDataUrl = urlCanvas.toDataURL('image/png');
    }

    const showResponse = await requestBackground({
      action: 'showScreenshot',
      dataUrl: finalDataUrl,
      url: message.url,
      includeUrl: message.includeUrl,
      urlAlreadyIncluded: message.includeUrl
    });
    if (showResponse && showResponse.error) throw new Error(showResponse.error);

    setToast('Capture complete. Opening preview...', 'success');
    setTimeout(() => toast.host.remove(), 2200);
    return { success: true };
  } catch (error) {
    const messageText = friendlyCaptureError(error);
    console.error('Full-page capture failed:', error);
    setToast(messageText, 'error');
    setTimeout(() => toast.host.remove(), 6000);
    return { error: messageText };
  } finally {
    positionedElements.forEach(({ element, visibility, visibilityPriority }) => {
      if (visibility) {
        element.style.setProperty('visibility', visibility, visibilityPriority);
      } else {
        element.style.removeProperty('visibility');
      }
    });

    if (pageStateSaved) {
      if (originalScrollBehavior) {
        html.style.setProperty('scroll-behavior', originalScrollBehavior, originalScrollBehaviorPriority);
      } else {
        html.style.removeProperty('scroll-behavior');
      }
      window.scrollTo(originalScrollLeft, originalScrollTop);
    }

  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'scrollAndCapture') return;

  if (captureInProgress) {
    sendResponse({ error: 'A screenshot capture is already in progress.' });
    return;
  }
  captureInProgress = true;

  scrollAndCapture(message)
    .then((response) => {
      captureInProgress = false;
      sendResponse(response);
    })
    .catch((error) => {
      captureInProgress = false;
      console.error('Error in scrollAndCapture message handler:', error);
      sendResponse({ error: friendlyCaptureError(error) });
    });
  return true;
});

})();
