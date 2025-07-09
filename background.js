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
    chrome.tabs.create({ url: 'screenshot_preview.html' }, (newTab) => {
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
        if (tabId === newTab.id && changeInfo.status === 'complete') {
          chrome.tabs.sendMessage(newTab.id, { action: 'displayScreenshot', dataUrl: message.dataUrl, url: message.url, includeUrl: message.includeUrl });
          chrome.tabs.onUpdated.removeListener(listener);
        }
      });
    });
  }
});

