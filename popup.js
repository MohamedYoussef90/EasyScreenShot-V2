document.addEventListener('DOMContentLoaded', function() {
  const visibleAreaBtn = document.getElementById('visibleAreaBtn');
  const entirePageBtn = document.getElementById('entirePageBtn');
  const urlToggle = document.getElementById('urlToggle');
  const status = document.getElementById('status');
  
  let includeUrl = true;
  
  // Enhanced error handling utility
  const showError = (message) => {
    console.error('EasyScreenshot Popup Error:', message);
    status.textContent = `Error: ${message}`;
    status.style.color = '#ff4444';
    setTimeout(() => {
      status.textContent = 'Ready to capture';
      status.style.color = '';
    }, 3000);
  };
  
  const showSuccess = (message) => {
    status.textContent = message;
    status.style.color = '#4CAF50';
    setTimeout(() => {
      status.textContent = 'Ready to capture';
      status.style.color = '';
    }, 2000);
  };
  
  // Toggle URL inclusion
  urlToggle.addEventListener('click', function() {
    includeUrl = !includeUrl;
    urlToggle.classList.toggle('active', includeUrl);
    updateStatus(`URL ${includeUrl ? 'included' : 'excluded'}`);
    setTimeout(() => updateStatus('Ready to capture'), 1500);
  });
  
  // Capture visible area with enhanced error handling
  visibleAreaBtn.addEventListener('click', function() {
    try {
      updateStatus('Capturing visible area...');
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        try {
          if (!tabs || tabs.length === 0) {
            throw new Error('No active tab found');
          }
          
          const currentTab = tabs[0];
          if (!currentTab.url) {
            throw new Error('Tab URL not available');
          }
          
          // Send message to background script to initiate capture
          // The background script will handle the capture and call showScreenshot
          chrome.runtime.sendMessage({
            action: 'captureVisibleArea',
            url: currentTab.url,
            includeUrl: includeUrl
          }, function(response) {
            try {
              console.log('Popup received response from background (Visible Area):', response);
              if (chrome.runtime.lastError) {
                throw new Error(chrome.runtime.lastError.message);
              }
              
              if (response && response.error) {
                throw new Error(response.error);
              }
              
              // The background script now handles the full process (capture -> showScreenshot)
              // The popup just needs to wait for the background to finish.
              setTimeout(() => window.close(), 1000);
              
            } catch (error) {
              showError(`Capture failed: ${error.message}`);
            }
          });
        } catch (error) {
          showError(`Tab query failed: ${error.message}`);
        }
      });
    } catch (error) {
      showError(`Button click failed: ${error.message}`);
    }
  });
  
  // Capture entire page with enhanced error handling
  entirePageBtn.addEventListener('click', function() {
    try {
      updateStatus('Capturing entire page...');
      
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        try {
          if (!tabs || tabs.length === 0) {
            throw new Error('No active tab found');
          }
          
          const currentTab = tabs[0];
          if (!currentTab.url) {
            throw new Error('Tab URL not available');
          }
          
          chrome.runtime.sendMessage({
            action: 'captureEntirePage',
            url: currentTab.url,
            includeUrl: includeUrl
          }, function(response) {
            try {
              console.log('Popup received response from background (Entire Page):', response);
              if (chrome.runtime.lastError) {
                throw new Error(chrome.runtime.lastError.message);
              }
              
              if (response && response.error) {
                throw new Error(response.error);
              }
              
              setTimeout(() => window.close(), 1000);
            } catch (error) {
              showError(`Full page capture failed: ${error.message}`);
            }
          });
        } catch (error) {
          showError(`Tab query failed: ${error.message}`);
        }
      });
    } catch (error) {
      showError(`Button click failed: ${error.message}`);
    }
  });
  
  // Removed the local processAndShowScreenshot function as it's now handled by the background script
  
  function updateStatus(message) {
    status.textContent = message;
  }
});
