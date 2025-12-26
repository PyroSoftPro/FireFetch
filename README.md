# FireFetch

FireFetch is a desktop downloader built with **Electron + Express**, powered by **yt-dlp**, **aria2c**, and **ffmpeg**.

- **Open source / free code**: the source in this repository is free to use and modify.
- **Binary distribution**: prebuilt releases are available on **Itch.io** as **donationware** (free download, optional donation).
- **Sponsor**: Sponsored by [Playcast.io](https://playcast.io).

<img width="1348" height="893" alt="image" src="https://github.com/user-attachments/assets/24bdc809-c281-452f-aa49-13893a7b05f8" />

## What it does

- **Video downloads** via `yt-dlp` (format selection, metadata, many supported sites depending on your bundled `yt-dlp` version)
- **Direct file downloads** via `aria2c`
- **Torrent / magnet support**
- **Queue UI** with pause/resume, retries, reordering, and persistence
- **Cookie upload** (optional) for sites that require login (stored locally)
- **Dependency Manager** to check/update bundled tools

## Run from source (development)

### Requirements

- Node.js + npm
- Windows is the primary target in this repo (bundled tools are `.exe`)

### Install & run

```bash
npm install
npm start
```

## Key paths & persistence (runtime behavior)

FireFetch stores its data relative to the app’s base directory:

- **Settings**: `settings.json`
- **Download queue state**: `downloads-state.json`
- **Download output**: `downloads/` (configurable in Settings)
- **Cookie storage**: `cookies/` (only used if you upload cookies)
- **Bundled tools**: `dep/`

<img width="1348" height="1016" alt="image" src="https://github.com/user-attachments/assets/8126c369-f444-420d-8d64-4c69bba985e8" />

## Notes

- **DRM**: FireFetch does not bypass DRM-protected content.
- **App authentication**: FireFetch does **not** require an app login. Cookies are only for site authentication when needed.

## Docs

Developer-facing docs are in `docs/`:

- `docs/api-reference.md`
- `docs/frontend-architecture.md`
- `docs/build-deployment.md`
- `docs/external-dependencies.md`
- `docs/troubleshooting.md`

## License

See the repository’s license (and/or `package.json`) for the current licensing terms.


