# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FireFetch is an Electron-based video downloader application with a modern dark interface. It combines an Express.js backend with an Electron frontend to provide a desktop application for downloading videos using aria2c and yt-dlp.

## Architecture

The application follows a client-server architecture within an Electron wrapper:

- **Main Process** (`app.js`): Electron main process that creates windows and runs an Express server
- **Express Server**: Runs on port 3000 internally, handles API endpoints and video downloads
- **Frontend**: HTML/CSS/JS served from the `public/` directory
- **External Tools**: Uses `aria2c`, `ffmpeg`, and `yt-dlp` from the `dep/` directory

Key architectural features:
- Portable mode support for running from USB drives
- Settings persistence with `settings.json`
- Cookie authentication support for restricted videos
- Real-time download progress streaming via SSE

## Common Commands

### Development
```bash
# Install dependencies
npm install

# Start development server (runs Electron with Express)
npm start
# or
npm run dev
```

### Building
```bash
# Build a folder-based Windows distribution (unpacked)
build-clean.bat

# Build standard packages via electron-builder
npm run build-win   # Windows installer
npm run build-mac   # macOS
npm run build-linux # Linux

# Build portable executable
build-portable.bat
```

### Custom Build Structure (build-clean.bat)
Creates a distribution with the following structure:
```
dist/FireFetch/
├── FireFetch.exe      # Main application
├── dep/               # External tools (aria2c, ffmpeg, yt-dlp)
├── downloads/         # Default download directory
├── cookies/           # Cookie storage directory
├── public/            # Application resources (HTML/CSS/JS)
├── resources/         # Electron resources
└── settings.json      # User settings (created on first run)
```

### Important Notes on Packaging
- The custom build creates a self-contained folder structure
- All paths are relative to the exe location
- Dependencies (`aria2c.exe`, `ffmpeg.exe`, `yt-dlp.exe`) must be present in the `dep/` folder before building
- The entire `dist/FireFetch` folder can be distributed as-is

## API Endpoints

The Express server exposes these key endpoints:

- `POST /api/video-info` - Fetch video metadata from URL
- `POST /api/download` - Add a download job to the queue
- `GET /api/download-stream` - SSE stream of queue state updates
- `GET /api/videos` - List downloaded videos/files from the download directory
- `GET /api/settings` - Get current settings
- `POST /api/settings` - Update settings
- `POST /api/upload-cookies` - Upload cookie file for authentication
- `DELETE /api/delete-video/:filename` - Delete a downloaded video

## Directory Structure

```
downloads/       # Downloaded videos (configurable)
cookies/         # Cookie files for authentication
dep/            # External executables (aria2c, ffmpeg, yt-dlp)
public/         # Frontend HTML/CSS/JS files
  - index.html  # Main download page
  - browse.html # Browse downloaded videos
  - config.html # Settings page
```

## Self-Contained Distribution

When built with `build-clean.bat` or `build-portable.bat`, the application runs in a self-contained manner:

1. All files and dependencies are in the same directory as the executable
2. Settings, downloads, and cookies are stored in subdirectories next to the exe
3. No files are written to user directories or AppData
4. The entire folder can be moved or copied to any location

## Settings Management

Settings are stored in `settings.json` with these configurable options:
- `downloadDir`: Directory for downloads
- `defaultQuality`: Default video quality selection
- `outputFormat`: Output container format (default: mp4)
- `connections`: Number of aria2c connections
- `segments`: Number of download segments
- `cookieFile`: Path to cookies.txt for authentication

## External Dependencies

The application requires these executables in the `dep/` folder:
- `aria2c.exe` - High-speed download manager
- `ffmpeg.exe` - Video processing and merging
- `yt-dlp.exe` - Video metadata extraction and downloading

## Error Handling

The application includes comprehensive error handling for:
- Authentication failures (cookies required)
- DRM protected content
- Invalid URLs
- Download failures
- Missing dependencies

Error messages are displayed with contextual help and a humorous "Mean Girls" reference.

## Development Tips

1. Always ensure the `dep/` folder contains required executables before running
2. Use `build-clean.bat` for a quick local “packaged-like” test
3. The frontend automatically detects and displays authentication errors
4. Settings changes take effect immediately without restart
5. Cookie files are validated on upload and stored in the `cookies/` directory