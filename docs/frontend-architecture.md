# Frontend Architecture

The FireFetch UI is a set of static HTML pages in `public/` served by the embedded Express server. Each page has a page-specific JS file and uses `public/js/global-components.js` for the shared header/footer.

## Pages

- **Home** (`index.html` + `script.js`)
  - Paste URL → `POST /api/video-info`
  - For torrents/magnets it jumps straight to `POST /api/download`
  - For videos/files it sends the user to `downloads.html` to monitor the queue

- **Queue** (`downloads.html` + `downloads.js`)
  - Opens an SSE connection to `GET /api/download-stream`
  - Shows `queue`, `active`, and `completed` with filtering/reordering/cancel/retry

- **Search** (`search.html` + `search.js`)
  - YouTube search via `POST /api/search` (yt-dlp `ytsearch`)
  - Stream via `POST /api/stream-url`
  - Download via `POST /api/download`

- **Videos** (`browse.html` + `browse.js`)
  - Lists downloaded videos via `GET /api/videos` (filters `fileType === "video"`)
  - Plays via `/videos/<filename>` static route
  - Reads full metadata via `GET /api/video-metadata/:filename`

- **Files** (`files.html` + `files.js`)
  - Uses `GET /api/videos` but filters for non-video outputs (archives/torrents/direct files)
  - Opens files via `POST /api/open-file` and opens the folder via `POST /api/open-downloads-folder`

- **Settings** (`config.html` + `config.js`)
  - Persists settings to both localStorage (`firefetch-settings`) and server (`POST /api/settings`)
  - Cookie upload for restricted sites (`/api/upload-cookies`, `/api/cookie-status`, `/api/clear-cookies`)
  - Dependency manager UI (checks/updates tools via `/api/dependencies/*`)

- **Help** (`help.html`) and **About** (`about.html`)
  - About is opened as a separate Electron window from the menu.

## Shared UI

- **Global header/footer**: `public/js/global-components.js`
  - Injects navigation + active link styling.
- **Status bar**: `public/status-bar.js`
  - Lightweight UI element used on multiple pages.
- **Styles**: `public/styles.css`

## Real-time updates (Queue)

Queue updates are delivered via **Server-Sent Events** at `GET /api/download-stream`:

- Initial event: `{"type":"state","data":{...}}`
- Updates: `{"type":"update","data":{...}}`

The UI does not “stream progress” from `POST /api/download`; it streams from **the SSE endpoint**.