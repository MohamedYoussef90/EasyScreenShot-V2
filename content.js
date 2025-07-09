async function scrollAndCapture(message) {
  const body = document.body;
  const originalOverflow = body.style.overflow;
  const originalScrollTop = document.documentElement.scrollTop;
  const originalScrollLeft = document.documentElement.scrollLeft;

  body.style.overflow = 'hidden';

  const fullWidth = Math.max(
    body.scrollWidth, document.documentElement.scrollWidth,
    body.offsetWidth, document.documentElement.offsetWidth,
    body.clientWidth, document.documentElement.clientWidth
  );
  const fullHeight = Math.max(
    body.scrollHeight, document.documentElement.scrollHeight,
    body.offsetHeight, document.documentElement.offsetHeight,
    body.clientHeight, document.documentElement.clientHeight
  );

  const visibleWidth = document.documentElement.clientWidth;
  const visibleHeight = document.documentElement.clientHeight;

  const steps = [];
  let y = fullHeight - visibleHeight;
  if (y < 0) y = 0;
  while (y >= 0) {
    steps.push(y);
    y -= visibleHeight;
  }

  // ✅ Hide all fixed/sticky elements before any scroll
  const fixedElements = [];
  document.querySelectorAll('*').forEach(el => {
    const style = window.getComputedStyle(el);
    if (['fixed', 'sticky'].includes(style.position)) {
      fixedElements.push({
        el,
        originalDisplay: el.style.display,
        originalVisibility: el.style.visibility
      });
      el.style.display = 'none';
    }
  });

  const images = [];

  for (let i = 0; i < steps.length; i++) {
    const scrollY = steps[i];
    window.scrollTo(0, scrollY);
    await new Promise(resolve => setTimeout(resolve, 100));

    const dataUrl = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'captureVisibleAreaForFullPage' }, (response) => {
        resolve(response.dataUrl);
      });
    });

    const img = new Image();
    img.src = dataUrl;
    await new Promise(resolve => img.onload = resolve);

    let drawHeight = img.height;
    if (scrollY + img.height > fullHeight) {
      drawHeight = fullHeight - scrollY;
    }

    images.push({ img, scrollY, drawHeight });
  }

  // ✅ Restore fixed elements
  fixedElements.forEach(({ el, originalDisplay, originalVisibility }) => {
    el.style.display = originalDisplay;
    el.style.visibility = originalVisibility;
  });

  body.style.overflow = originalOverflow;
  window.scrollTo(originalScrollLeft, originalScrollTop);

  // Stitch canvas
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = fullWidth;
  finalCanvas.height = fullHeight;
  const ctx = finalCanvas.getContext('2d');

  for (const { img, scrollY, drawHeight } of images) {
    ctx.drawImage(img, 0, 0, img.width, drawHeight, 0, scrollY, fullWidth, drawHeight);
  }

  let finalDataUrl;
  if (message.includeUrl && message.url) {
    const urlBarHeight = 50;
    const urlCanvas = document.createElement('canvas');
    urlCanvas.width = finalCanvas.width;
    urlCanvas.height = finalCanvas.height + urlBarHeight;
    const urlCtx = urlCanvas.getContext('2d');

    urlCtx.fillStyle = '#ffffff';
    urlCtx.fillRect(0, 0, urlCanvas.width, urlCanvas.height);

    urlCtx.fillStyle = '#333';
    urlCtx.font = '16px Arial';
    urlCtx.fillText(message.url, 15, 30);

    urlCtx.strokeStyle = '#ccc';
    urlCtx.beginPath();
    urlCtx.moveTo(15, 40);
    urlCtx.lineTo(urlCanvas.width - 15, 40);
    urlCtx.stroke();

    urlCtx.drawImage(finalCanvas, 0, urlBarHeight);
    finalDataUrl = urlCanvas.toDataURL('image/png');
  } else {
    finalDataUrl = finalCanvas.toDataURL('image/png');
  }

  chrome.runtime.sendMessage({
    action: 'showScreenshot',
    dataUrl: finalDataUrl,
    url: message.url,
    includeUrl: message.includeUrl
  });
}
