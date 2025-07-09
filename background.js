chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'captureVisibleArea') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl, url: message.url, includeUrl: message.includeUrl });
    });
    return true; // Indicates that sendResponse will be called asynchronously
  } else if (message.action === 'captureEntirePage') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        files: ['content.js']
      }, () => {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'scrollAndCapture', url: message.url, includeUrl: message.includeUrl });
      });
    });
    return true;
  } else if (message.action === 'captureVisibleAreaForFullPage') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl: dataUrl });
    });
    return true;
  } else if (message.action === 'showScreenshot') {
    chrome.windows.create({
      url: 'screenshot_preview.html',
      type: 'popup',
      width: 900,
      height: 700
    }, (newWindow) => {
      // Wait for the tab to finish loading, then send the screenshot data
      const previewTabId = newWindow.tabs[0].id;
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === previewTabId && changeInfo.status === 'complete') {
          chrome.tabs.sendMessage(previewTabId, {
            action: 'displayScreenshot',
            dataUrl: message.dataUrl,
            url: message.url,
            includeUrl: message.includeUrl
          });
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
    });
  }
});

