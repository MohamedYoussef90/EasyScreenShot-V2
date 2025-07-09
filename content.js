async function scrollAndCapture(message) {
    const body = document.body;
    const html = document.documentElement;
  
    // Backup original styles and scroll
    const originalOverflow = body.style.overflow;
    const originalScrollTop = html.scrollTop;
    const originalScrollLeft = html.scrollLeft;
  
    body.style.overflow = 'hidden';
  
    // Full page size
    const fullWidth = Math.max(
      body.scrollWidth, html.scrollWidth,
      body.offsetWidth, html.offsetWidth,
      body.clientWidth, html.clientWidth
    );
    const fullHeight = Math.max(
      body.scrollHeight, html.scrollHeight,
      body.offsetHeight, html.offsetHeight,
      body.clientHeight, html.clientHeight
    );
    const viewportWidth = html.clientWidth;
    const viewportHeight = html.clientHeight;
  
    // Calculate scroll positions bottom -> top
    const steps = [];
    let y = fullHeight - viewportHeight;
    if (y < 0) y = 0;
    while (y >= 0) {
      steps.unshift(y); // Insert to the beginning
      y -= viewportHeight;
    }
    if (steps[0] !== 0) {
      steps.unshift(0); // Ensure top is captured
    }
  
    // Collect fixed/sticky elements and hide them (for later restoration)
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
  
    // Capture each scroll step
    const images = [];
    for (let scrollY of steps) {
      window.scrollTo(0, scrollY);
      await new Promise(resolve => setTimeout(resolve, 150)); // Wait to render
  
      const dataUrl = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'captureVisibleAreaForFullPage' }, response => {
          resolve(response.dataUrl);
        });
      });
  
      const img = new Image();
      img.src = dataUrl;
      await new Promise(resolve => (img.onload = resolve));
  
      images.push({ img, y: scrollY, height: img.height });
    }
  
    // Restore elements and scroll position
    fixedElements.forEach(({ el, originalDisplay, originalVisibility }) => {
      el.style.display = originalDisplay;
      el.style.visibility = originalVisibility;
    });
  
    body.style.overflow = originalOverflow;
    window.scrollTo(originalScrollLeft, originalScrollTop);
  
    // Prepare canvas to stitch all parts
    const stitchedCanvas = document.createElement('canvas');
    stitchedCanvas.width = fullWidth;
    stitchedCanvas.height = fullHeight;
    const ctx = stitchedCanvas.getContext('2d');
  
    for (const { img, y, height } of images) {
      ctx.drawImage(img, 0, 0, img.width, height, 0, y, fullWidth, height);
    }
  
    let finalDataUrl;
  
    if (message.includeUrl && message.url) {
      const urlHeight = 50;
      const urlCanvas = document.createElement('canvas');
      urlCanvas.width = stitchedCanvas.width;
      urlCanvas.height = stitchedCanvas.height + urlHeight;
      const urlCtx = urlCanvas.getContext('2d');
  
      // White background
      urlCtx.fillStyle = '#ffffff';
      urlCtx.fillRect(0, 0, urlCanvas.width, urlCanvas.height);
  
      // Draw URL text
      urlCtx.fillStyle = '#000000';
      urlCtx.font = '16px Arial';
      urlCtx.fillText(message.url, 15, 30);
  
      // Separator line
      urlCtx.strokeStyle = '#ccc';
      urlCtx.beginPath();
      urlCtx.moveTo(15, 40);
      urlCtx.lineTo(urlCanvas.width - 15, 40);
      urlCtx.stroke();
  
      // Draw stitched image below
      urlCtx.drawImage(stitchedCanvas, 0, urlHeight);
      finalDataUrl = urlCanvas.toDataURL('image/png');
    } else {
      finalDataUrl = stitchedCanvas.toDataURL('image/png');
    }
  
    // Send final result
    chrome.runtime.sendMessage({
      action: 'showScreenshot',
      dataUrl: finalDataUrl,
      url: message.url,
      includeUrl: message.includeUrl
    });
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scrollAndCapture') {
      scrollAndCapture(message);
    }
  });
  