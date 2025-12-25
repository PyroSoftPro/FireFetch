# FireFetch Performance Triage (Laggy Electron Window)

This document records **potential performance issues** found via code inspection. **No fixes have been applied yet.**

## Symptoms this matches

- **Laggy / janky UI** while downloads are active (or even idling if logs are very chatty).
- Feeling like the app is “busy” (high CPU / disk writes), or DevTools console is constantly updating.
- Increased memory usage over time during long sessions / long downloads.

## Highest-risk findings

### 1) Unconditional verbose logging (main process) can saturate CPU + disk

The `Logger` implementation writes **every** `DEBUG` log to disk and console; there’s **no log level gating**.

Key evidence:

- `Logger.log()` writes to a file stream on every call, including `DEBUG`:

```1:98:app.js
class Logger {
  // ...
  log(level, category, message, data = null) {
    // ...
    if (this.logStream) {
      this.logStream.write(logLine);
    }
    // Also log to console with color coding
    switch (level) {
      case 'DEBUG':
        console.debug(consoleMessage, data || '');
        break;
      default:
        console.log(consoleMessage, data || '');
    }
  }
}
```

- `executeVideoDownload()` logs *every stdout chunk* from yt-dlp as `DEBUG` with structured data (pretty-printed JSON in the file):

```1040:1103:app.js
ytDlp.stdout.on('data', (data) => {
  const output = data.toString();
  logger.debug('YT-DLP', `${download.id} STDOUT`, {
    downloadId: download.id,
    output: output.trim(),
    currentStatus: download.status,
    currentProgress: download.progress
  });
  // ...
});
```

- `executeTorrentDownload()` does the same for aria2c stdout:

```1502:1531:app.js
aria2c.stdout.on('data', (data) => {
  const output = data.toString();
  logger.debug('ARIA2C', `${download.id} STDOUT`, {
    downloadId: download.id,
    output: output.trim(),
    currentStatus: download.status,
    currentProgress: download.progress
  });
  // ...
});
```

**Why this is expensive**

- yt-dlp / aria2c can emit progress output frequently; logging each chunk means:
  - Lots of allocations (stringify + indentation)
  - Lots of filesystem writes
  - Lots of console output
- In Electron, heavy main-process logging can indirectly make the renderer “feel laggy” because the app is CPU/disk bound.

**How to confirm quickly**

- Start a download and watch `logs/firefetch-*.log` grow rapidly.
- In Task Manager, check CPU + disk usage for the FireFetch process while downloading.
- If you open DevTools console, see whether logs are streaming constantly.

**Likely fixes (not applied)**

- Add a log level threshold (e.g., default `INFO`, enable `DEBUG` via a setting/env var).
- Avoid logging raw stdout chunks at debug level by default; sample or summarize.
- Remove indentation from JSON log payloads for hot paths, or store structured data without `JSON.stringify(..., null, 2)` on the critical path.

### 2) Very frequent SSE broadcasts (up to every 100ms) + full state serialization

The download manager broadcasts SSE updates extremely often, and each broadcast builds a full state object and JSON stringifies it.

Key evidence:

- For yt-dlp progress, UI updates broadcast every **100ms**:

```1086:1123:app.js
let lastProgressTime = Date.now();
// ...
const now = Date.now();
const timePassed = now - lastProgressTime > 100;
if (timePassed || progressUpdated) { // Update every 100ms or immediately on progress change
  this.broadcastUpdate();
  lastProgressTime = now;
}
```

- Same pattern for aria2c progress:

```1520:1541:app.js
const now = Date.now();
const timePassed = now - lastProgressTime > 100;
if (timePassed || progressUpdated) {
  this.broadcastUpdate();
  lastProgressTime = now;
}
```

- `broadcastUpdate()` stringifies the *entire* state and writes it to every SSE client:

```3046:3058:app.js
broadcastUpdate() {
  const state = this.getQueueState();
  const message = `data: ${JSON.stringify({ type: 'update', data: state })}\n\n`;
  for (const client of this.clients) {
    try { client.write(message); } catch { this.clients.delete(client); }
  }
}
```

**Why this is expensive**

- Each broadcast calls `getQueueState()` which maps/clones arrays and objects.
- JSON serialization runs every broadcast. At 10 broadcasts/sec, that’s a lot of churn.

**Extra risk: large fields may be included in state**

Some downloads accumulate large strings like `download.stderrOutput` during a run:

```1148:1154:app.js
if (!download.stderrOutput) download.stderrOutput = '';
download.stderrOutput += error;
```

But `getQueueState()`’s `cleanDownload()` only deletes process/engine-like fields; it does **not** remove `stderrOutput`:

```2998:3005:app.js
const cleanDownload = (download) => {
  const cleaned = { ...download };
  delete cleaned.process;
  delete cleaned.torrentEngine;
  delete cleaned.webTorrent;
  return cleaned;
};
```

So large `stderrOutput` content can end up in the SSE payload, making each update bigger and more expensive to serialize/parse/render.

**How to confirm quickly**

- While downloading, use DevTools > Network to inspect the EventSource stream payload size and frequency.
- Add a “long download” and observe if responsiveness degrades over time (payloads grow as stderrOutput accumulates).

**Likely fixes (not applied)**

- Throttle SSE updates (e.g., 250–500ms) and/or send smaller “delta/progress-only” messages.
- Ensure `getQueueState()` excludes or truncates large fields (`stderrOutput`, raw tool output, etc.).
- Actually use `throttledBroadcastUpdate()` (currently exists but most hot paths call `broadcastUpdate()` directly).

### 3) Renderer-side console spam + heavy re-rendering on each SSE message (downloads page)

`public/downloads.js` logs *a lot* and performs non-trivial work on every SSE message.

Key evidence:

- Every SSE message is logged with the full parsed data:

```96:118:public/downloads.js
eventSource.onmessage = function(event) {
  const data = JSON.parse(event.data);
  console.log('[DOWNLOADS] Received SSE message:', data);
  if (data.type === 'state' || data.type === 'update') {
    currentState = data.data;
    console.log('[DOWNLOADS] Updated currentState:', currentState);
    updateAllDownloads();
  }
};
```

- `updateAllDownloads()` → filter/sort → `displayDownloads()`, which logs and iterates through items; it also does repeated DOM queries per item:

```340:499:public/downloads.js
function updateAllDownloads() {
  console.log('[DOWNLOADS] updateAllDownloads called, currentState:', currentState);
  // combines arrays, de-dupes, then filterDownloads() and updateQueueControls()
}
// ...
function displayDownloads() {
  console.log('[DOWNLOADS] displayDownloads called, filteredDownloads:', filteredDownloads.length);
  filteredDownloads.forEach((download, index) => {
    console.log(`[DOWNLOADS] Processing download ${index}: ${download.id} - ${download.status}`);
    const existingItem = downloadsContainer.querySelector(`[data-id="${download.id}"]`);
    // ...
  });
}
```

**Why this is expensive**

- If SSE updates arrive ~10/sec, doing full filter/sort/render and logging per update can absolutely tank UI performance.
- Console logging itself is expensive; if DevTools is open, it’s even worse.

**How to confirm quickly**

- Open downloads page and start a download; watch the console. If it floods, that’s a strong signal.
- In DevTools Performance panel, record a few seconds: expect large time in scripting + rendering tied to `displayDownloads()`.

**Likely fixes (not applied)**

- Remove/guard debug logs behind a debug flag.
- Only update the specific DOM nodes that changed (true incremental updates).
- Apply a UI-side throttle/debounce on SSE message handling.

### 4) Console spam in progress parsers (main process)

Both progress parsers print very frequently.

Key evidence:

- `parseTorrentProgress()` prints **every aria2c output line**:

```2455:2463:app.js
parseTorrentProgress(download, output) {
  if (output.trim().length > 0) {
    console.log(`[${download.id}] ARIA2C OUTPUT:`, output.trim());
  }
  // ...
}
```

- `parseProgress()` prints on many progress-like outputs:

```2638:2668:app.js
if (output.includes('%') || output.includes('ETA') || output.includes('MiB') || output.includes('download')) {
  console.log(`[${download.id}] Parsing:`, JSON.stringify(output));
}
// later:
console.log(`[${download.id}] Progress: ${oldProgress}% → ${newProgress}%`);
```

Even without file logging, this kind of console activity can noticeably impact performance.

### 5) SSE reconnect behavior can thrash if the connection is flaky

Both `public/status-bar.js` and `public/downloads.js` reconnect on SSE errors using `setTimeout(...)`, but they don’t guard against multiple timers if many errors occur quickly.

Key evidence:

```111:117:public/status-bar.js
statusBarEventSource.onerror = function(error) {
  setTimeout(() => { connectToStatusStream(); }, 5000);
};
```

```123:129:public/downloads.js
eventSource.onerror = function(error) {
  setTimeout(() => { connectToDownloadStream(); }, 5000);
};
```

This can create a “reconnect storm” pattern if the connection errors repeatedly in a short window.

## Secondary considerations (less likely, but worth noting)

### Electron `webPreferences`

The main window enables `webviewTag` and `experimentalFeatures`:

```5599:5610:app.js
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  enableRemoteModule: false,
  webSecurity: true,
  allowRunningInsecureContent: false,
  webviewTag: true,
  experimentalFeatures: true
}
```

This is more of a **security** concern than a guaranteed performance problem, but it can also expand the surface area for heavy/complex renderer behavior.

### Version manifest fetch has no timeout + no fallback in practice

`/api/version-manifest` always fetches the GitHub URL and, if it fails, returns 502 (despite the comment implying a fallback).

```3531:3551:app.js
expressApp.get('/api/version-manifest', async (req, res) => {
  try {
    const response = await fetch(OFFICIAL_VERSION_MANIFEST_URL, { headers: { 'Accept': 'application/json' } });
    // ...
  } catch (err) {
    return res.status(502).json({ error: 'Failed to load version manifest from GitHub', details: String(err?.message || err) });
  }
});
```

This shouldn’t cause constant reloads by itself, but a slow/hanging request can contribute to responsiveness issues on the Home page.

## Recommended next steps (verification, no code changes required)

- **Reproduce + measure**:
  - Start FireFetch, open the Downloads page, start one download, and watch CPU usage.
  - Open DevTools Performance for 5–10 seconds during active download.
  - Check log file growth in `logs/`.
- **Narrow the culprit**:
  - If lag correlates with downloads: most likely the **SSE + rendering + logging** combo.
  - If lag happens even idle on non-download pages: look at **background logging** and **status-bar SSE reconnects**.

## Candidate fixes to consider (only after confirmation)

- Introduce a log level setting (default `INFO`) and disable hot-path `DEBUG` logs unless explicitly enabled.
- Stop including large fields (like `stderrOutput`) in SSE queue state.
- Throttle `broadcastUpdate()` globally; prefer coalescing updates.
- Reduce renderer work per SSE message; switch to incremental updates and remove most console logs.
- Add reconnect backoff + single reconnect timer per EventSource consumer.





