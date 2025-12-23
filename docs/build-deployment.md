# Build & Deployment Guide

FireFetch uses Electron Builder for packaging and distribution, with custom batch scripts for specialized build configurations.

## Prerequisites

### Required Dependencies
1. **Node.js** (v16 or later)
2. **npm** (included with Node.js)
3. **External Tools** in `dep/` folder:
   - `aria2c.exe` - Download manager
   - `ffmpeg.exe` - Video processing
   - `yt-dlp.exe` - Video metadata extraction

### Development Dependencies
```bash
npm install
```

Installs:
- `electron` - Framework for desktop applications
- `electron-builder` - Packaging and distribution
- Application dependencies (express, cors, multer, etc.)

## Build Types

### 1. Development Mode
For testing and development:

```bash
npm start
# or
npm run dev
```

**What it does:**
- Launches Electron with the current source code
- No packaging or compilation
- Uses development paths for resources (loads `public/` directly)

### 2. Standard Builds
Create installable packages:

```bash
# Windows installer + portable
npm run build-win

# macOS application bundle  
npm run build-mac

# Linux AppImage/deb/rpm
npm run build-linux
```

**Output:** `dist/` directory with platform-specific installers

### 3. Directory Build (Unpackaged)
For development testing:

```bash
npm run build-clean
```

**Output:** `dist/win-unpacked/` with all files uncompressed

### 4. Custom Build (Recommended)
Optimized distribution structure:

```bash
build-clean.bat
```

**What it does:**
1. Validates external dependencies in `dep/` folder
2. Builds unpackaged Electron application
3. Creates minimal distribution in `dist/FireFetch/`
4. Copies only essential Electron runtime files
5. Includes application resources and external tools
6. Creates launcher scripts and documentation

**Output Structure:**
```
dist/FireFetch/
├── FireFetch.exe           # Main application
├── FireFetch.bat           # Launcher script
├── resources/              # Application code and assets
│   ├── app.asar           # Packaged application code
│   ├── dep/               # External tools
│   └── public/            # Frontend files
├── downloads/             # Download directory (empty)
├── cookies/               # Cookie storage (empty)
├── locales/               # Electron language files
├── *.dll, *.pak, *.bin    # Electron runtime files
└── README.txt             # User instructions
```

### 5. Portable Build
Self-contained single executable:

```bash
build-portable.bat
```

**What it does:**
1. Creates a single portable executable
2. Sets up directory structure alongside the exe
3. Includes external tools and empty directories
4. Generates portable-specific documentation

**Output Structure:**
```
dist/FireFetch-Portable/
├── FireFetch-Portable.exe  # Self-extracting application
├── FireFetch.bat           # Launcher script
├── dep/                    # External tools
├── downloads/              # Download directory (empty)
├── cookies/                # Cookie storage (empty)
└── README.txt              # Portable instructions
```

## Build Configuration

### Package.json Build Section
```json
{
  "build": {
    "appId": "com.firefetch.app",
    "productName": "FireFetch",
    "directories": {
      "output": "dist"
    },
    "win": {
      "target": ["dir", "portable"],
      "icon": "icon.ico"
    },
    "files": [
      "**/*",
      "!downloads/**/*",
      "!cookies/**/*",
      "!build-*.bat"
    ],
    "extraResources": [
      {
        "from": "dep",
        "to": "dep"
      },
      {
        "from": "public", 
        "to": "public"
      }
    ]
  }
}
```

**Key Settings:**
- `extraResources` - Copies `dep/` and `public/` to resources folder
- `files` exclusions - Prevents user data from being packaged
- `asarUnpack` - Keeps `dep/` folder accessible for child processes

### Path Resolution
The application handles different path configurations:

**Development Mode:**
```javascript
basePath = __dirname
depPath = path.join(__dirname, 'dep')
resourcesPath = __dirname
```

**Packaged Mode:**
```javascript
basePath = path.dirname(process.execPath)
depPath = path.join(basePath, 'dep') || path.join(resourcesPath, 'dep')
resourcesPath = path.join(basePath, 'resources')
```

**Portable Mode Detection:**
```javascript
if (process.execPath.includes('\\Temp\\')) {
    isPortable = true
    // Handle temporary extraction directory
}
```

## Distribution Requirements

### Minimum System Requirements
- **Windows:** 10 or later (64-bit)
- **RAM:** 4GB minimum, 8GB recommended
- **Disk Space:** 500MB for application + downloaded content
- **Network:** Internet connection for downloads

### External Tool Versions
Ensure compatible versions in `dep/` folder:
- **aria2c:** 1.36+ (multi-connection downloads)
- **yt-dlp:** Latest (video platform support)
- **ffmpeg:** 4.4+ (video processing)

### Build Validation
The build scripts perform validation:

1. **Dependency Check:** Verifies all external tools exist
2. **Directory Creation:** Ensures required folders exist
3. **Build Verification:** Confirms executable creation
4. **Size Reporting:** Shows distribution size
5. **Structure Validation:** Verifies correct file placement

## Distribution Methods

### 1. Direct Distribution
- Provide `dist/FireFetch/` folder as a zip file
- Users extract and run `FireFetch.exe`
- All settings stored next to executable

### 2. Portable Distribution  
- Single `FireFetch-Portable.exe` file
- Extracts to temp directory on first run
- Settings/downloads stored next to exe

### 3. Installer Distribution
- Use `npm run build-win` for NSIS installer
- Handles Windows registry and shortcuts
- Standard installation to Program Files

## Deployment Checklist

### Pre-Build
- [ ] Update version in `package.json`
- [ ] Test development mode (`npm start`)
- [ ] Verify all external tools in `dep/` folder
- [ ] Update changelog/documentation

### Build Process
- [ ] Run `build-clean.bat` for custom distribution
- [ ] Test built application before distribution
- [ ] Verify all features work in packaged mode
- [ ] Check file associations and shortcuts

### Post-Build
- [ ] Test on clean Windows system
- [ ] Verify portable mode works on different drives
- [ ] Package with installation instructions
- [ ] Create distribution checksums

## Troubleshooting

### Common Build Issues

**"dep folder not found"**
- Ensure `dep/` folder exists with required executables
- Download latest versions from official sources

**"Build failed! Executable not created"**
- Check Node.js version compatibility
- Clear `node_modules` and reinstall dependencies
- Run build with verbose logging

**Path Resolution Issues**
- Verify `extraResources` configuration in package.json
- Check file permissions for external tools
- Test different execution contexts (development vs packaged)

**Large Bundle Size**
- Review `files` exclusions in package.json
- Consider using `asarUnpack` for large files
- Optimize external tool sizes

### Performance Optimization

**Build Speed:**
- Use `--dir` flag for faster iteration
- Exclude unnecessary files in package.json
- Cache `node_modules` between builds

**Bundle Size:**
- Minimize external tool file sizes
- Use compression for resources
- Exclude development dependencies from packaging

**Runtime Performance:**
- Pre-validate external tool paths
- Cache frequently accessed files
- Optimize startup sequence