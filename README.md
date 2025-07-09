# EasyScreenshot - Chrome Extension

A powerful Chrome extension that allows users to capture screenshots of web pages with advanced features and preview capabilities.

## Features

### 🎯 Two Capture Modes
- **Capture Visible Area**: Captures only the currently visible portion of the web page
- **Capture Entire Page**: Captures the full scrollable content of the web page, not just the visible part

### 🔗 URL Integration
- Optional URL inclusion at the top of screenshots
- Toggle on/off via the extension popup
- Clean formatting with separator line

### 👁️ Preview in New Tab
- All screenshots are previewed in a new tab after capture
- Professional preview interface with download and copy options
- Keyboard shortcuts for quick actions (Ctrl+S to save, Ctrl+C to copy, Esc to close)

### 💾 Save Options
- Download screenshots directly from the preview
- Copy screenshots to clipboard
- Automatic filename generation with timestamps

## Installation

1. Download or clone this extension folder
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension folder
5. The EasyScreenshot icon will appear in your Chrome toolbar

## Usage

### Basic Usage
1. Click the EasyScreenshot icon in the Chrome toolbar
2. Choose your capture mode:
   - **👁️ Capture Visible Area**: Takes a screenshot of the currently visible area
   - **📄 Capture Entire Page**: Captures the full page including scrolled content
3. Toggle "Include URL" to add/remove the webpage URL from the screenshot
4. Screenshot will automatically open in a new tab for preview

### Preview Tab Features
- **💾 Download**: Save the screenshot to your computer
- **📋 Copy**: Copy the screenshot to your clipboard
- **✕ Close**: Close the preview tab

### Keyboard Shortcuts (in preview tab)
- `Ctrl+S` (or `Cmd+S` on Mac): Download screenshot
- `Ctrl+C` (or `Cmd+C` on Mac): Copy to clipboard
- `Ctrl+W` (or `Cmd+W` on Mac): Close tab
- `Esc`: Close tab

## Technical Details

### Files Structure
- `manifest.json` - Extension configuration (Manifest V3)
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality and screenshot processing
- `content.js` - Content script for full page capture
- `background.js` - Background service worker for message handling
- `screenshot_preview.html` - Preview page interface
- `screenshot_preview.js` - Preview page functionality
- `images/` - Extension icons
- `README.md` - This documentation

### Permissions Required
- `activeTab` - Access to the current tab for screenshots
- `scripting` - Inject content scripts for full page capture
- `storage` - Store user preferences
- `downloads` - Download captured screenshots
- `<all_urls>` - Access to all websites for screenshot functionality

### Browser Compatibility
- Chrome 88+
- Chromium-based browsers (Edge, Brave, etc.)
- Requires Manifest V3 support

## How It Works

### Visible Area Capture
1. Uses Chrome's `captureVisibleTab` API
2. Processes the image to optionally add URL header
3. Opens preview in new tab

### Entire Page Capture
1. Injects content script into the current page
2. Scrolls through the entire page systematically
3. Captures multiple screenshots and stitches them together
4. Creates a composite image of the full page
5. Opens preview in new tab

### Preview System
1. Opens a dedicated preview tab with professional interface
2. Displays the screenshot with metadata (URL, timestamp)
3. Provides download and clipboard copy functionality
4. Supports keyboard shortcuts for power users

## Development

The extension is built using:
- Manifest V3 for modern Chrome extension standards
- Canvas API for image processing and composition
- Async/await patterns for better performance
- Modern CSS with backdrop filters and animations
- Responsive design principles

## Troubleshooting

### Common Issues
- **Screenshots appear blank**: Ensure the page has finished loading before capturing
- **Full page capture incomplete**: Some dynamic content may not be captured if it loads after scrolling
- **Copy to clipboard fails**: Ensure you're using a modern browser with clipboard API support

### Performance Notes
- Full page capture may take longer on very long pages
- Large images may consume significant memory during processing
- Preview tab automatically handles image optimization

