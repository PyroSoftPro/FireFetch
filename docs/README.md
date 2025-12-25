# FireFetch Developer Documentation

This folder documents the **current** behavior of FireFetch based on the code in this repository (not on assumptions).

## Documentation Structure

- **[API Reference](./api-reference.md)**: Express endpoints (port, routes, request/response)
- **[Frontend Architecture](./frontend-architecture.md)**: Pages, shared UI components, and how they talk to the API
- **[Build & Deployment](./build-deployment.md)**: How Electron Builder + the batch scripts package the app
- **[External Dependencies](./external-dependencies.md)**: How `yt-dlp`, `aria2c`, `ffmpeg`, and torrent handling are wired
- **[Troubleshooting](./troubleshooting.md)**: Common runtime/build issues and fixes

## Quick Start (Dev)

- Install: `npm install`
- Run: `npm start` (starts the embedded Express server and launches Electron)

## Key Runtime Facts (from code)

- **Server**: Express on **`http://localhost:3000`** by default (auto-increments to 3001, 3002, … if 3000 is taken)
- **Frontend**: static files served from `public/`
- **State**:
  - `settings.json` (persisted settings)
  - `downloads-state.json` (download queue + history persistence)
- **Directories**:
  - `downloads/` (download output; configurable)
  - `cookies/` (uploaded `cookies.txt` for site authentication)
  - `dep/` (external executables; shipped alongside the app)
- **Authentication**: **No app-level login/auth gating**. Cookie upload is only for sites that require login.

## UI Pages (served from `public/`)

- `index.html`: paste URL → fetch info → start download (routes you to queue)
- `downloads.html`: download queue UI (uses SSE stream)
- `search.html`: YouTube search (yt-dlp search) + download/stream
- `browse.html`: browse/play downloaded videos
- `files.html`: browse non-video downloads (torrents/direct files/etc)
- `config.html`: settings, cookie upload, dependency manager
- `help.html`: usage guide
- `about.html`: about dialog (opened from the Electron menu)