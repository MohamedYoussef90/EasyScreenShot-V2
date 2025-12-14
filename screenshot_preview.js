document.addEventListener('DOMContentLoaded', function() {
  // DOM Elements
  const loading = document.getElementById('loading');
  const screenshotContainer = document.getElementById('screenshotContainer');
  const screenshotImage = document.getElementById('screenshotImage');
  const infoBar = document.getElementById('infoBar');
  const urlInfo = document.getElementById('urlInfo');
  const timestamp = document.getElementById('timestamp');
  const downloadBtn = document.getElementById('downloadBtn');
  const copyBtn = document.getElementById('copyBtn');
  const closeBtn = document.getElementById('closeBtn');
  const highlightBtn = document.getElementById('highlightBtn');
  const highlightCanvas = document.getElementById('highlightCanvas');
  
  // Validate critical DOM elements
  if (!loading || !screenshotContainer || !screenshotImage || !infoBar || 
      !urlInfo || !timestamp || !downloadBtn || !copyBtn || !closeBtn || 
      !highlightBtn || !highlightCanvas) {
    console.error('Critical DOM elements missing. Extension may not work properly.');
    if (loading) loading.textContent = 'Error: Missing required elements';
    return;
  }
  
  // State Management
  let highlightMode = false;
  let highlights = [];
  let drawing = false;
  let startX = 0, startY = 0, currentX = 0, currentY = 0;
  let imgNaturalWidth = 0, imgNaturalHeight = 0;
  let currentDataUrl = '';
  let currentUrl = '';
  let currentIncludeUrl = false; // New state variable
  
  // Performance optimization: debounced render function
  let renderTimeout = null;
  const debouncedRender = (callback, delay = 16) => {
    if (renderTimeout) clearTimeout(renderTimeout);
    renderTimeout = setTimeout(callback, delay);
  };
  
  // Error handling utility
  const showError = (message, isUserFriendly = true) => {
    console.error('EasyScreenshot Error:', message);
    if (isUserFriendly) {
      // Create temporary error notification
      const errorDiv = document.createElement('div');
      errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #ff4444;
        color: white;
        padding: 12px 16px;
        border-radius: 8px;
        z-index: 10000;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        max-width: 300px;
      `;
      errorDiv.textContent = message;
      document.body.appendChild(errorDiv);
      setTimeout(() => {
        if (errorDiv.parentNode) {
          errorDiv.parentNode.removeChild(errorDiv);
        }
      }, 5000);
    }
  };
  
  // Success notification utility
  const showSuccess = (message) => {
    const successDiv = document.createElement('div');
    successDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #4CAF50;
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 300px;
    `;
    successDiv.textContent = message;
    document.body.appendChild(successDiv);
    setTimeout(() => {
      if (successDiv.parentNode) {
        successDiv.parentNode.removeChild(successDiv);
      }
    }, 3000);
  };
  
  // New function to load screenshot data from storage
  function loadScreenshotData() {
    try {
      const hash = window.location.hash.substring(1);
      if (!hash) {
        showError('No screenshot ID found in URL', true);
        if (loading) loading.textContent = 'Error: No screenshot data found.';
        return;
      }
      
      const params = new URLSearchParams(hash);
      const screenshotId = params.get('id');

      if (!screenshotId) {
        showError('No screenshot ID found in URL', true);
        if (loading) loading.textContent = 'Error: No screenshot data found.';
        return;
      }
      
      chrome.storage.local.get(screenshotId, (result) => {
        try {
          if (chrome.runtime.lastError) {
            showError(`Error retrieving data: ${chrome.runtime.lastError.message}`, true);
            if (loading) loading.textContent = 'Error: Failed to load data from storage.';
            return;
          }

          const data = result[screenshotId];
          if (!data || !data.dataUrl) {
            showError('Screenshot data is missing or invalid', true);
            if (loading) loading.textContent = 'Error: Screenshot data is missing or invalid.';
            return;
          }
          
          // Clean up the storage item immediately
          chrome.storage.local.remove(screenshotId, () => {
            if (chrome.runtime.lastError) {
              console.warn('Failed to clean up storage:', chrome.runtime.lastError);
            }
          });

          // Display the screenshot
          displayScreenshot(data.dataUrl, data.url, data.includeUrl, data.urlAlreadyIncluded);
        } catch (error) {
          console.error('Error processing screenshot data:', error);
          showError(`Failed to process screenshot: ${error.message}`, true);
          if (loading) loading.textContent = 'Error: Failed to process screenshot.';
        }
      });
    } catch (error) {
      console.error('Error in loadScreenshotData:', error);
      showError(`Failed to load screenshot: ${error.message}`, true);
      if (loading) loading.textContent = 'Error: Failed to load screenshot.';
    }
  }

  // Listen for screenshot data from background script (only for fallback/debugging, main logic is storage)
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      if (message.action === 'displayScreenshot') {
        // This old logic is now deprecated but kept as a fallback if needed
        console.warn('Received displayScreenshot message, but using storage for primary data transfer.');
        if (!message.dataUrl) {
          throw new Error('No screenshot data received');
        }
        displayScreenshot(message.dataUrl, message.url, message.includeUrl, message.urlAlreadyIncluded || false);
        sendResponse({ success: true });
      }
    } catch (error) {
      console.error('Error in preview message handler:', error);
      showError(`Failed to display screenshot: ${error.message}`);
      sendResponse({ error: error.message });
    }
  });
  
  function displayScreenshot(dataUrl, url, includeUrl, urlAlreadyIncluded = false) {
    try {
      if (!dataUrl) {
        throw new Error('Invalid screenshot data');
      }
      
      currentUrl = url;
      currentIncludeUrl = includeUrl;
      
      // Check if URL is already included in the image (for full page captures)
      // For visible area captures, we need to add the URL here
      // For full page captures, the URL is already added in content.js
      
      if (includeUrl && url && !urlAlreadyIncluded) {
        // URL not in image yet, add it
        processImageWithUrl(dataUrl, url).then(processedDataUrl => {
          currentDataUrl = processedDataUrl;
          loadAndDisplayImage(processedDataUrl);
        }).catch(error => {
          showError(`Failed to process image with URL: ${error.message}`);
          // Fallback to displaying the original image without URL
          currentDataUrl = dataUrl;
          loadAndDisplayImage(dataUrl);
        });
      } else {
        // URL already in image or not needed, display as-is
        currentDataUrl = dataUrl;
        loadAndDisplayImage(dataUrl);
      }
      
      // Update info bar
      urlInfo.textContent = url || 'Unknown URL';
      timestamp.textContent = new Date().toLocaleString();
      
    } catch (error) {
      showError(`Failed to display screenshot: ${error.message}`);
    }
  }

  function loadAndDisplayImage(dataUrl) {
      // Hide loading and show screenshot
      loading.style.display = 'none';
      screenshotContainer.style.display = 'block';
      infoBar.style.display = 'flex';
      
      // Set screenshot image with error handling
      screenshotImage.onerror = function() {
        showError('Failed to load screenshot image');
        loading.style.display = 'block';
        screenshotContainer.style.display = 'none';
      };
      
      screenshotImage.onload = function() {
        try {
          imgNaturalWidth = screenshotImage.naturalWidth;
          imgNaturalHeight = screenshotImage.naturalHeight;
          
          if (imgNaturalWidth === 0 || imgNaturalHeight === 0) {
            throw new Error('Invalid image dimensions');
          }
          
          // Setup highlight canvas size
          highlightCanvas.width = screenshotImage.clientWidth;
          highlightCanvas.height = screenshotImage.clientHeight;
          highlightCanvas.style.width = screenshotImage.clientWidth + 'px';
          highlightCanvas.style.height = screenshotImage.clientHeight + 'px';
          highlightCanvas.style.display = highlightMode ? 'block' : 'none';
          highlightCanvas.style.pointerEvents = highlightMode ? 'auto' : 'none';
          
          // Clear any existing highlights when new image loads
          highlights = [];
          renderHighlights();
        } catch (error) {
          showError(`Failed to process image: ${error.message}`);
        }
      };
      
      screenshotImage.src = dataUrl;
  }

  // Function to process the image and add the URL
  function processImageWithUrl(dataUrl, url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Needed for canvas operations on data URLs in some contexts
      
      img.onload = () => {
        try {
          const urlHeight = 50;
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height + urlHeight;
          const ctx = canvas.getContext('2d');

          // White background
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Draw URL text
          ctx.fillStyle = '#000000';
          ctx.font = '16px Arial';
          ctx.fillText(url, 15, 30);

          // Separator line
          ctx.strokeStyle = '#ccc';
          ctx.beginPath();
          ctx.moveTo(15, 40);
          ctx.lineTo(canvas.width - 15, 40);
          ctx.stroke();

          // Draw screenshot below URL
          ctx.drawImage(img, 0, urlHeight);
          
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          reject(error);
        }
      };
      img.onerror = (e) => reject(new Error('Failed to load image for URL processing.'));
      img.src = dataUrl;
    });
  }
  
  // --- Highlight Logic (Unchanged) ---
  highlightBtn.addEventListener('click', function() {
    try {
      highlightMode = !highlightMode;
      highlightBtn.classList.toggle('btn-primary', highlightMode);
      highlightBtn.setAttribute('aria-pressed', highlightMode.toString());
      
      highlightCanvas.style.display = highlightMode ? 'block' : 'none';
      highlightCanvas.style.pointerEvents = highlightMode ? 'auto' : 'none';
      
      if (highlightMode) {
        renderHighlights();
      }
    } catch (error) {
      showError(`Failed to toggle highlight mode: ${error.message}`);
    }
  });

  // Mouse events for drawing highlights with enhanced error handling
  highlightCanvas.addEventListener('mousedown', function(e) {
    try {
      if (!highlightMode) return;
      drawing = true;
      const rect = highlightCanvas.getBoundingClientRect();
      startX = e.clientX - rect.left;
      startY = e.clientY - rect.top;
      currentX = startX;
      currentY = startY;
      
      // Add visual feedback
      highlightCanvas.style.cursor = 'crosshair';
    } catch (error) {
      showError(`Failed to start highlight: ${error.message}`);
    }
  });
  
  highlightCanvas.addEventListener('mousemove', function(e) {
    try {
      if (!highlightMode || !drawing) return;
      const rect = highlightCanvas.getBoundingClientRect();
      currentX = e.clientX - rect.left;
      currentY = e.clientY - rect.top;
      
      // Use debounced rendering for better performance
      debouncedRender(() => {
        renderHighlights();
        // Draw current rectangle
        const ctx = highlightCanvas.getContext('2d');
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(startX, startY, currentX - startX, currentY - startY);
        ctx.restore();
      });
    } catch (error) {
      showError(`Failed to update highlight: ${error.message}`);
    }
  });
  
  highlightCanvas.addEventListener('mouseup', function(e) {
    try {
      if (!highlightMode || !drawing) return;
      drawing = false;
      const rect = highlightCanvas.getBoundingClientRect();
      const endX = e.clientX - rect.left;
      const endY = e.clientY - rect.top;
      
      // Only add highlight if it's large enough (minimum 5x5 pixels)
      const width = Math.abs(endX - startX);
      const height = Math.abs(endY - startY);
      
      if (width >= 5 && height >= 5) {
        // Store highlight as relative to image size
        highlights.push({
          x: Math.min(startX, endX) / highlightCanvas.width,
          y: Math.min(startY, endY) / highlightCanvas.height,
          w: width / highlightCanvas.width,
          h: height / highlightCanvas.height
        });
        
        renderHighlights();
      } else {
        renderHighlights(); // Clear the temporary rectangle
      }
      
      highlightCanvas.style.cursor = 'default';
    } catch (error) {
      showError(`Failed to complete highlight: ${error.message}`);
    }
  });
  
  highlightCanvas.addEventListener('mouseleave', function() {
    try {
      if (drawing) {
        drawing = false;
        renderHighlights();
        highlightCanvas.style.cursor = 'default';
      }
    } catch (error) {
      showError(`Failed to handle mouse leave: ${error.message}`);
    }
  });

  function renderHighlights() {
    try {
      const ctx = highlightCanvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }
      
      // Clear canvas
      ctx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
      
      // Render each highlight
      highlights.forEach((h, index) => {
        ctx.save();
        
        // Use different colors for multiple highlights
        const colors = [
          'rgba(255, 215, 0, 0.3)', // Gold
          'rgba(255, 99, 132, 0.3)', // Pink
          'rgba(54, 162, 235, 0.3)', // Blue
          'rgba(255, 206, 86, 0.3)', // Yellow
          'rgba(75, 192, 192, 0.3)'  // Teal
        ];
        const strokeColors = [
          'rgba(255, 215, 0, 0.8)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)'
        ];
        const colorIndex = index % colors.length;
        
        ctx.fillStyle = colors[colorIndex];
        ctx.strokeStyle = strokeColors[colorIndex];
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        
        const x = h.x * highlightCanvas.width;
        const y = h.y * highlightCanvas.height;
        const w = h.w * highlightCanvas.width;
        const h_val = h.h * highlightCanvas.height; // Renamed to h_val to avoid conflict
        
        ctx.fillRect(x, y, w, h_val);
        ctx.strokeRect(x, y, w, h_val);
        
        ctx.restore();
      });
      
    } catch (error) {
      showError(`Failed to render highlights: ${error.message}`);
    }
  }
  
  // --- Download Functionality (Updated to use currentDataUrl) ---
  downloadBtn.addEventListener('click', async function() {
    try {
      if (!currentDataUrl) {
        throw new Error('No screenshot data available');
      }
      
      let dataUrlToDownload = currentDataUrl;
      
      if (highlights.length > 0) {
        // Show loading state
        downloadBtn.textContent = '⏳ Processing...';
        downloadBtn.disabled = true;
        
        try {
          dataUrlToDownload = await mergeScreenshotAndHighlights();
        } catch (error) {
          throw new Error(`Failed to merge highlights: ${error.message}`);
        }
      }
      
      // Create download link
      const link = document.createElement('a');
      link.href = dataUrlToDownload;
      link.download = `easyscreenshot-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
      
      // Add to DOM, click, and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Visual feedback
      downloadBtn.textContent = '✓ Downloaded';
      
      setTimeout(() => {
        downloadBtn.textContent = '💾 Download';
        downloadBtn.disabled = false;
      }, 2000);
      
    } catch (error) {
      showError(`Download failed: ${error.message}`);
      downloadBtn.textContent = '💾 Download';
      downloadBtn.disabled = false;
    }
  });
  
  // --- Copy to clipboard functionality (Updated to use currentDataUrl) ---
  copyBtn.addEventListener('click', async function() {
    try {
      if (!currentDataUrl) {
        throw new Error('No screenshot data available');
      }
      
      let dataUrlToCopy = currentDataUrl;
      
      if (highlights.length > 0) {
        // Show loading state
        copyBtn.textContent = '⏳ Processing...';
        copyBtn.disabled = true;
        
        try {
          dataUrlToCopy = await mergeScreenshotAndHighlights();
        } catch (error) {
          throw new Error(`Failed to merge highlights: ${error.message}`);
        }
      }
      
      await improvedCopy(dataUrlToCopy);
      
    } catch (error) {
      showError(`Copy failed: ${error.message}`);
      copyBtn.textContent = '📋 Copy';
      copyBtn.disabled = false;
    }
  });

  // Add a UI note about clipboard limitations
  const copyNote = document.createElement('div');
  copyNote.style.fontSize = '11px';
  copyNote.style.color = '#fff';
  copyNote.style.opacity = '0.7';
  copyNote.style.marginTop = '4px';
  copyNote.style.maxWidth = '200px';
  copyNote.textContent = 'Note: Chrome may block direct image copying from extension pages. If Copy fails, use Download or Open in New Tab.';
  copyBtn.parentNode.insertBefore(copyNote, copyBtn.nextSibling);

  async function improvedCopy(dataUrl) {
    try {
      // Try to copy as image/png
      const response = await fetch(dataUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image data: ${response.status}`);
      }
      
      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Invalid image data received');
      }
      
      if (window.ClipboardItem && navigator.clipboard) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        copyBtn.textContent = '✓ Copied';
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
          copyBtn.disabled = false;
        }, 2000);
        return;
      }
      throw new Error('ClipboardItem not supported');
    } catch (error) {
      console.error('Image copy failed:', error);
      
      // Fallback: copy data URL as text
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(dataUrl);
          copyBtn.textContent = '✓ Copied as text';
          setTimeout(() => {
            copyBtn.textContent = '📋 Copy';
            copyBtn.disabled = false;
          }, 2000);
          
          // Show user-friendly notification instead of alert
          const notification = document.createElement('div');
          notification.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2196F3;
            color: white;
            padding: 20px;
            border-radius: 8px;
            z-index: 10000;
            font-size: 14px;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          `;
          notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 10px;">Image copied as text</div>
            <div style="font-size: 12px; opacity: 0.9;">
              The image data URL has been copied to your clipboard.<br>
              You can paste it into a browser address bar or image editor.
            </div>
          `;
          document.body.appendChild(notification);
          setTimeout(() => {
            if (notification.parentNode) {
              notification.parentNode.removeChild(notification);
            }
          }, 5000);
        } else {
          throw new Error('Clipboard API not available');
        }
      } catch (err2) {
        console.error('Both image and text copy failed:', error, err2);
        copyBtn.textContent = '✗ Failed';
        showError('Failed to copy to clipboard');
        setTimeout(() => {
          copyBtn.textContent = '📋 Copy';
          copyBtn.disabled = false;
        }, 2000);
        
        // Open in new tab as final fallback
        try {
          window.open(dataUrl, '_blank');
        } catch (err3) {
          showError('All copy methods failed. Please use the download option.');
        }
      }
    }
  }
  
  // --- Close tab functionality (Unchanged) ---
  closeBtn.addEventListener('click', function() {
    try {
      if (highlights.length > 0) {
        const confirmed = confirm(`You have ${highlights.length} highlight(s) that will be lost. Are you sure you want to close?`);
        if (!confirmed) return;
      }
      window.close();
    } catch (error) {
      showError(`Failed to close tab: ${error.message}`);
    }
  });
  
  // --- Enhanced keyboard shortcuts (Unchanged) ---
  document.addEventListener('keydown', function(e) {
    try {
      // Don't trigger shortcuts when typing in input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }
      
      if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 's':
            e.preventDefault();
            if (!downloadBtn.disabled) {
              downloadBtn.click();
            }
            break;
          case 'c':
            e.preventDefault();
            if (!copyBtn.disabled) {
              copyBtn.click();
            }
            break;
          case 'w':
            e.preventDefault();
            closeBtn.click();
            break;
          case 'h':
            e.preventDefault();
            highlightBtn.click();
            break;
        }
      }
      
      if (e.key === 'Escape') {
        if (highlightMode) {
          highlightBtn.click(); // Exit highlight mode first
        } else {
          closeBtn.click();
        }
      }
      
      // Delete key to remove last highlight
      if (e.key === 'Delete' && highlightMode && highlights.length > 0) {
        e.preventDefault();
        highlights.pop();
        renderHighlights();
      }
      
    } catch (error) {
      showError(`Keyboard shortcut error: ${error.message}`);
    }
  });
  
  // --- Add accessibility improvements (Unchanged) ---
  // Set ARIA labels for better screen reader support
  downloadBtn.setAttribute('aria-label', 'Download screenshot');
  copyBtn.setAttribute('aria-label', 'Copy screenshot to clipboard');
  highlightBtn.setAttribute('aria-label', 'Toggle highlight mode');
  closeBtn.setAttribute('aria-label', 'Close preview tab');
  
  // Add keyboard navigation hints
  const keyboardHints = document.createElement('div');
  keyboardHints.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 20px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 10px;
    border-radius: 6px;
    font-size: 11px;
    opacity: 0.8;
    z-index: 1000;
  `;
  keyboardHints.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 5px;">Keyboard Shortcuts:</div>
    <div>Ctrl+S: Download | Ctrl+C: Copy | Ctrl+H: Highlight | Esc: Close</div>
    <div>Delete: Remove last highlight</div>
  `;
  document.body.appendChild(keyboardHints);
  
  // Hide hints after 5 seconds
  setTimeout(() => {
    if (keyboardHints.parentNode) {
      keyboardHints.style.opacity = '0';
      setTimeout(() => {
        if (keyboardHints.parentNode) {
          keyboardHints.parentNode.removeChild(keyboardHints);
        }
      }, 500);
    }
  }, 5000);

  // --- Merge and Cleanup Utilities (Unchanged) ---
  async function mergeScreenshotAndHighlights() {
    try {
      if (!currentDataUrl) {
        throw new Error('No screenshot data available');
      }
      if (highlights.length === 0) {
        return currentDataUrl;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = currentDataUrl;
      });
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        throw new Error('Invalid image dimensions');
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');
      ctx.drawImage(img, 0, 0);
      highlights.forEach((highlight, index) => {
        ctx.save();
        const colors = [
          { fill: 'rgba(255, 215, 0, 0.3)', stroke: 'rgba(255, 215, 0, 0.8)' },
          { fill: 'rgba(255, 99, 132, 0.3)', stroke: 'rgba(255, 99, 132, 0.8)' },
          { fill: 'rgba(54, 162, 235, 0.3)', stroke: 'rgba(54, 162, 235, 0.8)' },
          { fill: 'rgba(255, 206, 86, 0.3)', stroke: 'rgba(255, 206, 86, 0.8)' },
          { fill: 'rgba(75, 192, 192, 0.3)', stroke: 'rgba(75, 192, 192, 0.8)' }
        ];
        const colorIndex = index % colors.length;
        ctx.fillStyle = colors[colorIndex].fill;
        ctx.strokeStyle = colors[colorIndex].stroke;
        ctx.lineWidth = 4;
        ctx.setLineDash([]);
        const x = highlight.x * canvas.width;
        const y = highlight.y * canvas.height;
        const w = highlight.w * canvas.width;
        const h_val = highlight.h * canvas.height;
        ctx.fillRect(x, y, w, h_val);
        ctx.strokeRect(x, y, w, h_val);
        ctx.restore();
      });
      const dataUrl = ctx.canvas.toDataURL('image/png', 1.0);
      img.src = '';
      return dataUrl;
    } catch (error) {
      console.error('Failed to merge screenshot and highlights:', error);
      throw new Error(`Merge failed: ${error.message}`);
    }
  }

  function cleanupMemory() {
    if (renderTimeout) {
      clearTimeout(renderTimeout);
      renderTimeout = null;
    }
    // Do not clear highlights automatically here; only clear canvas
    if (highlightCanvas) {
      const ctx = highlightCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, highlightCanvas.width, highlightCanvas.height);
    }
  }

  window.addEventListener('beforeunload', cleanupMemory);
  
  // Start loading data when the page loads
  loadScreenshotData();
});
