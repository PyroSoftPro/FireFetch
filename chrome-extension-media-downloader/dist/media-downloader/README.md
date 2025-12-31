# FireFetch - Page Media Detector (Chrome Extension)

This is a **Manifest V3** Chrome extension branded as a small **FireFetch companion** that:

- Scans the current page for **videos/audio sources** (`<video>`, `<audio>`, `<source>`)
- Finds **direct file links** (`<a href>` with common file/media extensions)
- Lists detected items in the popup
- Lets you **send the page / detected items to FireFetch** to queue downloads in the app

## Load in Chrome (Developer Mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the folder: `chrome-extension-media-downloader`

Open any page with media/files, click the extension icon, and it will auto-scan.

## In-page popup (top-right)

If you enable **“Popup on media detected”** in the extension popup, the extension will show a small **in-page toast** in the top-right any time media/files are detected on a page load/navigation. From there you can quickly **Send page** or **Send detected** to FireFetch.

## YouTube button

On YouTube watch/shorts pages, the extension injects a **“🔥 FireFetch”** button next to the player action buttons (Like/Share/etc). Clicking it sends the current page to FireFetch.

## Build (zip)

### Windows (PowerShell)

From the repo root:

```powershell
pwsh -File .\chrome-extension-media-downloader\build.ps1
```

This creates `chrome-extension-media-downloader/dist/media-downloader.zip`.

### macOS/Linux

```bash
bash ./chrome-extension-media-downloader/build.sh
```

## Notes / Limitations

- `blob:` and `data:` URLs are marked as **stream-like**; the extension will send the **page URL** to FireFetch so FireFetch can extract properly.
- Some sites use **streaming** (HLS/DASH). You may see many segment URLs (or none). Those often need a dedicated downloader pipeline.
- The extension icon is an **SVG fire emoji** (`icons/fire.svg`). If you later publish to the Chrome Web Store, you may want to replace it with PNGs (16/32/48/128) for maximum compatibility.


