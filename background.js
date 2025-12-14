// Helper function to handle errors and send a response
const handleError = (error, sendResponse) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error('Background Script Error:', errorMessage, chrome.runtime.lastError);
  if (sendResponse) {
    sendResponse({ error: errorMessage });
  }
};

// Helper function to open the screenshot preview window
const showScreenshot = (dataUrl, url, includeUrl, urlAlreadyIncluded = false) => {
  if (!dataUrl) {
    console.error('No screenshot data provided for preview');
    return;
  }

  // Use a unique ID to store the data temporarily for the new window to retrieve
  const screenshotId = Date.now().toString();
  chrome.storage.local.set({ [screenshotId]: { dataUrl, url, includeUrl, urlAlreadyIncluded } }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error storing screenshot data:', chrome.runtime.lastError);
      return;
    }

    // Open the preview window, passing the ID in the URL hash
    chrome.windows.create({
      url: `screenshot_preview.html#id=${screenshotId}`,
      type: 'popup',
      width: 900,
      height: 700
    }, (newWindow) => {
      if (chrome.runtime.lastError) {
        console.error('Failed to create preview window:', chrome.runtime.lastError);
      }
    });
  });
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    if (message.action === 'captureVisibleArea') {
      // 1. Capture the visible area
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, async (dataUrl) => {
        try {
          if (chrome.runtime.lastError) {
            handleError('Capture visible tab failed: ' + chrome.runtime.lastError.message, sendResponse);
            return;
          }
          
          if (!dataUrl) {
            handleError('No screenshot data captured', sendResponse);
            return;
          }
          
          // 2. Open the preview window
          showScreenshot(dataUrl, message.url, message.includeUrl);
          
          // 3. Respond to the popup to close it
          sendResponse({ success: true });
        } catch (error) {
          handleError(error, sendResponse);
        }
      });
      return true; // Indicates that sendResponse will be called asynchronously
      
    } else if (message.action === 'captureEntirePage') {
      // Full page capture is handled by injecting a content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        try {
          if (chrome.runtime.lastError) {
            handleError('Tab query failed: ' + chrome.runtime.lastError.message, sendResponse);
            return;
          }
          
          if (!tabs || tabs.length === 0) {
            handleError('No active tab found', sendResponse);
            return;
          }
          
          const tabId = tabs[0].id;
          
          // Inject the content script using the modern chrome.scripting API
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }, (injectionResults) => {
            try {
              if (chrome.runtime.lastError) {
                handleError('Script injection failed: ' + chrome.runtime.lastError.message, sendResponse);
                return;
              }
              
              // Send message to content script to start the scroll and capture process
              chrome.tabs.sendMessage(tabId, { 
                action: 'scrollAndCapture', 
                url: message.url, 
                includeUrl: message.includeUrl 
              }, (response) => {
                // The content script will handle the full page capture and call 'showScreenshot'
                if (chrome.runtime.lastError) {
                  // This error is likely due to the content script not responding (e.g., on a restricted page)
                  // The content script should ideally handle its own errors and send a message back.
                  console.warn('Message to content script failed (may be expected on restricted pages):', chrome.runtime.lastError.message);
                }
                // Respond to the popup to close it
                sendResponse({ success: true });
              });
            } catch (error) {
              handleError(error, sendResponse);
            }
          });
        } catch (error) {
          handleError(error, sendResponse);
        }
      });
      return true;
      
    } else if (message.action === 'captureVisibleAreaForFullPage') {
      // This is called by the content script during full-page capture
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        try {
          if (chrome.runtime.lastError) {
            // Explicitly report the error back to the content script
            const error = chrome.runtime.lastError.message;
            console.error('Capture for full page failed:', error);
            sendResponse({ error: error });
            return;
          }
          sendResponse({ dataUrl: dataUrl });
        } catch (error) {
          handleError(error, sendResponse);
        }
      });
      return true;
      
    } else if (message.action === 'showScreenshot') {
      // This is called by the content script after full-page stitching is complete
      if (!message.dataUrl) {
        console.error('showScreenshot called with no dataUrl');
        sendResponse({ error: 'No screenshot data provided' });
        return true;
      }
      showScreenshot(message.dataUrl, message.url, message.includeUrl, message.urlAlreadyIncluded || false);
      sendResponse({ success: true }); // Acknowledge the message
      return true;
    }
  } catch (error) {
    // Top-level error handler - log but don't send response as we may not have sendResponse
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Background Script Top-Level Error:', errorMessage, chrome.runtime.lastError);
  }
});
