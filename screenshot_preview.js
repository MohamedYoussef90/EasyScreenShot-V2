document.addEventListener('DOMContentLoaded', function() {
  const loading = document.getElementById('loading');
  const screenshotContainer = document.getElementById('screenshotContainer');
  const screenshotImage = document.getElementById('screenshotImage');
  const infoBar = document.getElementById('infoBar');
  const urlInfo = document.getElementById('urlInfo');
  const timestamp = document.getElementById('timestamp');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const closeBtn = document.getElementById('closeBtn');
  
  let currentDataUrl = '';
  let currentUrl = '';
  
  // Listen for screenshot data from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'displayScreenshot') {
      displayScreenshot(message.dataUrl, message.url, message.includeUrl);
    }
  });
  
  function displayScreenshot(dataUrl, url, includeUrl) {
    currentDataUrl = dataUrl;
    currentUrl = url;
    
    // Hide loading and show screenshot
    loading.style.display = 'none';
    screenshotContainer.style.display = 'block';
    infoBar.style.display = 'flex';
    
    // Set screenshot image
    screenshotImage.src = dataUrl;
    
    // Update info bar
    urlInfo.textContent = url;
    timestamp.textContent = new Date().toLocaleString();
  }
  
  // Download functionality
  downloadBtn.addEventListener('click', function() {
    const link = document.createElement('a');
    link.href = currentDataUrl;
    link.download = `easyscreenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Visual feedback
    downloadBtn.textContent = '✓ Downloaded';
    setTimeout(() => {
      downloadBtn.textContent = '💾 Download';
    }, 2000);
  });
  
  // Copy to clipboard functionality
  copyBtn.addEventListener('click', async function() {
    try {
      // Convert data URL to blob
      const response = await fetch(currentDataUrl);
      const blob = await response.blob();
      
      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      // Visual feedback
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => {
        copyBtn.textContent = '📋 Copy';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      copyBtn.textContent = '✗ Failed';
      setTimeout(() => {
        copyBtn.textContent = '📋 Copy';
      }, 2000);
    }
  });
  
  // Close tab functionality
  closeBtn.addEventListener('click', function() {
    window.close();
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    if (e.ctrlKey || e.metaKey) {
      switch(e.key) {
        case 's':
          e.preventDefault();
          downloadBtn.click();
          break;
        case 'c':
          e.preventDefault();
          copyBtn.click();
          break;
        case 'w':
          e.preventDefault();
          closeBtn.click();
          break;
      }
    }
    
    if (e.key === 'Escape') {
      closeBtn.click();
    }
  });
});

