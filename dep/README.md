# External tools (not committed)

This folder is **intentionally not committed** because it contains large binaries (often >100MB).

At runtime/build time FireFetch expects these files to exist here:

- `aria2c.exe`
- `ffmpeg.exe` (and optionally `ffplay.exe`, `ffprobe.exe`)
- `yt-dlp.exe`

You can obtain/update them from inside the app via **Settings → Dependencies** (it downloads upstream releases into this folder).


