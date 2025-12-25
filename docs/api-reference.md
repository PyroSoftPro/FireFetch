# API Reference

FireFetch starts an embedded Express server on **`http://localhost:3000`** by default, but will **auto-increment to the next available port** (3001, 3002, …) if 3000 is already taken (see `app.js`).

## Base URL

- **Web UI**: `http://localhost:3000/` (or `http://localhost:3001/`, etc.)
- **API**: `http://localhost:3000/api/*` (or `http://localhost:3001/api/*`, etc.)

## App Authentication

There is **no app-level login/auth**. Some sites require cookies to download/stream restricted content; that is handled via the cookie upload endpoints.

## Core Download Flow

1. `POST /api/video-info` (optional, for format list + metadata)
2. `POST /api/resolve-url` (optional, to classify file vs video vs torrent/magnet)
3. `POST /api/download` (adds a job into the queue)
4. UI listens to `GET /api/download-stream` (SSE) for updates

## Endpoints (current)

### Video / URL analysis

- `POST /api/video-info` → yt-dlp `-J` metadata + formats (or “direct file” response wrapper)
- `POST /api/resolve-url` → resolves redirects and chooses method/type (`yt-dlp` vs `aria2c`, `video` vs `file`, etc.)
- `POST /api/stream-url` → returns a direct stream URL (720p-capped) for playback in `search.html`
- `GET /api/video-metadata/:filename` → returns `<basename>.info.json` if present

### Queue + downloads

- `POST /api/download` → adds a download job to the queue
- `GET /api/download-stream` → **Server-Sent Events** stream:
  - `data: {"type":"state","data":{...queueState...}}`
  - `data: {"type":"update","data":{...queueState...}}`
- `GET /api/queue` → queueState JSON snapshot
- `POST /api/queue/pause` / `POST /api/queue/resume`
- `POST /api/queue/reorder` → `{ fromIndex, toIndex }`
- `DELETE /api/download/:id` → cancel
- `POST /api/download/:id/retry`
- `DELETE /api/download/:id/remove` → remove from list
- `POST /api/downloads/clear-completed`
- `POST /api/downloads/retry-failed`

### Library / file management

- `GET /api/videos` → returns an array describing downloaded **videos and “file/torrent” items** in the download directory (based on extension + directories)
- `DELETE /api/delete-video/:filename` → deletes file and companion metadata if present
- `POST /api/open-file` → `{ filename }` open via OS
- `POST /api/open-downloads-folder` → open download dir via OS

### Settings / cookies

- `GET /api/settings`
- `POST /api/settings`
- `POST /api/reset-settings`
- `POST /api/select-directory` (Windows folder picker via PowerShell)
- `POST /api/upload-cookies` (multipart `cookieFile`)
- `POST /api/clear-cookies`
- `GET /api/cookie-status`

### Dependency manager

- `GET /api/versions` → current `yt-dlp` + `aria2c` versions
- `GET /api/dependencies/status` → current install/version info for managed tools
- `GET /api/dependencies/latest` → latest versions from upstream
- `POST /api/dependencies/update` → `{ dependency: "aria2c" | "ffmpeg" | "yt-dlp" }`
- `POST /api/dependencies/delete-backups` → removes `.bk` backups in `dep/`

### Static routes

- `GET /` → redirects to `index.html`
- `GET /videos/*` → serves from `settings.downloadDir`
- `GET /downloads/*` → serves from `settings.downloadDir` (used by `files.html`)
- `GET /*` → serves `public/` static assets