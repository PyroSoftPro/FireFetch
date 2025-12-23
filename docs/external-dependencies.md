# External Dependencies Integration

FireFetch bundles external executables in `dep/` and invokes them from `app.js` via child processes.

## What’s in `dep/`

- `yt-dlp.exe`: metadata extraction + video/media downloads
- `aria2c.exe`: high-speed downloader (used directly for files and as yt-dlp’s external downloader)
- `ffmpeg.exe`: muxing/merging and format conversion (used by yt-dlp post-processing)
- `ffprobe.exe` / `ffplay.exe`: shipped alongside ffmpeg builds (not required for core download flow)

## Torrent/Magnet handling

Torrent/magnet jobs are handled by the app’s torrent engine (**peerflix/peerflix**) by default. Some behaviors (like writing metadata) are implemented in `app.js` for torrent jobs as well.

## Cookies (site authentication)

If the user uploads a Netscape cookies file in Settings, FireFetch passes it to yt-dlp via `--cookies <path>`. This is only for **site login**, not app-level authentication.

## Dependency Manager (in-app updates)

The Settings page can check/update tools via:

- `GET /api/dependencies/status`
- `GET /api/dependencies/latest`
- `POST /api/dependencies/update`
- `POST /api/dependencies/delete-backups`

Updates download upstream releases, extract the needed binaries into `dep/`, and keep `.bk` backups.

## Path resolution (dev vs packaged)

At runtime, FireFetch computes `basePath` and `depPath` depending on whether it’s running packaged/portable or from source. All user data is stored relative to `basePath` unless configured otherwise.