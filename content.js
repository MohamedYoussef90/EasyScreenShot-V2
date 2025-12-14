async function scrollAndCapture(message) {
  const body = document.body;
  const html = document.documentElement;
  let originalOverflow, originalScrollTop, originalScrollLeft;

  try {
    if (!message) {
      throw new Error('No message provided');
    }
    
    if (!body || !html) {
      throw new Error('Document structure not available');
    }

    // Backup original styles and scroll
    originalOverflow = body.style.overflow;
    originalScrollTop = html.scrollTop;
    originalScrollLeft = html.scrollLeft;

    // Prepare page for capture
    body.style.overflow = 'hidden';
    window.scrollTo(0, 0);

    // Wait for dynamic content to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));

    // Function to get accurate page dimensions
    const getPageDimensions = () => {
      return {
        width: Math.max(
          body.scrollWidth, html.scrollWidth,
          body.offsetWidth, html.offsetWidth,
          body.clientWidth, html.clientWidth
        ),
        height: Math.max(
          body.scrollHeight, html.scrollHeight,
          body.offsetHeight, html.offsetHeight,
          body.clientHeight, html.clientHeight
        )
      };
    };
    
    let { width: fullWidth, height: fullHeight } = getPageDimensions();
    const viewportWidth = html.clientWidth;
    const viewportHeight = html.clientHeight;
    
    // Force a scroll to bottom to trigger any lazy loading, then back to top
    window.scrollTo(0, fullHeight);
    await new Promise(resolve => setTimeout(resolve, 300));
    window.scrollTo(0, 0);
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Recalculate dimensions after triggering lazy loading
    const updatedDimensions = getPageDimensions();
    fullHeight = Math.max(fullHeight, updatedDimensions.height);
    fullWidth = Math.max(fullWidth, updatedDimensions.width);

    // Calculate scroll positions with overlap prevention
    const steps = [];
    const overlapPixels = 50; // Small overlap to ensure no gaps
    
    if (fullHeight <= viewportHeight) {
      // Page fits in one screen
      steps.push(0);
    } else {
      // Calculate steps from top to bottom
      let currentY = 0;
      steps.push(currentY);
      
      while (currentY + viewportHeight < fullHeight) {
        currentY += viewportHeight - overlapPixels;
        if (currentY + viewportHeight >= fullHeight) {
          // Last step should capture exactly to the bottom
          currentY = fullHeight - viewportHeight;
        }
        steps.push(currentY);
      }
    }

    const images = [];
    
    for (let i = 0; i < steps.length; i++) {
      const scrollY = steps[i];
      
      let fixedElements = [];
      
      // Hide fixed/sticky elements for subsequent captures to avoid duplication
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        
        if (["fixed", "sticky"].includes(style.position) && rect.height > 0 && rect.width > 0) {
          if (i > 0) { // Hide on all but the first capture
            fixedElements.push({
              el,
              originalDisplay: el.style.display,
              originalVisibility: el.style.visibility,
              originalOpacity: el.style.opacity
            });
            el.style.opacity = '0';
            el.style.pointerEvents = 'none';
          }
        }
      });

      // Scroll to position
      window.scrollTo({
        top: scrollY,
        left: 0,
        behavior: 'auto'
      });
      
      // Wait for scroll and content to settle
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Request visible area capture from background script
      const response = await new Promise(resolve => {
        chrome.runtime.sendMessage({ action: 'captureVisibleAreaForFullPage' }, resolve);
      });

      const dataUrl = response ? response.dataUrl : null;
      const error = response ? response.error : null;

      if (!dataUrl) {
        // Enhanced error reporting
        let errorMessage = `Capture failed for scroll step ${i}.`;
        if (error) {
            errorMessage += ` Background error: ${error}`;
        } else if (chrome.runtime.lastError) {
            errorMessage += ` chrome.runtime.lastError: ${chrome.runtime.lastError.message}`;
        } else {
            errorMessage += ` No data URL received.`;
        }
        throw new Error(errorMessage);
      }

      const img = new Image();
      img.src = dataUrl;
      await new Promise(resolve => (img.onload = resolve));

      // Calculate actual capture height (might be less than viewport for last capture)
      const actualCaptureHeight = Math.min(viewportHeight, fullHeight - scrollY);
      
      images.push({ 
        img, 
        y: scrollY, 
        height: actualCaptureHeight,
        viewportHeight: img.height 
      });

      // Restore fixed elements after each capture
      fixedElements.forEach(({ el, originalDisplay, originalVisibility, originalOpacity }) => {
        el.style.display = originalDisplay;
        el.style.visibility = originalVisibility;
        el.style.opacity = originalOpacity;
        el.style.pointerEvents = '';
      });
    }

    // Restore scroll and overflow
    body.style.overflow = originalOverflow;
    window.scrollTo(originalScrollLeft, originalScrollTop);

    // Canvas stitching
    const stitchedCanvas = document.createElement('canvas');
    stitchedCanvas.width = fullWidth;
    stitchedCanvas.height = fullHeight;
    const ctx = stitchedCanvas.getContext('2d');

    // Fill with white background to avoid transparency issues
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, stitchedCanvas.width, stitchedCanvas.height);

    // Stitch images with improved positioning
    for (let i = 0; i < images.length; i++) {
      const { img, y, height, viewportHeight } = images[i];
      
      let drawY = y;
      let drawHeight = height;
      let sourceY = 0;
      
      // Handle overlaps for middle segments
      if (i > 0) {
        const prevImage = images[i - 1];
        // The current image starts at y. The overlap is the difference.
        const overlap = (prevImage.y + prevImage.height) - y; 
        
        if (overlap > 0) {
          // Skip the overlapping portion from the top of current image
          sourceY = overlap;
          // The destination Y for the current image should be where the previous one ended
          drawY = prevImage.y + prevImage.height;
          drawHeight = height - overlap;
        }
      }
      
      // Ensure we don't draw outside canvas bounds
      if (drawY + drawHeight > fullHeight) {
        drawHeight = fullHeight - drawY;
      }
      
      if (drawHeight > 0) {
        // Draw the image segment
        ctx.drawImage(
          img,
          0, sourceY, img.width, Math.min(drawHeight, viewportHeight - sourceY), // Source rectangle
          0, drawY, fullWidth, drawHeight // Destination rectangle
        );
      }
    }

    let finalDataUrl = stitchedCanvas.toDataURL('image/png');

    // Add URL to the top if requested
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
    }

    // Send final result to background script
    // Add a slight delay to ensure the background script is ready to receive
    await new Promise(resolve => setTimeout(resolve, 50));
    
    chrome.runtime.sendMessage({
      action: 'showScreenshot',
      dataUrl: finalDataUrl,
      url: message.url,
      includeUrl: message.includeUrl,
      urlAlreadyIncluded: message.includeUrl // Flag to indicate URL is already in the image
    });
    
    // Return success to the background script's sendMessage caller
    return { success: true };

  } catch (error) {
    console.error('Error in scrollAndCapture:', error);
    
    // Restore original state on error
    if (body) {
      body.style.overflow = originalOverflow;
    }
    if (window) {
      window.scrollTo(originalScrollLeft, originalScrollTop);
    }
    
    // Send error message to background (don't call showScreenshot with null dataUrl)
    // Instead, just log the error - the background script will handle the error response
    console.error('Full page capture failed:', error.message);
    
    // Return failure to the background script's sendMessage caller
    return { error: error.message };
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === 'scrollAndCapture') {
      // Since scrollAndCapture is async, we must return true to indicate 
      // that sendResponse will be called asynchronously.
      scrollAndCapture(message)
        .then(sendResponse)
        .catch((error) => {
          console.error('Error in scrollAndCapture promise:', error);
          sendResponse({ error: error.message });
        });
      return true; 
    } else {
      console.warn('Unknown message action:', message.action);
      sendResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    console.error('Error in content script message listener:', error);
    sendResponse({ error: error.message });
  }
});
