document.addEventListener('DOMContentLoaded', function() {
  const visibleAreaBtn = document.getElementById('visibleAreaBtn');
  const entirePageBtn = document.getElementById('entirePageBtn');
  const urlToggle = document.getElementById('urlToggle');
  const status = document.getElementById('status');
  
  let includeUrl = true;
  
  // Toggle URL inclusion
  urlToggle.addEventListener('click', function() {
    includeUrl = !includeUrl;
    urlToggle.classList.toggle('active', includeUrl);
    updateStatus(`URL ${includeUrl ? 'included' : 'excluded'}`);
    setTimeout(() => updateStatus('Ready to capture'), 1500);
  });
  
  // Capture visible area
  visibleAreaBtn.addEventListener('click', function() {
    updateStatus('Capturing visible area...');
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      
      chrome.runtime.sendMessage({
        action: 'captureVisibleArea',
        url: currentTab.url,
        includeUrl: includeUrl
      }, function(response) {
        if (response && response.dataUrl) {
          processAndShowScreenshot(response.dataUrl, currentTab.url, includeUrl);
          updateStatus('Screenshot captured!');
          setTimeout(() => window.close(), 1000);
        } else {
          updateStatus('Error capturing screenshot');
        }
      });
    });
  });
  
  // Capture entire page
  entirePageBtn.addEventListener('click', function() {
    updateStatus('Capturing entire page...');
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const currentTab = tabs[0];
      
      chrome.runtime.sendMessage({
        action: 'captureEntirePage',
        url: currentTab.url,
        includeUrl: includeUrl
      });
      
      updateStatus('Processing full page...');
      setTimeout(() => window.close(), 1000);
    });
  });
  
  function processAndShowScreenshot(dataUrl, url, includeUrl) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = function() {
      let canvasHeight = img.height;
      
      // Add space for URL if needed
      if (includeUrl) {
        canvasHeight += 50;
      }
      
      canvas.width = img.width;
      canvas.height = canvasHeight;
      
      // Fill background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Add URL at top if enabled
      if (includeUrl) {
        ctx.fillStyle = '#333333';
        ctx.font = '16px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(url, 15, 30);
        
        // Draw line separator
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(15, 40);
        ctx.lineTo(canvas.width - 15, 40);
        ctx.stroke();
        
        // Draw screenshot below URL
        ctx.drawImage(img, 0, 50);
      } else {
        // Draw screenshot without URL
        ctx.drawImage(img, 0, 0);
      }
      
      const finalDataUrl = canvas.toDataURL('image/png');
      
      // Show screenshot in new tab
      chrome.runtime.sendMessage({
        action: 'showScreenshot',
        dataUrl: finalDataUrl,
        url: url,
        includeUrl: includeUrl
      });
    };
    
    img.src = dataUrl;
  }
  
  function updateStatus(message) {
    status.textContent = message;
  }
});

