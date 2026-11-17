const friendlyCaptureError = (error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/cannot access|not allowed|restricted|chrome:\/\/|web store|extensions gallery|cannot be scripted|cannot be captured|permission/i.test(message)) {
    return 'Chrome does not allow screenshots of this page. Open a regular website and try again.';
  }
  return message;
};

const handleError = (error, sendResponse) => {
  const errorMessage = friendlyCaptureError(error);
  console.error('Background Script Error:', errorMessage);
  sendResponse({ error: errorMessage });
};

const setCaptureBadge = (tabId, text, callback) => {
  chrome.action.setBadgeText({ text, tabId }, () => {
    if (chrome.runtime.lastError) {
      const error = chrome.runtime.lastError.message;
      console.error('Could not update capture progress badge:', error);
      if (callback) callback(error);
      return;
    }
    if (callback) callback();
  });
};

const clearCaptureBadge = (tabId, callback) => {
  setCaptureBadge(tabId, '', callback);
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
            handleError(chrome.runtime.lastError.message, sendResponse);
            return;
          }
          
          if (!dataUrl) {
            handleError('No screenshot data captured.', sendResponse);
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
        let tabId;
        const failCapture = (error) => {
          if (typeof tabId === 'number') {
            clearCaptureBadge(tabId, () => handleError(error, sendResponse));
          } else {
            handleError(error, sendResponse);
          }
        };

        try {
          if (chrome.runtime.lastError) {
            failCapture('Tab query failed: ' + chrome.runtime.lastError.message);
            return;
          }
          
          if (!tabs || tabs.length === 0) {
            failCapture('No active tab found');
            return;
          }
          
          tabId = tabs[0].id;
          if (typeof tabId !== 'number') {
            failCapture('The active tab is unavailable for capture.');
            return;
          }

          chrome.action.setBadgeBackgroundColor({ color: '#1a73e8', tabId }, () => {
            if (chrome.runtime.lastError) {
              console.error('Could not set capture badge color:', chrome.runtime.lastError.message);
            }
          });
          setCaptureBadge(tabId, '...');
          
          // Inject the content script using the modern chrome.scripting API
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }, (injectionResults) => {
            try {
              if (chrome.runtime.lastError) {
                failCapture(chrome.runtime.lastError.message);
                return;
              }
              
              // Send message to content script to start the scroll and capture process
              chrome.tabs.sendMessage(tabId, { 
                action: 'scrollAndCapture', 
                url: message.url, 
                includeUrl: message.includeUrl 
              }, (response) => {
                if (chrome.runtime.lastError) {
                  failCapture(chrome.runtime.lastError.message);
                  return;
                }

                if (!response || response.error) {
                  failCapture(response && response.error ? response.error : 'The page did not return a screenshot.');
                  return;
                }
                clearCaptureBadge(tabId, () => sendResponse({ success: true }));
              });
            } catch (error) {
              failCapture(error);
            }
          });
        } catch (error) {
          failCapture(error);
        }
      });
      return true;
      
    } else if (message.action === 'fullPageCaptureProgress') {
      if (!sender.tab || typeof sender.tab.id !== 'number' || typeof message.text !== 'string') {
        sendResponse({ error: 'Invalid full-page capture progress update.' });
        return;
      }

      setCaptureBadge(sender.tab.id, message.text, (error) => {
        sendResponse(error
          ? { error: 'Could not update the capture progress badge.' }
          : { success: true });
      });
      return true;

    } else if (message.action === 'captureVisibleAreaForFullPage') {
      // This is called by the content script during full-page capture
      chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
        try {
          if (chrome.runtime.lastError) {
            sendResponse({ error: friendlyCaptureError(chrome.runtime.lastError.message) });
            return;
          }
          if (!dataUrl) {
            sendResponse({ error: 'Chrome did not return screenshot data for this page segment.' });
            return;
          }
          sendResponse({ dataUrl });
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
    handleError(error, sendResponse);
  }
});
