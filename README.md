# Creating the README.md file content for EasyScreenshot Chrome Extension

readme_content = """
# 🖼️ EasyScreenshot - Chrome Extension

A powerful Chrome extension that allows users to capture screenshots of web pages with advanced features and preview capabilities.

---

## 🚀 Features

### 🎯 Two Capture Modes
- **👁️ Capture Visible Area**: Captures only the currently visible portion of the web page.  
- **📄 Capture Entire Page**: Captures the full scrollable content of the web page, not just the visible part.

### 🔗 URL Integration
- Optionally include the page URL at the top of the screenshot.
- Clean formatting with a visual separator.
- Toggle the option on/off from the popup.

### 👁️ Preview in New Tab
- All screenshots open in a dedicated preview tab after capture.
- Professional interface with **download** and **copy** buttons.
- **Keyboard shortcuts**:  
  - `Ctrl+S` (or `Cmd+S` on Mac): Download screenshot  
  - `Ctrl+C` (or `Cmd+C` on Mac): Copy to clipboard  
  - `Ctrl+W` / `Esc`: Close preview tab

### 💾 Save Options
- Download the screenshot directly.
- Copy the image to the clipboard.
- Automatically generated filenames with timestamps.

---

## ⚙️ Installation

1. Download or clone this repository.
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable **Developer mode** (top-right).
4. Click **"Load unpacked"** and select the extension folder.
5. The EasyScreenshot icon will appear in your Chrome toolbar.

---

## 📸 Usage

1. Click the EasyScreenshot icon in your browser toolbar.
2. Choose your capture mode:
   - 👁️ Visible Area
   - 📄 Entire Page
3. Optionally enable **Include URL**.
4. Screenshot will open in a new preview tab.

---

## 🔍 Preview Tab Features

- 💾 **Download** the image
- 📋 **Copy** to clipboard
- ✕ **Close** preview tab
- Keyboard Shortcuts supported

---

## 🛠️ Technical Details

### File Structure

- `manifest.json` – Extension configuration (Manifest V3)
- `popup.html` – Extension popup UI
- `popup.js` – Popup interaction logic
- `content.js` – Full page scroll & capture
- `background.js` – Message passing and capture initiation
- `screenshot_preview.html` – Screenshot preview page
- `screenshot_preview.js` – Preview logic
- `images/` – Icons and graphics
- `README.md` – This documentation

### Permissions Required

- `activeTab` – To capture the current tab
- `scripting` – To inject scroll logic for full-page capture
- `storage` – To remember URL toggle preference
- `downloads` – To allow saving files
- `<all_urls>` – To allow screenshots on any page

### Browser Compatibility

- ✅ Chrome 88+
- ✅ Chromium-based browsers (Edge, Brave, Opera)
- 🔧 Requires **Manifest V3** support

---

## 🧠 How It Works

### Capture Visible Area
Uses Chrome’s `captureVisibleTab` API to get a screenshot of the visible viewport. Adds the URL header if enabled.

### Capture Entire Page
Injects a script to scroll from bottom to top, capturing segments. Each image is stitched into a full-page composite using the Canvas API.

### Preview Tab
Opens in a new tab:
- Shows screenshot
- Adds metadata (URL, timestamp)
- Offers buttons to download or copy
- Supports keyboard shortcuts for power users

---

## 🧪 Troubleshooting

### Common Issues

- **Blank screenshots**: Wait for the page to load before capturing.
- **Incomplete full-page capture**: Dynamic content might not load in time.
- **Clipboard copy fails**: Check that you're using Chrome 88+ and not blocking clipboard access.

### Performance Notes

- Full-page captures may take longer on long or media-heavy sites.
- Large captures can use significant memory.

---

## 🔐 Privacy Policy (Datenschutzerklärung)

### 📌 Summary

This extension respects your privacy. It does **not collect, transmit, or store any personal data**.

### 📥 Data Collection

- No personal data is collected.
- No user activity is tracked.
- No analytics or third-party APIs are used.
- All screenshots are processed locally in your browser.

### 🔒 Permissions Use

All requested permissions are **strictly necessary**:
- `activeTab` – for capturing the page
- `scripting` – for scrolling in full-page capture
- `downloads` – to save screenshots locally
- `storage` – to store your settings (e.g., "Include URL")
- `<all_urls>` – to enable functionality across websites

We do not access or transmit your browsing data.

### 👨‍💻 Developer

This extension was created by **Mohamed Youssef**  
📧 Contact: `bada.moyo9890@gmail.com`

---

## 📎 License

MIT License — free to use, modify, and distribute.
"""

