# FireFetch — Functionality & UI Inventory

This document enumerates **current functionality** and **all user-facing UI items** in FireFetch, based on the code in this repository.

## App overview (what FireFetch does)

- **Download videos from many sites**: Uses `yt-dlp` for site extraction and (when needed) format merging.
- **Download direct files**: Uses the unified download queue (often powered by `aria2c`) for non-video direct URLs.
- **Torrent / magnet downloads**: Added to the same queue system; the UI surfaces torrent-specific stats (peers/ratio/upload).
- **Queue + persistence**: Downloads are queued, executed with concurrency limits, retried, and persisted across restarts.
- **Local library views**:
  - **Videos** page: lists downloaded video files and plays them.
  - **Files** page: lists downloaded non-video items (torrents/archives/executables/etc.) and opens them via OS.
- **Settings**: download location, quality defaults, output format, queue behavior, performance knobs, autoplay.
- **Cookies upload**: upload/clear cookies for sites that require authentication.
- **Dependency manager**: check/update bundled tools (`yt-dlp`, `aria2c`, `ffmpeg`) and clean up `.bk` backups.
- **Version checks**:
  - App version badge in the header (from `/api/app-version`)
  - Home-only “update available” banner in the footer (from `/api/version-manifest`)

## Runtime storage & bundled tools

- **Settings**: `settings.json` (persisted on disk)
- **Download queue state**: `downloads-state.json` (persisted on disk)
- **Default download directory**: `downloads/` (configurable)
- **Cookies**: stored under `cookies/` when uploaded
- **Bundled executables**: `dep/` contains `yt-dlp.exe`, `aria2c.exe`, `ffmpeg.exe`, etc.

## Download types & behaviors

- **Video downloads**
  - **Info/format listing**: Home and Search fetch metadata via `POST /api/video-info`.
  - **Format selection**: UI offers “best” plus grouped formats (pre-merged A/V, video-only, audio-only, other).
  - **Output format**: merged container comes from Settings (MP4/MKV/WebM).
  - **Metadata file**: optional `.info.json` written when “Save Metadata” is enabled (used by Videos/Files metadata views).

- **Direct file downloads**
  - May be surfaced as a “file-style” `video-info` response (a single pseudo-format with `resolution: "file"`).
  - On Home, the “file” UI path redirects to Queue with parameters; Queue resolves the URL before enqueuing.
  - There is also a backend endpoint `POST /api/file-download` (used by older/alternate flows) that enqueues with `format: "file"`.

- **Torrent / magnet downloads**
  - Home detects:
    - **magnet links** (`magnet:` prefix)
    - **torrent URLs** (string ends with `.torrent`)
  - These are enqueued immediately via `POST /api/download` (with `format: "magnet"` or `format: "torrent"`).
  - Queue UI surfaces torrent-specific fields when present: **peers**, **upload speed**, **ratio**.

## Queue system (statuses, controls, persistence)

### States shown in UI

- **Queued**: waiting for an available slot (or waiting due to queue paused).
- **Starting…**: initializing (for torrents can include “finding peers / metadata” messaging).
- **Downloading**: active download with percent, speed, ETA, size (when available).
- **Processing…**: post-download processing (e.g., merging/remux).
- **Retrying**: countdown until retry.
- **Completed / Failed / Cancelled**: terminal states; can be removed from list.

### Queue behaviors

- **Max concurrent downloads**: controlled by Settings.
- **Pause/Resume queue**: stops/starts processing queued items (does not necessarily stop already-active items).
- **Retry logic**: failed items can be retried per Settings (attempt count + delay).
- **Persistence**: queue/active/completed states are saved and reloaded on app restart.

## Shared UI (present across pages)

### Global header (`public/js/global-components.js`)

- **Brand**: “FireFetch” + flame icon.
- **Navigation links**:
  - Home (`index.html`)
  - Search (`search.html`)
  - Queue (`downloads.html`)
  - Videos (`browse.html`)
  - Files (`files.html`)
  - Settings (`config.html`)
- **App version badge**: `vX.Y.Z` loaded from `GET /api/app-version`.
- **Active link highlight**: current page gets `.active`.

### Global footer

- **Copyright**
- **Home-only version banner slot**:
  - Queries `GET /api/version-manifest` and compares to `GET /api/app-version`.
  - If out-of-date, shows an **Update** link.
  - If manifest fetch fails, shows an error string in the footer slot.

### Discord link (floating mascot)

On most pages there is a fixed “Axl” mascot image bottom-right with hover speech-bubble and a link to Discord.

### Status bar (`public/status-bar.js`)

- Connects to `GET /api/download-stream` (SSE) and can display:
  - **Active / queued / completed**
  - **Total download speed**
  - **Total upload speed** (shown only if > 0)
- **Note**: In current CSS, `.status-bar` is forced hidden (`display: none !important;`), so it’s effectively disabled visually.

## Page-by-page UI inventory

### Home — `public/index.html` + `public/script.js`

- **URL input** (`#urlInput`)
  - Placeholder: “Enter video URL, magnet link, or torrent file URL…”
  - Special case: entering `drm` triggers a DRM error message (debug/easter-egg).
- **Fetch button** (`#fetchBtn`)
  - Calls `fetchVideoInfo()`.
- **Loading panel** (`#loading`)
  - Spinner + “Fetching video information…”.

#### Video info panel (`#videoInfo`)

- **Thumbnail** (`#thumbnail`)
- **Title** (`#title`)
- **Uploader** (`#uploader`)
- **Duration** (`#duration`)
- **Site** (`#site`)
- **Description** (`#description`) (truncated)

#### Quality selection

- **Quality dropdown** (`#qualitySelect`)
  - Contains:
    - `best` (auto highest)
    - optgroups:
      - Pre-merged (Video + Audio) — limited quality
      - High Quality Video (will merge with best audio)
      - Audio Only
      - Other Formats
- **Download button** (`#downloadBtn`)
  - Redirects to `downloads.html?url=...&format=...`.

#### File info panel (`#fileInfo`) (for direct-file style responses)

- **File icon** (emoji in `.file-icon`, chosen from extension)
- **File name** (`#fileName`)
- **File type** (`#fileType`)
- **Size** (`#fileSize`)
- **Source** (`#fileSource`)
- **Description** (`#fileDescription`)
- **Download File button** (`#fileDownloadBtn`)
  - Redirects to `downloads.html?url=...&format=<format_id>&title=...`.

#### Torrent/magnet behavior

- If URL starts with `magnet:` or ends with `.torrent`, Home bypasses “video info” and enqueues directly via `POST /api/download`.

#### Error UI

- **General error panel**: created dynamically (`#errorMessage`) with quote + `fetch.gif`.
- **DRM error panel**: created dynamically (`#drmErrorMessage`) with `bitches.gif`.
- **Download error toast**: fixed-position panel (`#downloadErrorMessage`) with close button.

---

### Queue — `public/downloads.html` + `public/downloads.js`

- **Title**: “Downloads”
- **Status filter** (`#statusFilter`)
  - All / Queued / Active / Completed / Failed / Cancelled
- **Sort dropdown** (`#sortBy`)
  - Date / Status / Title / Type

#### Dynamic queue controls (injected above the `<h2>`)

- **Pause/Resume queue** button (toggles `/api/queue/pause` and `/api/queue/resume`)
- (Currently hidden by inline style in JS) **Clear Completed** button (`POST /api/downloads/clear-completed`)
- (Currently hidden by inline style in JS) **Retry Failed** button (`POST /api/downloads/retry-failed`)
- **Queue info summary**: Queue / Active / Completed / Failed counts

#### Unified downloads list (`#allDownloads`)

Each download item shows (as available):

- **Title / URL** (with tooltip of full URL)
- **Type badge**: `video`, `torrent`, `magnet`, `file`
- **Format/Type line**:
  - video: “Format: …”
  - others: “Type: …”
- **Status chip**: queued/starting/downloading/processing/retrying/completed/failed/cancelled
- **Actions** (vary by status):
  - queued/retrying: **Cancel**, **Move Up**, **Move Down**
  - starting/downloading/processing: **Cancel**
  - failed: **Retry**, **Remove**
  - completed: **Remove**
- **Progress bar + progress text** (non-terminal states)
  - Torrent/magnet may show special “finding peers / metadata” messages at low progress.
- **Details line**: speed, ETA, size, added timestamp, completed timestamp
- **Torrent details** (torrent/magnet only): peers, upload speed, ratio
- **Error box**: shows error string when present.

#### Empty state (`#noDownloads`)

- “No downloads found”
- **Start a Download** link → Home

#### URL parameter ingestion

If opened with `downloads.html?url=...&format=...` the page will:

- Call `POST /api/resolve-url` (shows a fixed “Resolving URL…” banner)
- Then enqueue via `POST /api/download` with resolved method/type hints.

---

### Search — `public/search.html` + `public/search.js`

#### Search header

- **Search input** (`#searchInput`)
  - Enter key triggers search.
- **Search button** (`#searchButton`)
  - Calls `performSearch()` → `POST /api/search` with `{ query, limit: 40 }`
- Informational text about results and streaming.

#### Results header (`#searchResultsHeader`)

- **Result count label** (`#resultsCount`)
- **Sort dropdown** (`#sortResults`)
  - Relevance / Duration / Title A–Z / Uploader

#### Loading state (`#searchLoading`)

- Spinner + “Searching YouTube…”

#### Result cards (per result)

- **Thumbnail** (image or default play icon block)
- **Duration badge**
- **Title**
- **Uploader** (and optional view count + upload date)
- **Description** (truncated)
- **Actions**
  - **Download**: opens download modal and fetches formats via `POST /api/video-info`
  - **Stream**: calls `POST /api/stream-url` and plays in overlay player

#### Video player overlay (`#videoPlayer`)

- `<video controls>` (`#playerVideo`)
- **Close** button (×)
- Close by clicking outside or pressing Escape
- Optional **autoplay** based on Settings `autoPlay` (from `localStorage`)

#### Download modal (`#downloadModal`)

- Title/metadata lines
- **Quality dropdown** (`#qualitySelect`) populated from `video-info`
- **Cancel** and **Download** buttons
- Download calls `POST /api/download` and navigates to Queue on success
- Close by clicking outside or pressing Escape

#### Error UI

- DRM error panel (`bitches.gif`)
- Fetch error panel (`fetch.gif`)

---

### Videos (library) — `public/browse.html` + `public/browse.js`

#### Filter controls

- **Filter by Site** dropdown (`#siteFilter`)
- **Sort by** dropdown (`#sortBy`)
  - Date / Title / Site / Duration

#### Video grid (`#videoGrid`)

Each card includes:

- **Thumbnail area**
  - Click plays video
  - Shows duration badge if known
- **Hover action buttons**
  - **Info** (opens modal)
  - **Play**
  - **Delete** (confirms then deletes via `DELETE /api/delete-video/:filename`)
- **Title**
- **Site pill** (friendly name)
- **Uploader**
- **Description** (truncated, when present)

#### No videos state (`#noVideos`)

- “No videos downloaded yet”

#### Player overlay (`#videoPlayer`)

- `<video controls>` (`#playerVideo`)
- **Close** (×)
- Close by outside click or Escape
- Optional autoplay from Settings `autoPlay` (localStorage)

#### Video info modal (`#videoModal`)

- Thumbnail (or default gradient)
- Title
- Site, uploader, duration, filename
- Description
- Actions:
  - **Play Video**
  - **Show Full Metadata** (fetches `GET /api/video-metadata/:filename` and renders JSON)
- Close by “×” or clicking outside

#### Error UI

- DRM error panel (`bitches.gif`)
- Fetch error panel (`fetch.gif`)

---

### Files (library) — `public/files.html` + `public/files.js`

#### Filter/action bar

- **Filter by Type** dropdown (`#typeFilter`)
  - All Types / Torrents / Archives / Executables / Disk Images / Other
- **Sort by** dropdown (`#sortBy`)
  - Date / Name / Size / Type
- **Open Downloads Folder** button
  - Calls `POST /api/open-downloads-folder` (opens in OS file explorer)

#### Files grid (`#filesGrid`)

Each file card includes:

- **Icon** (based on type; torrents shown as 🧲)
- **Name** (title or filename)
- **Meta line**: type • size • date
- **Hover action buttons**
  - **Open File** (calls `POST /api/open-file`)
  - **Delete File** (calls `DELETE /api/delete-video/:filename`)
- Clicking card opens details modal.

#### No files state (`#noFiles`)

- “No files downloaded yet”

#### File details modal (`#fileModal`)

- Icon
- Title
- Type, size, downloaded date, source
- Actions:
  - **Open File**
  - **Show Full Info** (toggles a `<pre>` section)
- The “Full Info” content attempts to fetch the companion `*.info.json` directly from `/downloads/...`.
- Close via “×”, outside click, or Escape.

---

### Settings — `public/config.html` + `public/config.js`

Shows a success banner: **“Settings saved successfully!”** (`#successMessage`).

#### Download Settings

- **Download Directory**
  - Read-only text field (`#downloadDir`)
  - **Browse** button → `POST /api/select-directory`
- **Default Quality** (`#defaultQuality`)
  - best / 1080 / 720 / 480 / 360
- **Output Format** (`#outputFormat`)
  - mp4 / mkv / webm
- **Save Metadata** toggle switch (`#saveMetadata`)

#### Download Acceleration

- **Concurrent Connections** number input (`#connections`, 1–32)
- **Segments per Connection** number input (`#segments`, 1–32)
- **Segment Size** dropdown (`#segmentSize`)
  - 512K / 1M / 2M / 5M

#### Download Queue

- **Enable Queue** toggle (`#queueEnabled`)
- **Max Concurrent Downloads** number input (`#maxConcurrentDownloads`, 1–10)
- **Retry Attempts** number input (`#retryAttempts`, 0–5)
- **Retry Delay (seconds)** number input (`#retryDelay`, 1–60)

#### Interface

- **Auto-play Videos** toggle (`#autoPlay`)

#### Authentication (cookies)

- Hidden file input (`#cookieFile`, accepts `.txt`)
- Read-only display field (`#cookieFileName`)
- **Upload** button (triggers file picker)
- **Clear** button (`#clearCookies`) → `POST /api/clear-cookies`
- “How to export cookies” instructions + link to “Get cookies.txt LOCALLY”
- Cookie presence is checked via `GET /api/cookie-status`
- Cookie upload uses `POST /api/upload-cookies` (multipart form-data field `cookieFile`)

#### Dependency Manager

- **Check for Updates** button
  - Calls:
    - `GET /api/dependencies/status`
    - `GET /api/dependencies/latest`
- Results table (dynamic) includes:
  - Tool name, current version, latest version, status, Update action
- **Update** per tool → `POST /api/dependencies/update` with `{ dependency }`
- **Update All** (runs updates for aria2c/ffmpeg/yt-dlp)
- **Delete Backups** → `POST /api/dependencies/delete-backups`
- **Refresh** (re-check)
- Progress UI (`#dependencyProgress`): progress text + progress bar

#### Bottom actions

- **Save Settings** button → `POST /api/settings` and updates localStorage
- **Reset to Defaults** button → `POST /api/reset-settings` (also clears localStorage; asks confirmation)

---

### Help — `public/help.html`

Static help content (no page-specific JS), covering:

- Quick start steps
- Supported sites + file types
- Torrent/magnet notes
- Quality + output format explanations
- Cookies workflow and privacy note
- Performance optimization guidance
- Queue management explanation
- File management notes
- Troubleshooting section
- Keyboard shortcuts (documented in-page)
- “Getting help” section (mentions Discord and GitHub)

---

### About — `public/about.html` (opened from Electron menu/tray)

- Shows:
  - App name + icon
  - Hard-coded “Version …” line on the page (separate from header badge)
  - Developer attribution + links
  - Dependency list with versions (some updated at runtime)
  - “What’s new” section
  - **Close** button (`window.close()`)
- On load, it fetches `GET /api/versions` to update yt-dlp and aria2c versions in the dependency list.

## Electron shell UI (desktop app chrome)

- **Main window**:
  - Loads `http://localhost:3000/` (Express serves static UI + API).
  - Starts hidden, then shows/maximizes on `ready-to-show`.
  - External links open in the system browser (not inside Electron).
- **Minimize-to-tray behavior**:
  - Closing the main window hides it unless user explicitly exits.
- **System tray icon**:
  - Context menu: Show / Hide / Help / Exit
  - Double-click toggles show/hide
- **Application menu**:
  - File → About FireFetch (opens `about.html`)
  - File → Help (opens `help.html`)
  - File → Exit
- **Right-click context menu** (copy/paste):
  - Enabled for editable fields; also copy-only for selections.


