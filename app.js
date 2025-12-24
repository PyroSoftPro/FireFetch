const { app, BrowserWindow, dialog, Menu, shell, Tray } = require('electron');
const express = require('express');
const cors = require('cors');
const path = require('path');
const { spawn, exec } = require('child_process');
const fs = require('fs').promises;
const fsSync = require('fs');
const { promisify } = require('util');
const execAsync = promisify(exec);
const multer = require('multer');
const { EventEmitter } = require('events');
const peerflix = require('peerflix');
const fetch = require('node-fetch');

// Official version manifest (checked on every page load via /api/version-manifest).
// If you fork FireFetch, update this to your repo’s raw URL.
const OFFICIAL_VERSION_MANIFEST_URL = process.env.FIREFETCH_VERSION_MANIFEST_URL
    || 'https://raw.githubusercontent.com/PyroSoftPro/FireFetch/main/public/version-manifest.json';

// Enhanced logging system
class Logger {
    constructor() {
        this.logFile = null;
        this.logStream = null;
        this.initPromise = null;
        this.debugEnabled = false;
    }

    setDebugEnabled(enabled) {
        this.debugEnabled = !!enabled;
    }

    async init(logDir) {
        if (this.initPromise) return this.initPromise;
        
        this.initPromise = this._initialize(logDir);
        return this.initPromise;
    }

    async _initialize(logDir) {
        try {
            // Ensure log directory exists
            await fs.mkdir(logDir, { recursive: true });
            
            // Create log file with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            this.logFile = path.join(logDir, `firefetch-${timestamp}.log`);
            
            // Create write stream
            this.logStream = fsSync.createWriteStream(this.logFile, { flags: 'a' });
            
            // Log session start
            this.log('INFO', 'SYSTEM', 'FireFetch logging session started');
            this.log('INFO', 'SYSTEM', `Log file: ${this.logFile}`);
            this.log('INFO', 'SYSTEM', `Node version: ${process.version}`);
            this.log('INFO', 'SYSTEM', `Platform: ${process.platform}`);
            
            // Clean up old log files (keep last 10)
            await this.cleanupOldLogs(logDir);
            
        } catch (error) {
            console.error('Failed to initialize logger:', error);
        }
    }

    log(level, category, message, data = null) {
        // Drop DEBUG logs unless explicitly enabled (default OFF for performance).
        if (level === 'DEBUG' && !this.debugEnabled) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            category,
            message,
            data: data ? (typeof data === 'object' ? JSON.stringify(data, null, 2) : data) : null
        };
        
        // Format for file
        let logLine = `[${timestamp}] [${level}] [${category}] ${message}`;
        if (data) {
            logLine += `\nData: ${logEntry.data}`;
        }
        logLine += '\n';
        
        // Write to file if available
        if (this.logStream) {
            this.logStream.write(logLine);
        }
        
        // Also log to console with color coding
        const consoleMessage = `[${category}] ${message}`;
        switch (level) {
            case 'ERROR':
                console.error(consoleMessage, data || '');
                break;
            case 'WARN':
                console.warn(consoleMessage, data || '');
                break;
            case 'DEBUG':
                console.debug(consoleMessage, data || '');
                break;
            default:
                console.log(consoleMessage, data || '');
        }
    }

    async cleanupOldLogs(logDir) {
        try {
            const files = await fs.readdir(logDir);
            const logFiles = files
                .filter(file => file.startsWith('firefetch-') && file.endsWith('.log'))
                .map(file => ({
                    name: file,
                    path: path.join(logDir, file),
                    stat: fsSync.statSync(path.join(logDir, file))
                }))
                .sort((a, b) => b.stat.mtime - a.stat.mtime);
            
            // Keep only the 10 most recent log files
            const filesToDelete = logFiles.slice(10);
            for (const file of filesToDelete) {
                try {
                    await fs.unlink(file.path);
                    console.log(`Deleted old log file: ${file.name}`);
                } catch (error) {
                    console.warn(`Failed to delete log file ${file.name}:`, error.message);
                }
            }
        } catch (error) {
            console.warn('Failed to cleanup old logs:', error.message);
        }
    }

    error(category, message, data) { this.log('ERROR', category, message, data); }
    warn(category, message, data) { this.log('WARN', category, message, data); }
    info(category, message, data) { this.log('INFO', category, message, data); }
    debug(category, message, data) { this.log('DEBUG', category, message, data); }

    close() {
        if (this.logStream) {
            this.logStream.end();
        }
    }
}

const logger = new Logger();

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
    return;
}

// Configuration
const PORT = 3000;
let mainWindow;
let server;
let tray;

// Determine base path for resources
let basePath;
let depPath;
let resourcesPath;
let userDataPath;
let isPortable = false;

// Debug mode: enables verbose logging. Default OFF for performance.
// Enable via:
// - env var: FIREFETCH_DEBUG=1
// - settings.json: { "debugLogging": true }
const DEBUG_LOGS = process.env.FIREFETCH_DEBUG === '1';

if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    
    // Check if running as portable (exe extracts to temp)
    if (process.execPath.includes('\\Temp\\') || process.execPath.includes('/tmp/')) {
        isPortable = true;
        // For portable, find the real exe location
        const portableFile = path.join(app.getPath('appData'), app.getName(), '.portable');
        if (fsSync.existsSync(portableFile)) {
            try {
                const content = fsSync.readFileSync(portableFile, 'utf8').trim();
                if (content && fsSync.existsSync(content)) {
                    basePath = path.dirname(content);
                }
            } catch (e) {
                // Fall back to exe directory
                basePath = exeDir;
            }
        } else {
            basePath = exeDir;
        }
    } else {
        basePath = exeDir;
    }
    
    userDataPath = basePath;
    
    // In packaged app, resources depend on build type
    if (fsSync.existsSync(path.join(basePath, 'resources'))) {
        resourcesPath = path.join(basePath, 'resources');
    } else if (fsSync.existsSync(path.join(exeDir, 'resources'))) {
        resourcesPath = path.join(exeDir, 'resources');
    } else {
        resourcesPath = basePath;
    }
    
    // dep folder location
    if (fsSync.existsSync(path.join(basePath, 'dep'))) {
        depPath = path.join(basePath, 'dep');
    } else if (fsSync.existsSync(path.join(resourcesPath, 'dep'))) {
        depPath = path.join(resourcesPath, 'dep');
    } else {
        depPath = path.join(basePath, 'dep');
    }
} else {
    // Development mode
    basePath = __dirname;
    resourcesPath = __dirname;
    userDataPath = __dirname;
    depPath = path.join(basePath, 'dep');
}

// Configure directories - always use paths relative to base
const cookiesDir = path.join(basePath, 'cookies');
const downloadsDir = path.join(basePath, 'downloads');

// Configure multer for cookie file uploads
const upload = multer({ 
    dest: cookiesDir,
    limits: { fileSize: 1024 * 1024 }, // 1MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/plain' || file.originalname.endsWith('.txt')) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload a .txt file'), false);
        }
    }
});

// Settings management
let settings = {
    downloadDir: downloadsDir,
    defaultQuality: 'best',
    outputFormat: 'mp4',
    saveMetadata: true,
    connections: 16,
    segments: 16,
    segmentSize: '1M',
    autoPlay: false,
    cookieFile: null,
    // Queue settings
    maxConcurrentDownloads: 3,
    queueEnabled: true,
    retryAttempts: 2,
    retryDelay: 5000,
    // Torrent settings
    torrentEngine: 'webtorrent',  // 'webtorrent' or 'aria2c'
    // Debug
    debugLogging: false
};

// Get settings file path
function getSettingsPath() {
    // Always use the basePath (exe directory for packaged apps)
    return path.join(basePath, 'settings.json');
}

// If a persisted JSON file becomes corrupted, quarantine it so the app can recover on next launch.
async function quarantineCorruptJsonFile(filePath, label) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const quarantinedPath = `${filePath}.corrupt-${timestamp}`;
    try {
        await fs.rename(filePath, quarantinedPath);
        console.warn(`[${label}] Corrupt JSON quarantined: ${quarantinedPath}`);
        return quarantinedPath;
    } catch (err) {
        console.warn(`[${label}] Failed to quarantine corrupt JSON (${filePath}):`, err.message);
        return null;
    }
}

// Load settings from file if exists
async function loadSettings() {
    try {
        const settingsPath = getSettingsPath();
        const data = await fs.readFile(settingsPath, 'utf8');
        try {
            const parsed = JSON.parse(data);
            settings = { ...settings, ...parsed };
        } catch (parseErr) {
            console.warn('[SETTINGS] settings.json contains invalid JSON. Falling back to defaults.', parseErr.message);
            await quarantineCorruptJsonFile(settingsPath, 'SETTINGS');
        }
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.warn('[SETTINGS] Failed to read settings.json. Falling back to defaults.', err.message);
        }
    }
}

function syncLoggerDebugSetting() {
    // Environment variable wins (useful for ad-hoc debugging without touching settings.json)
    const enabled = DEBUG_LOGS || !!settings?.debugLogging;
    logger.setDebugEnabled(enabled);
}

// Create downloads directory if it doesn't exist
async function ensureDownloadsDir() {
    try {
        const dir = settings.downloadDir;
        await fs.mkdir(dir, { recursive: true });
        console.log('Downloads directory:', dir);
    } catch (err) {
        console.error('Error creating downloads directory:', err);
    }
}

// Ensure cookies directory exists
async function ensureCookiesDir() {
    try {
        await fs.mkdir(cookiesDir, { recursive: true });
        console.log('Cookies directory:', cookiesDir);
    } catch (err) {
        console.error('Error creating cookies directory:', err);
    }
}

// Safely resolve a user-provided (possibly relative) path within a base directory.
// Prevents path traversal like "../../Windows/system.ini".
function resolvePathInsideDir(baseDir, userPath) {
    const baseAbs = path.resolve(baseDir);
    const targetAbs = path.resolve(baseAbs, userPath);
    const rel = path.relative(baseAbs, targetAbs);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
        const err = new Error('Invalid path');
        err.code = 'INVALID_PATH';
        throw err;
    }
    return targetAbs;
}

// Utility function to detect if URL is a direct file download
function isDirectFileDownload(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname.toLowerCase();
        
        // Comprehensive list of file extensions that should be downloaded directly
        const fileExtensions = [
            // Executables & Installers
            '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif',
            '.dmg', '.pkg', '.app', '.bundle',
            '.deb', '.rpm', '.appimage', '.snap', '.flatpak', '.tar.xz',
            '.apk', '.ipa', '.xap', '.aab',
            
            // Archives & Compressed Files
            '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.lz', '.z',
            '.ace', '.arj', '.cab', '.lha', '.lzh', '.zoo', '.arc', '.pak',
            '.sit', '.sitx', '.sea', '.hqx', '.cpt', '.pit', '.pf',
            '.tar.gz', '.tar.bz2', '.tar.xz', '.tar.lz', '.tgz', '.tbz2',
            
            // Documents
            '.pdf', '.ps', '.eps',
            '.doc', '.docx', '.dot', '.dotx', '.docm', '.dotm',
            '.xls', '.xlsx', '.xlt', '.xltx', '.xlsm', '.xltm', '.xlsb',
            '.ppt', '.pptx', '.pot', '.potx', '.pptm', '.potm', '.ppsx', '.ppsm',
            '.odt', '.ods', '.odp', '.odg', '.odf', '.odb', '.odc', '.odm',
            '.rtf', '.wpd', '.wps', '.pages', '.numbers', '.key',
            '.txt', '.text', '.log', '.md', '.markdown', '.rst', '.asciidoc',
            '.csv', '.tsv', '.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
            
            // Images
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif',
            '.svg', '.webp', '.ico', '.icns', '.cur', '.ani',
            '.psd', '.ai', '.eps', '.cdr', '.xcf', '.sketch',
            '.raw', '.cr2', '.nef', '.arw', '.dng', '.orf', '.rw2',
            '.heic', '.heif', '.avif', '.jp2', '.jpx', '.j2k',
            
            // Audio
            '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a', '.opus',
            '.aiff', '.au', '.ra', '.3gp', '.amr', '.awb', '.dss', '.dvf',
            '.m4b', '.m4p', '.mmf', '.mpc', '.msv', '.oga', '.raw', '.sln',
            '.tta', '.voc', '.vox', '.wv', '.webm', '.8svx', '.cda',
            
            // Video
            '.mp4', '.avi', '.mkv', '.mov', '.wmv', '.flv', '.webm', '.m4v',
            '.3gp', '.3g2', '.asf', '.divx', '.f4v', '.m2v', '.m4p', '.m4v',
            '.mj2', '.mjpeg', '.mng', '.mp2', '.mpe', '.mpeg', '.mpg', '.mpv',
            '.mts', '.mxf', '.nsv', '.nuv', '.ogm', '.ogv', '.ps', '.rec',
            '.rm', '.rmvb', '.tod', '.ts', '.vob', '.vro', '.y4m',
            
            // Fonts
            '.ttf', '.otf', '.woff', '.woff2', '.eot', '.fon', '.fnt', '.bdf',
            '.pcf', '.snf', '.pfb', '.pfm', '.afm', '.ttc', '.otc',
            
            // 3D Models & CAD
            '.obj', '.fbx', '.dae', '.3ds', '.blend', '.max', '.ma', '.mb',
            '.c4d', '.lwo', '.lws', '.x3d', '.ply', '.stl', '.off', '.dxf',
            '.dwg', '.step', '.stp', '.iges', '.igs', '.sat', '.brep',
            
            // Disk Images & Virtual Machines
            '.iso', '.img', '.dmg', '.nrg', '.cue', '.bin', '.mds', '.ccd',
            '.vhd', '.vhdx', '.vmdk', '.vdi', '.qcow2', '.raw', '.cow',
            '.ova', '.ovf', '.vbox', '.vbox-prev',
            
            // Database
            '.db', '.sqlite', '.sqlite3', '.mdb', '.accdb', '.dbf', '.odb',
            '.frm', '.myd', '.myi', '.ibd', '.bak', '.sql', '.dump',
            
            // Code & Development
            '.c', '.cpp', '.h', '.hpp', '.cc', '.cxx', '.c++',
            '.java', '.class', '.jar', '.war', '.ear',
            '.py', '.pyc', '.pyo', '.pyd', '.pyw', '.pyz', '.pyzw',
            '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
            '.php', '.phtml', '.php3', '.php4', '.php5', '.phps',
            '.rb', '.rbw', '.gem', '.rake',
            '.go', '.rs', '.swift', '.kt', '.kts', '.scala', '.clj', '.cljs',
            '.pl', '.pm', '.pod', '.t', '.psgi',
            '.sh', '.bash', '.zsh', '.fish', '.csh', '.tcsh', '.ksh',
            '.ps1', '.psm1', '.psd1', '.ps1xml', '.psc1', '.pssc',
            '.r', '.rdata', '.rds', '.rda',
            '.m', '.mat', '.fig', '.p', '.mex',
            '.asm', '.s', '.nas', '.inc',
            
            // Web & Markup
            '.html', '.htm', '.xhtml', '.mhtml', '.hta',
            '.css', '.scss', '.sass', '.less', '.styl',
            '.xsl', '.xslt', '.dtd', '.xsd', '.wsdl',
            
            // Ebooks
            '.epub', '.mobi', '.azw', '.azw3', '.kf8', '.kfx', '.prc',
            '.fb2', '.lit', '.lrf', '.pdb', '.pml', '.rb', '.tcr',
            
            // GIS & Maps
            '.shp', '.kml', '.kmz', '.gpx', '.gdb', '.mxd', '.qgs',
            '.geojson', '.topojson', '.osm', '.pbf',
            
            // Game Files
            '.rom', '.sav', '.st', '.srm', '.fc', '.nes', '.smc', '.sfc',
            '.gb', '.gbc', '.gba', '.nds', '.3ds', '.cia', '.wad',
            '.pak', '.vpk', '.gcf', '.ncf', '.vdf', '.acf',
            
            // Scientific & Academic
            '.nc', '.hdf', '.h5', '.fits', '.fts', '.cdf', '.grib', '.bufr',
            '.las', '.laz', '.e57', '.ply', '.xyz', '.pcd',
            
            // Cryptocurrency & Blockchain
            '.wallet', '.dat', '.key', '.p12', '.pfx', '.pem', '.crt', '.cer',
            
            // Backup & System
            '.bak', '.backup', '.old', '.orig', '.save', '.tmp', '.temp',
            '.part', '.crdownload', '.download', '.filepart',
            '.dmp', '.core', '.crash', '.etl', '.evtx',
            
            // Misc Binary & Data
            '.bin', '.dat', '.data', '.raw', '.hex', '.dump', '.blob',
            '.cache', '.lock', '.pid', '.sock', '.fifo', '.device'
        ];
        
        return fileExtensions.some(ext => pathname.endsWith(ext));
    } catch {
        return false;
    }
}

// URL Resolution Function
async function resolveUrlAndDetermineMethod(url, options = {}) {
    const { timeout = 30000, followRedirects = 10, userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' } = options;
    
    logger.log('INFO', 'URL_RESOLVER', `Starting URL resolution for: ${url}`);
    
    try {
        // Quick check for obvious cases first
        if (url.startsWith('magnet:')) {
            logger.log('INFO', 'URL_RESOLVER', `Detected magnet link: ${url}`);
            return {
                originalUrl: url,
                resolvedUrl: url,
                method: 'aria2c',
                type: 'magnet',
                title: 'Magnet Link Download',
                reason: 'Magnet URI detected'
            };
        }

        // Check if yt-dlp can handle this URL first (faster than HTTP requests)
        const ytDlpSupported = await checkYtDlpSupport(url);
        if (ytDlpSupported.supported) {
            logger.log('INFO', 'URL_RESOLVER', `yt-dlp supports this URL: ${url}`);
            return {
                originalUrl: url,
                resolvedUrl: url,
                method: 'yt-dlp',
                type: 'video',
                title: ytDlpSupported.title || 'Video Download',
                reason: `Supported by yt-dlp (${ytDlpSupported.extractor})`
            };
        }

        // Perform HTTP HEAD request to resolve redirects and check content
        const resolvedInfo = await performHttpResolution(url, { timeout, followRedirects, userAgent });
        
        // Analyze the resolved URL and response
        const analysis = analyzeResolvedUrl(resolvedInfo);
        
        logger.log('INFO', 'URL_RESOLVER', `URL resolved: ${url} -> ${resolvedInfo.finalUrl}, Method: ${analysis.method}, Type: ${analysis.type}`);
        
        return {
            originalUrl: url,
            resolvedUrl: resolvedInfo.finalUrl,
            method: analysis.method,
            type: analysis.type,
            title: analysis.title,
            reason: analysis.reason,
            contentType: resolvedInfo.contentType,
            contentLength: resolvedInfo.contentLength,
            redirectChain: resolvedInfo.redirectChain
        };

    } catch (error) {
        logger.log('ERROR', 'URL_RESOLVER', `Failed to resolve URL: ${url}`, error);
        
        // Fallback: if resolution fails, default to yt-dlp for URLs that look like media sites
        const isLikelyVideo = /\b(youtube|youtu\.be|vimeo|dailymotion|twitch|tiktok|instagram|facebook|twitter|reddit)\b/i.test(url);
        
        return {
            originalUrl: url,
            resolvedUrl: url,
            method: isLikelyVideo ? 'yt-dlp' : 'aria2c',
            type: isLikelyVideo ? 'video' : 'file',
            title: isLikelyVideo ? 'Video Download' : 'File Download',
            reason: `Resolution failed, fallback to ${isLikelyVideo ? 'yt-dlp' : 'aria2c'} (${error.message})`,
            error: error.message
        };
    }
}

// Check if yt-dlp supports the URL
async function checkYtDlpSupport(url) {
    return new Promise((resolve) => {
        const ytDlpPath = path.join(depPath, 'yt-dlp.exe');
        const args = ['--dump-json', '--no-warnings', '--skip-download', '--playlist-items', '1', url];

        let ytDlpProc = null;
        let settled = false;
        let timeoutId = null;

        const finish = (result) => {
            if (settled) return;
            settled = true;
            if (timeoutId) clearTimeout(timeoutId);
            resolve(result);
        };

        timeoutId = setTimeout(() => {
            try {
                if (ytDlpProc && !ytDlpProc.killed) {
                    ytDlpProc.kill(); // SIGTERM by default (works cross-platform)
                }
            } catch (e) {
                // Ignore kill errors (e.g. already exited)
            }
            finish({ supported: false, reason: 'Timeout' });
        }, 15000);

        ytDlpProc = spawn(ytDlpPath, args);
        let output = '';
        let errorOutput = '';

        ytDlpProc.stdout.on('data', (data) => {
            output += data.toString();
        });

        ytDlpProc.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        ytDlpProc.on('error', (err) => {
            finish({ supported: false, reason: 'Spawn failed', error: err.message });
        });

        ytDlpProc.on('close', (code) => {
            if (code === 0 && output.trim()) {
                try {
                    const info = JSON.parse(output.trim().split('\n')[0]);
                    finish({
                        supported: true,
                        title: info.title,
                        extractor: info.extractor || info.ie_key,
                        duration: info.duration
                    });
                } catch (e) {
                    finish({ supported: false, reason: 'Invalid JSON response' });
                }
            } else {
                finish({ 
                    supported: false, 
                    reason: errorOutput.includes('Unsupported URL') ? 'Unsupported site' : 'Unknown error',
                    error: errorOutput
                });
            }
        });
    });
}

// Perform HTTP resolution with redirect following
async function performHttpResolution(url, options) {
    const https = require('https');
    const http = require('http');
    const { URL } = require('url');
    
    const { timeout, followRedirects, userAgent } = options;
    let redirectCount = 0;
    let currentUrl = url;
    const redirectChain = [url];
    
    return new Promise((resolve, reject) => {
        const makeRequest = (requestUrl) => {
            const urlObj = new URL(requestUrl);
            const isHttps = urlObj.protocol === 'https:';
            const client = isHttps ? https : http;
            
            const requestOptions = {
                hostname: urlObj.hostname,
                port: urlObj.port || (isHttps ? 443 : 80),
                path: urlObj.pathname + urlObj.search,
                method: 'HEAD',
                headers: {
                    'User-Agent': userAgent,
                    'Accept': '*/*',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'close'
                },
                timeout: timeout
            };

            const req = client.request(requestOptions, (res) => {
                const { statusCode, headers } = res;
                
                // Handle redirects
                if (statusCode >= 300 && statusCode < 400 && headers.location) {
                    if (redirectCount >= followRedirects) {
                        return reject(new Error(`Too many redirects (${redirectCount})`));
                    }
                    
                    redirectCount++;
                    currentUrl = new URL(headers.location, requestUrl).href;
                    redirectChain.push(currentUrl);
                    
                    return makeRequest(currentUrl);
                }
                
                // Success response
                if (statusCode >= 200 && statusCode < 300) {
                    resolve({
                        finalUrl: currentUrl,
                        statusCode,
                        contentType: headers['content-type'] || '',
                        contentLength: headers['content-length'] ? parseInt(headers['content-length']) : null,
                        redirectChain,
                        headers
                    });
                } else {
                    reject(new Error(`HTTP ${statusCode}: ${res.statusMessage}`));
                }
                
                res.resume(); // Consume response
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });

            req.on('error', (error) => {
                reject(error);
            });

            req.end();
        };

        makeRequest(currentUrl);
    });
}

// Analyze resolved URL to determine best download method
function analyzeResolvedUrl(resolvedInfo) {
    const { finalUrl, contentType, contentLength } = resolvedInfo;
    const url = finalUrl.toLowerCase();
    const content = contentType.toLowerCase();
    
    // Check for torrent files
    if (url.includes('.torrent') || content.includes('application/x-bittorrent')) {
        return {
            method: 'aria2c',
            type: 'torrent',
            title: 'Torrent File Download',
            reason: 'Torrent file detected'
        };
    }
    
    // Check for video/audio content types
    if (content.includes('video/') || content.includes('audio/')) {
        return {
            method: 'aria2c',
            type: 'file',
            title: 'Media File Download',
            reason: `Media content type: ${contentType}`
        };
    }
    
    // Check for large files that are likely downloads
    if (contentLength && contentLength > 50 * 1024 * 1024) { // 50MB+
        return {
            method: 'aria2c',
            type: 'file',
            title: 'Large File Download',
            reason: `Large file detected (${Math.round(contentLength / 1024 / 1024)}MB)`
        };
    }
    
    // Check for common file extensions in URL
    const fileExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.exe', '.msi', '.dmg', '.pkg', 
                           '.deb', '.rpm', '.appimage', '.iso', '.img', '.bin', '.apk', '.ipa'];
    
    for (const ext of fileExtensions) {
        if (url.includes(ext)) {
            return {
                method: 'aria2c',
                type: 'file',
                title: 'File Download',
                reason: `File extension detected: ${ext}`
            };
        }
    }
    
    // Check for direct file downloads based on URL patterns
    if (isDirectFileDownload(finalUrl)) {
        return {
            method: 'aria2c',
            type: 'file',
            title: 'Direct File Download',
            reason: 'Direct file URL pattern detected'
        };
    }
    
    // Default to yt-dlp for everything else (web pages, streaming sites, etc.)
    return {
        method: 'yt-dlp',
        type: 'video',
        title: 'Video/Media Download',
        reason: 'Default to yt-dlp for web content'
    };
}

// Download Manager Class
class DownloadManager extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.activeDownloads = new Map();
        this.completedDownloads = [];
        this.clients = new Set(); // SSE clients
        this.nextId = 1;
        
        // Initialize queue settings
        this.queueEnabled = true;
        this.maxRetries = 2;
        this.lastBroadcast = 0; // For throttled updates
        this.minBroadcastIntervalMs = 250; // 4 updates/sec max by default (smooth enough, reduces UI churn)
        
        // Console logging throttling
        this.lastConsoleLog = new Map(); // Track last log time per download
        this.consoleLogThrottle = 5000; // Only log every 5 seconds per download
    }

    // Generate unique download ID
    generateId() {
        return `download_${this.nextId++}_${Date.now()}`;
    }
    
    // Throttled console logging to prevent UI lag
    throttledLog(downloadId, ...args) {
        const now = Date.now();
        const lastLog = this.lastConsoleLog.get(downloadId) || 0;
        
        if (now - lastLog >= this.consoleLogThrottle) {
            console.log(...args);
            this.lastConsoleLog.set(downloadId, now);
        }
    }
    
    // Clean up console log tracking for completed downloads
    cleanupThrottledLogging(downloadId) {
        this.lastConsoleLog.delete(downloadId);
    }

    // Add download to queue
    addToQueue(url, format, title = null, resolvedMethod = null, resolvedType = null) {
        // Use resolved method if provided, otherwise detect download type
        let downloadType;
        
        if (resolvedMethod && resolvedType) {
            // Use the resolved method/type from URL resolution
            console.log(`[QUEUE] Using resolved method: ${resolvedMethod}, type: ${resolvedType}`);
            
            if (resolvedType === 'magnet') {
                downloadType = 'magnet';
            } else if (resolvedType === 'torrent') {
                downloadType = 'torrent';
            } else if (resolvedMethod === 'aria2c') {
                downloadType = 'file';
            } else {
                downloadType = 'video'; // yt-dlp
            }
        } else {
            // Fallback to original detection logic
            const isMagnet = url.startsWith('magnet:');
            const isTorrent = url.toLowerCase().endsWith('.torrent');
            
            // Check if URL is a direct file download based on extension
            const isDirectFile = isDirectFileDownload(url);
            
            if (isMagnet) {
                downloadType = 'magnet';
            } else if (isTorrent) {
                downloadType = 'torrent';
            } else if (isDirectFile) {
                downloadType = 'file';
            } else {
                // If not a direct file, assume it's a video/media site and let yt-dlp try to handle it
                // yt-dlp supports 1000+ sites, so we default to 'video' and let it determine capability
                downloadType = 'video';
            }
        }
        
        console.log(`[QUEUE] Adding download - URL: ${url}`);
        console.log(`[QUEUE] Detection - method: ${resolvedMethod || 'auto'}, type: ${downloadType}`);
        
        const download = {
            id: this.generateId(),
            url,
            format,
            title: title || (downloadType === 'video' ? url : `${downloadType.charAt(0).toUpperCase() + downloadType.slice(1)} Download`),
            status: 'queued',
            progress: 0,
            speed: null,
            eta: null,
            size: null,
            error: null,
            addedAt: new Date(),
            startedAt: null,
            completedAt: null,
            retryCount: 0,
            process: null,
            downloadType: downloadType,
            // Torrent-specific fields (consistent for both magnet and .torrent)
            uploadSpeed: null,
            seeds: null,
            leechers: null,
            peers: 0, // Initialize to 0 instead of null for consistent display
            ratio: null
        };

        console.log(`[QUEUE] Created download object:`, {
            id: download.id,
            url: download.url,
            downloadType: download.downloadType,
            format: download.format
        });
        
        this.queue.push(download);
        this.emit('queueUpdated');
        this.broadcastUpdate();
        this.autoSaveState(); // Save state after adding to queue

        // Always process queue if enabled (autoStart should be true by default)
        if (this.queueEnabled) {
            this.processQueue();
        }

        return download.id;
    }

    // Process the queue
    processQueue() {
        if (!this.queueEnabled) {
            console.log('[QUEUE] Queue processing disabled');
            return;
        }

        // Use global settings for max concurrent downloads
        const maxConcurrent = settings.maxConcurrentDownloads || 3;
        const activeCount = this.activeDownloads.size;
        let activeTorrentCount = Array.from(this.activeDownloads.values()).filter(d => d.downloadType === 'torrent' || d.downloadType === 'magnet').length;

        console.log(`[QUEUE] Processing queue - Active: ${activeCount}/${maxConcurrent} (${activeTorrentCount} torrents), Queued: ${this.queue.filter(d => d.status === 'queued').length}`);

        if (activeCount >= maxConcurrent) {
            console.log('[QUEUE] Max concurrent downloads reached');
            return;
        }

        // Limit torrents to prevent resource exhaustion (max 2 concurrent torrents)
        const nextTorrent = this.queue.find(d => d.status === 'queued' && (d.downloadType === 'torrent' || d.downloadType === 'magnet'));
        if (nextTorrent && activeTorrentCount >= 2) {
            console.log('[QUEUE] Max concurrent torrents reached (2), prioritizing video downloads');
            // Continue to start video downloads instead
        }

        // Prioritize video downloads when torrent limit is reached
        let queuedDownloads = this.queue.filter(d => d.status === 'queued');
        
        if (activeTorrentCount >= 2) {
            // Prioritize video downloads over torrents
            queuedDownloads = queuedDownloads.filter(d => d.downloadType !== 'torrent' && d.downloadType !== 'magnet')
                .concat(queuedDownloads.filter(d => d.downloadType === 'torrent' || d.downloadType === 'magnet'));
        }
        
        const toStart = Math.min(queuedDownloads.length, maxConcurrent - activeCount);

        if (toStart === 0) {
            console.log('[QUEUE] No downloads to start');
            return;
        }

        console.log(`[QUEUE] Starting ${toStart} downloads`);
        let started = 0;
        for (const download of queuedDownloads) {
            if (started >= toStart) break;
            
            // Check torrent limit before starting
            if ((download.downloadType === 'torrent' || download.downloadType === 'magnet') && activeTorrentCount >= 2) {
                console.log(`[QUEUE] Skipping torrent ${download.id} - limit reached`);
                continue;
            }
            
            this.startDownload(download);
            started++;
            
            // Update torrent count for next iteration
            if (download.downloadType === 'torrent' || download.downloadType === 'magnet') {
                activeTorrentCount++;
            }
        }
    }

    // Start a specific download
    async startDownload(download) {
        if (this.activeDownloads.has(download.id)) return;

        download.status = 'starting';
        download.startedAt = new Date();
        this.activeDownloads.set(download.id, download);
        this.broadcastUpdate();

        try {
            await this.executeDownload(download);
        } catch (error) {
            console.error(`Download ${download.id} failed:`, error);
            this.handleDownloadError(download, error.message);
        }
    }

    // Execute the actual download
    async executeDownload(download, freshStart = false) {
        return new Promise((resolve, reject) => {
            console.log(`[${download.id}] Executing download - Type: "${download.downloadType}", URL: ${download.url}`);
            console.log(`[${download.id}] Type check - isTorrent: ${download.downloadType === 'torrent'}, isMagnet: ${download.downloadType === 'magnet'}`);
            
            if (download.downloadType === 'torrent' || download.downloadType === 'magnet') {
                console.log(`[${download.id}] CONDITION TRUE: Routing to torrent download handler`);
                // Check if we should use torrent-stream or aria2c
                const useTorrentStream = settings.torrentEngine === 'webtorrent';
                if (useTorrentStream) {
                    console.log(`[${download.id}] Using torrent-stream engine`);
                    if (download.downloadType === 'torrent' && download.url.startsWith('http')) {
                        // For .torrent URLs, download the file first
                        this.downloadTorrentFile(download, resolve, reject);
                    } else {
                        // For magnet links or local .torrent files
                        console.log(`[${download.id}] Setting torrentBuffer for magnet/local torrent`);
                        download.torrentBuffer = download.url; // Set the URL as torrentBuffer for magnet links
                        this.executeTorrentStreamDownload(download, resolve, reject);
                    }
                } else {
                    console.log(`[${download.id}] Using aria2c engine`);
                    this.executeTorrentDownload(download, resolve, reject).catch(reject);
                }
            } else if (download.downloadType === 'file') {
                console.log(`[${download.id}] Routing to file download handler`);
                this.executeFileDownload(download, resolve, reject);
            } else {
                console.log(`[${download.id}] CONDITION FALSE: Routing to video download handler (downloadType: "${download.downloadType}")`);
                this.executeVideoDownload(download, resolve, reject, freshStart);
            }
        });
    }

    // Execute video download using yt-dlp
    executeVideoDownload(download, resolve, reject, freshStart = false, http403Workaround = false) {
        logger.info('YT-DLP', `Starting video download for ${download.id}`, {
            url: download.url,
            format: download.format,
            downloadId: download.id,
            freshStart: freshStart,
            retryCount: download.retryCount || 0,
            http403Workaround
        });
        
        let formatString = download.format || 'best';
        
        // Handle format selection
        if (download.format && download.format !== 'best' && download.format.match(/^\d+$/)) {
            formatString = `${download.format}+bestaudio[ext=m4a]/${download.format}+bestaudio/best`;
        } else if (download.format === 'best' || !download.format) {
            // Improved best quality format string that prioritizes highest resolution video+audio
            // regardless of container format (mp4, webm, etc.), then falls back gracefully:
            // 1. bestvideo+bestaudio: Best video + best audio (separate streams merged)
            // 2. best[height>=1080]: Best pre-merged format 1080p or higher
            // 3. best[height>=720]: Best pre-merged format 720p or higher
            // 4. best: Overall best available format as final fallback
            formatString = 'bestvideo+bestaudio/best[height>=1080]/best[height>=720]/best';
        }
        
        const outputDir = settings.downloadDir;
        const useExternalDownloader = false; // Keep disabled for videos for now
        
        const args = [
            '-f', formatString,
            '-o', path.join(outputDir, '%(title)s.%(ext)s'),
            '--merge-output-format', settings.outputFormat,
            '--no-warnings',
            '--newline',
            '--progress',
            '--console-title',
            '--verbose',
            // extractor args appended below (may vary based on retry profile)
        ];

        // Optional 403 workaround: retry once with browser-like headers/UA
        if (http403Workaround) {
            const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
            args.push('--user-agent', chromeUA);
            args.push('--add-header', 'Accept-Language: en-US,en;q=0.9');

            try {
                const u = new URL(download.url);
                const origin = `${u.protocol}//${u.host}`;
                args.push('--add-header', `Referer: ${origin}/`);
                args.push('--add-header', `Origin: ${origin}`);
            } catch {
                // ignore URL parse failures
            }

            // Be a bit more persistent on flaky/blocked hosts
            args.push('--retries', '5');
            args.push('--fragment-retries', '5');
            args.push('--extractor-retries', '2');
        }

        // Handle missing PO tokens gracefully; on 403 retry, prefer android client (often less brittle)
        const extractorArgs = http403Workaround
            ? 'youtube:formats=missing_pot,player_client=android'
            : 'youtube:formats=missing_pot';
        args.push('--extractor-args', extractorArgs);
        
        // Only add continue option if not a fresh start and no previous failures
        if (!freshStart && (!download.error || !download.error.includes('no such option'))) {
            args.splice(4, 0, '-c'); // Insert continue option after output format
            logger.debug('YT-DLP', `${download.id} using continue option for resume`, {
                downloadId: download.id
            });
        } else {
            logger.info('YT-DLP', `${download.id} starting fresh download`, {
                downloadId: download.id,
                reason: freshStart ? 'Fresh start requested' : 'Previous option error detected'
            });
        }
        
        // Add external downloader only if enabled
        if (useExternalDownloader) {
            args.push('--external-downloader', 'aria2c');
            args.push('--external-downloader-args', `-x ${settings.connections} -s ${settings.segments} -k ${settings.segmentSize} --summary-interval=1`);
        }
        
        // Only add write-info-json if metadata is enabled
        if (settings.saveMetadata) {
            args.push('--write-info-json');
        }
        
        if (settings.cookieFile) {
            args.push('--cookies', settings.cookieFile);
        }
        
        args.push(download.url);

        logger.debug('YT-DLP', `Executing yt-dlp with args`, {
            downloadId: download.id,
            executable: path.join(depPath, 'yt-dlp.exe'),
            args: args,
            workingDir: outputDir
        });

        const ytDlp = spawn(path.join(depPath, 'yt-dlp.exe'), args);
        download.process = ytDlp;
        download.status = 'downloading';
        this.broadcastUpdate();

        let lastProgressTime = Date.now();

        ytDlp.stdout.on('data', (data) => {
            const output = data.toString();
            
            // Enhanced logging: Log all output with structured data
            logger.debug('YT-DLP', `${download.id} STDOUT`, {
                downloadId: download.id,
                output: output.trim(),
                currentStatus: download.status,
                currentProgress: download.progress
            });
            
            // Check for download progress from yt-dlp or aria2c
            if (output.includes('[download]') || 
                output.includes('%') || 
                output.includes('ETA') ||
                output.includes('MiB/s') ||
                output.includes('KiB/s') ||
                output.includes('GiB/s')) {
                
                const oldProgress = download.progress;
                const progressUpdated = this.parseProgress(download, output);
                
                // Update UI more frequently - every 100ms or when progress changes
                const now = Date.now();
                const timePassed = now - lastProgressTime > 100;
                
                if (timePassed || progressUpdated) { // Update every 100ms or immediately on progress change
                    this.throttledBroadcastUpdate();
                    lastProgressTime = now;
                }
            } else if (output.includes('[ffmpeg]') || 
                      output.includes('Merging formats') || 
                      output.includes('Deleting original file') ||
                      output.includes('Post-processing')) {
                // Post-processing phase - only if we were downloading
                if (download.status === 'downloading' && download.progress >= 95) {
                    download.status = 'processing';
                    download.progress = 99; // Show 99% during post-processing
                    console.log(`[${download.id}] Entering post-processing phase`);
                    this.broadcastUpdate(); // Immediate update for status change
                }
            }
        });

        ytDlp.stderr.on('data', (data) => {
            const error = data.toString();
            
            // Enhanced logging: Always log stderr with context
            logger.warn('YT-DLP', `${download.id} STDERR`, {
                downloadId: download.id,
                stderr: error.trim(),
                currentStatus: download.status,
                url: download.url
            });
            
            // Capture all stderr output as potential error, not just specific keywords
            // This will help identify actual failure reasons
            if (!download.stderrOutput) {
                download.stderrOutput = '';
            }
            download.stderrOutput += error;
            
            // Check for explicit error patterns that indicate failure
            // Exclude debug warnings and informational messages which are not actual errors
            const isDebugWarning = error.includes('[debug]') || 
                                  error.includes('PO Token') || 
                                  error.includes('formats=missing_pot') ||
                                  error.includes('Invoking hlsnative downloader') ||
                                  error.includes('ios client https formats require');
            const isActualError = (error.includes('ERROR') || error.includes('CRITICAL') || error.includes('Failed') || 
                error.includes('Unable to') || error.includes('not available') || error.includes('Permission denied') ||
                error.includes('403') || error.includes('404') || error.includes('network') || error.includes('timeout')) && !isDebugWarning;
            
            if (isActualError) {
                download.error = error.trim();
                logger.error('YT-DLP', `${download.id} Error detected`, {
                    downloadId: download.id,
                    error: error.trim(),
                    url: download.url
                });
            } else {
                // Some tools output progress info to stderr
                const progressUpdated = this.parseProgress(download, error);
                if (progressUpdated) {
                    this.throttledBroadcastUpdate(); // Throttled (stderr can be chatty)
                }
            }
        });

        ytDlp.on('close', (code) => {
            download.process = null;
            
            logger.info('YT-DLP', `${download.id} process closed`, {
                downloadId: download.id,
                exitCode: code,
                currentStatus: download.status,
                progress: download.progress,
                url: download.url,
                hasError: !!download.error,
                stderrOutput: download.stderrOutput
            });
            
            if (code === 0) {
                // Check if download actually completed successfully
                if (download.status === 'downloading' && download.progress >= 95) {
                    // File was downloaded, now check if post-processing is needed
                    console.log(`[${download.id}] Download finished, checking for post-processing...`);
                    download.status = 'processing';
                    this.broadcastUpdate();
                    
                    // Brief delay to allow post-processing detection, then complete
                    setTimeout(() => {
                        console.log(`[${download.id}] Post-processing complete, marking as finished`);
                        this.completeDownload(download);
                    }, 500);
                } else if (download.status === 'processing') {
                    // Already in processing, complete it
                    this.completeDownload(download);
                } else if (download.status === 'completed') {
                    // Already completed (file existed), nothing to do
                    console.log(`[${download.id}] Already marked as completed`);
                } else {
                    // Process closed but download may not have completed properly
                    console.log(`[${download.id}] Process closed unexpectedly, status: ${download.status}, progress: ${download.progress}%`);
                    if (download.progress >= 90) {
                        // Assume it completed
                        this.completeDownload(download);
                    } else {
                        // Treat as error
                        this.handleDownloadError(download, 'Download process ended prematurely');
                    }
                }
                resolve();
            } else {
                // Use the most detailed error information available
                const errorMessage = download.error || 
                                   (download.stderrOutput ? download.stderrOutput.trim().split('\n').pop() : '') || 
                                   `Process exited with code ${code}`;
                
                logger.error('YT-DLP', `${download.id} download failed`, {
                    downloadId: download.id,
                    exitCode: code,
                    errorMessage,
                    fullStderrOutput: download.stderrOutput,
                    url: download.url,
                    format: download.format
                });
                
                // Check if this is an option error and we haven't tried fresh start yet
                if ((errorMessage.includes('no such option') || errorMessage.includes('unrecognized arguments')) 
                    && !download.freshStartAttempted) {
                    
                    logger.info('YT-DLP', `${download.id} retrying with fresh start due to option error`, {
                        downloadId: download.id,
                        originalError: errorMessage
                    });
                    
                    // Mark that we've attempted fresh start to avoid infinite loops
                    download.freshStartAttempted = true;
                    download.error = null;
                    download.stderrOutput = '';
                    
                    // Retry with fresh start (no continue option)
                    this.executeVideoDownload(download, resolve, reject, true, http403Workaround);
                    return;
                }

                // Retry once on HTTP 403 with browser-like headers/UA
                const fullErrorText = `${errorMessage}\n${download.stderrOutput || ''}`;
                const is403 = fullErrorText.includes('HTTP Error 403') || fullErrorText.includes('403: Forbidden') || fullErrorText.includes(' 403 ') || fullErrorText.includes('403 Forbidden');
                if (is403 && !download.http403Attempted) {
                    download.http403Attempted = true;
                    download.error = null;
                    download.stderrOutput = '';

                    logger.info('YT-DLP', `${download.id} retrying once due to HTTP 403`, {
                        downloadId: download.id,
                        url: download.url
                    });

                    // Force a fresh start for the 403 retry to avoid partial resume weirdness
                    this.executeVideoDownload(download, resolve, reject, true, true);
                    return;
                }

                // If still 403, replace noisy traceback with an actionable message
                if (is403) {
                    const friendly = 'HTTP 403: Forbidden. The site blocked the download. Try updating yt-dlp (Settings → Dependencies) or providing cookies (Settings → Cookies).';
                    download.error = friendly;
                    this.handleDownloadError(download, friendly);
                    reject(new Error(friendly));
                    return;
                }
                
                this.handleDownloadError(download, errorMessage);
                reject(new Error(errorMessage));
            }
        });

        ytDlp.on('error', (error) => {
            download.process = null;
            
            logger.error('YT-DLP', `${download.id} process error`, {
                downloadId: download.id,
                error: error.message,
                stack: error.stack,
                url: download.url,
                executable: path.join(depPath, 'yt-dlp.exe')
            });
            
            this.handleDownloadError(download, error.message);
            reject(error);
        });
    }

    // Test aria2c BitTorrent functionality with a known working torrent
    async testAria2cBitTorrent() {
        console.log(`[TEST] Testing aria2c BitTorrent functionality...`);
        
        try {
            // Use a well-known, legal torrent (Ubuntu ISO) for testing
            const testMagnet = 'magnet:?xt=urn:btih:5a8a1e5b0c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f&dn=test';
            
            // Test aria2c with minimal configuration
            const testArgs = [
                '--dry-run=true',  // Don't actually download
                '--bt-metadata-only=true',  // Only get metadata
                '--enable-dht=true',
                '--listen-port=0',
                '--summary-interval=1',
                '--console-log-level=info',
                '--timeout=30',
                testMagnet
            ];
            
            console.log(`[TEST] Running aria2c test with args:`, testArgs);
            
            const testProcess = spawn(path.join(depPath, 'aria2c.exe'), testArgs);
            
            return new Promise((resolve) => {
                let hasOutput = false;
                
                testProcess.stdout.on('data', (data) => {
                    hasOutput = true;
                    console.log(`[TEST] aria2c test output:`, data.toString().trim());
                });
                
                testProcess.stderr.on('data', (data) => {
                    console.log(`[TEST] aria2c test stderr:`, data.toString().trim());
                });
                
                testProcess.on('close', (code) => {
                    console.log(`[TEST] aria2c test completed with code: ${code}`);
                    resolve(hasOutput && code === 0);
                });
                
                // Kill test after 30 seconds
                setTimeout(() => {
                    testProcess.kill();
                    resolve(false);
                }, 30000);
            });
        } catch (error) {
            console.log(`[TEST] aria2c test failed:`, error.message);
            return false;
        }
    }
    
    // Execute torrent download using aria2c
    async executeTorrentDownload(download, resolve, reject) {
        logger.info('ARIA2C', `Starting torrent download for ${download.id}`, {
            downloadId: download.id,
            downloadType: download.downloadType,
            url: download.url,
            outputDir: settings.downloadDir
        });
        
        // For magnet links, log some diagnostic info
        if (download.downloadType === 'magnet') {
            console.log(`[${download.id}] MAGNET LINK ANALYSIS:`);
            console.log(`[${download.id}] - URL length: ${download.url.length} chars`);
            console.log(`[${download.id}] - Has info hash: ${download.url.includes('xt=urn:btih:')}`);
            console.log(`[${download.id}] - Has display name: ${download.url.includes('dn=')}`);
            console.log(`[${download.id}] - Has trackers: ${download.url.includes('tr=')}`);
            
            // If magnet has no trackers, it relies entirely on DHT
            if (!download.url.includes('tr=')) {
                console.log(`[${download.id}] WARNING: Magnet link has no trackers, relies entirely on DHT`);
                console.log(`[${download.id}] TIP: Magnet links with trackers work better with aria2c`);
            }
        }
        
        const outputDir = settings.downloadDir;
        let args = [];
        
        // Set a timeout for stuck downloads (10 minutes for metadata, 30 minutes for actual download)
        const isMetadataPhase = download.downloadType === 'magnet';
        const timeoutDuration = isMetadataPhase ? 10 * 60 * 1000 : 30 * 60 * 1000;
        let downloadTimeout = null;
        
        if (download.downloadType === 'torrent') {
            // For .torrent files, download the torrent file first if it's a URL
            if (download.url.startsWith('http')) {
                // Download .torrent file first, then process it
                args = [
                    '--continue=true',
                    '--max-connection-per-server=16',
                    '--split=16',
                    '--dir=' + outputDir,
                    '--follow-torrent=true',
                    '--enable-dht=true',
                    '--bt-enable-lpd=true',
                    '--bt-max-peers=100',
                    '--bt-request-peer-speed-limit=50K',
                    '--bt-tracker-connect-timeout=60',
                    '--bt-tracker-timeout=60',
                    '--bt-tracker-interval=300',
                    '--seed-time=0',
                    '--summary-interval=1',
                    '--console-log-level=info',
                    '--log-level=info',
                    '--disable-ipv6=true',
                    download.url
                ];
            } else {
                // Local .torrent file
                args = [
                    '--continue=true',
                    '--max-connection-per-server=16',
                    '--split=16',
                    '--dir=' + outputDir,
                    '--follow-torrent=true',
                    '--enable-dht=true',
                    '--bt-enable-lpd=true',
                    '--bt-max-peers=100',
                    '--bt-request-peer-speed-limit=50K',
                    '--bt-tracker-connect-timeout=60',
                    '--bt-tracker-timeout=60',
                    '--bt-tracker-interval=300',
                    '--seed-time=0',
                    '--summary-interval=1',
                    '--console-log-level=info',
                    '--log-level=info',
                    '--disable-ipv6=true',
                    download.url
                ];
            }
        } else {
            // Magnet link - use simplified configuration more like qBittorrent
            args = [
                '--continue=true',
                '--dir=' + outputDir,
                // Core BitTorrent settings
                '--enable-dht=true',
                '--bt-enable-lpd=true',
                '--enable-peer-exchange=true',
                
                // Use dynamic port allocation instead of fixed range
                '--listen-port=0',  // Let aria2c choose available port
                '--dht-listen-port=0',  // Let aria2c choose available DHT port
                
                // Simplified peer settings
                '--bt-max-peers=50',  // Reduce from 200 to be less aggressive
                '--bt-request-peer-speed-limit=50K',
                '--bt-min-crypto-level=plain',  // Allow unencrypted connections
                '--bt-require-crypto=false',
                '--bt-force-encryption=false',
                
                // Tracker settings
                '--bt-tracker-connect-timeout=60',
                '--bt-tracker-timeout=60',
                '--bt-tracker-interval=300',
                '--bt-stop-timeout=0',
                
                // Metadata and file handling
                '--bt-save-metadata=true',
                '--bt-metadata-only=false',
                '--follow-torrent=mem',
                '--allow-overwrite=false',
                '--check-integrity=false',
                
                // Use standard client identification
                '--peer-id-prefix=-AR2700-',  // aria2 1.27.0 style
                '--user-agent=aria2/1.37.0',
                
                // DHT bootstrap - use only reliable nodes
                '--dht-entry-point=router.bittorrent.com:6881',
                '--dht-entry-point=dht.transmissionbt.com:6881',
                
                // Network settings
                '--disable-ipv6=false',  // Try IPv6 as well
                '--bt-external-ip=',  // Auto-detect external IP
                
                // Download settings
                '--seed-time=0',  // Don't seed
                '--summary-interval=2',
                '--console-log-level=info',  // Reduce noise
                '--log-level=info',
                
                // Connection limits
                '--max-connection-per-server=5',
                '--split=1',  // Don't split torrent downloads
                '--connect-timeout=60',
                '--timeout=60',
                
                download.url
            ];
        }

        logger.debug('ARIA2C', `Executing aria2c with args`, {
            downloadId: download.id,
            executable: path.join(depPath, 'aria2c.exe'),
            args: args,
            workingDir: outputDir
        });
        
        const aria2c = spawn(path.join(depPath, 'aria2c.exe'), args);
        download.process = aria2c;
        
        // Set initial status based on download type
        if (download.downloadType === 'magnet') {
            download.status = 'starting'; // Finding peers phase
        } else {
            download.status = 'downloading';
        }
        this.broadcastUpdate();

        let lastProgressTime = Date.now();

        aria2c.stdout.on('data', (data) => {
            const output = data.toString();
            
            logger.debug('ARIA2C', `${download.id} STDOUT`, {
                downloadId: download.id,
                output: output.trim(),
                currentStatus: download.status,
                currentProgress: download.progress
            });
            
            const progressUpdated = this.parseTorrentProgress(download, output);
            
            // Update UI more frequently - every 100ms or when progress changes
            const now = Date.now();
            const timePassed = now - lastProgressTime > 100;
            
            if (timePassed || progressUpdated) {
                this.throttledBroadcastUpdate();
                lastProgressTime = now;
            }
        });

        aria2c.stderr.on('data', (data) => {
            const error = data.toString();
            
            logger.warn('ARIA2C', `${download.id} STDERR`, {
                downloadId: download.id,
                stderr: error.trim(),
                currentStatus: download.status,
                downloadType: download.downloadType,
                url: download.url
            });
            
            // Enhanced network debugging with specific categories
            if (error.includes('DHT') || error.includes('dht')) {
                console.log(`[${download.id}] DHT DEBUG:`, error.trim());
            }
            if (error.includes('tracker') || error.includes('announce')) {
                console.log(`[${download.id}] TRACKER DEBUG:`, error.trim());
            }
            if (error.includes('peer') || error.includes('Peer') || error.includes('connection')) {
                console.log(`[${download.id}] PEER DEBUG:`, error.trim());
            }
            if (error.includes('listen') || error.includes('port') || error.includes('bind')) {
                console.log(`[${download.id}] PORT DEBUG:`, error.trim());
            }
            if (error.includes('timeout') || error.includes('refused') || error.includes('unreachable')) {
                console.log(`[${download.id}] CONNECTIVITY DEBUG:`, error.trim());
            }
            if (error.includes('bootstrap') || error.includes('entry-point')) {
                console.log(`[${download.id}] BOOTSTRAP DEBUG:`, error.trim());
            }
            
            // Capture all stderr output like yt-dlp
            if (!download.stderrOutput) {
                download.stderrOutput = '';
            }
            download.stderrOutput += error;
            
            // Enhanced error detection for aria2c
            if (error.includes('ERROR') || error.includes('CRITICAL') || error.includes('Failed') || 
                error.includes('Unable to') || error.includes('not available') || error.includes('Permission denied') ||
                error.includes('403') || error.includes('404') || error.includes('network') || error.includes('timeout')) {
                download.error = error.trim();
                logger.error('ARIA2C', `${download.id} Error detected`, {
                    downloadId: download.id,
                    error: error.trim(),
                    url: download.url
                });
            } else {
                // Some tools output progress info to stderr, try parsing it
                const progressUpdated = this.parseTorrentProgress(download, error);
                if (progressUpdated) {
                    this.throttledBroadcastUpdate();
                }
            }
        });

        aria2c.on('close', (code) => {
            download.process = null;
            if (downloadTimeout) {
                clearTimeout(downloadTimeout);
                downloadTimeout = null;
            }
            
            logger.info('ARIA2C', `${download.id} process closed`, {
                downloadId: download.id,
                exitCode: code,
                currentStatus: download.status,
                progress: download.progress,
                downloadType: download.downloadType,
                url: download.url,
                hasError: !!download.error,
                stderrOutput: download.stderrOutput
            });
            
            if (code === 0) {
                this.completeDownload(download);
                resolve();
            } else {
                // Use the most detailed error information available
                const errorMessage = download.error || 
                                   (download.stderrOutput ? download.stderrOutput.trim().split('\n').pop() : '') || 
                                   `Process exited with code ${code}`;
                
                logger.error('ARIA2C', `${download.id} download failed`, {
                    downloadId: download.id,
                    exitCode: code,
                    errorMessage,
                    fullStderrOutput: download.stderrOutput,
                    url: download.url,
                    downloadType: download.downloadType
                });
                
                this.handleDownloadError(download, errorMessage);
                reject(new Error(errorMessage));
            }
        });
        
        // Set timeout for stuck downloads - more aggressive for testing
        downloadTimeout = setTimeout(() => {
            console.log(`[${download.id}] TIMEOUT: Download stuck for ${timeoutDuration/1000}s, investigating...`);
            
            // If it's a magnet link with no progress after timeout, try fallback
            if (download.downloadType === 'magnet' && download.progress === 0) {
                console.log(`[${download.id}] TIMEOUT ANALYSIS: Magnet link failed to connect to peers`);
                console.log(`[${download.id}] TIMEOUT ANALYSIS: CN=${download.peers || 0}, SD=${download.seeds || 0}`);
                console.log(`[${download.id}] SUGGESTION: Since qBittorrent works, this may be an aria2c configuration issue`);
                console.log(`[${download.id}] SUGGESTION: Try converting magnet to .torrent file or use qBittorrent for this download`);
                
                if (download.process) {
                    download.process.kill('SIGTERM');
                }
                this.handleDownloadError(download, 'Timeout: aria2c unable to connect to peers. Try using qBittorrent or convert magnet to .torrent file.');
                reject(new Error('Timeout: Unable to connect to peers'));
            }
        }, Math.min(timeoutDuration, 2 * 60 * 1000)); // Max 2 minutes for initial testing

        aria2c.on('error', (error) => {
            download.process = null;
            if (downloadTimeout) {
                clearTimeout(downloadTimeout);
                downloadTimeout = null;
            }
            this.handleDownloadError(download, error.message);
            reject(error);
        });
    }

    // Execute file download using aria2c
    executeFileDownload(download, resolve, reject) {
        const aria2cPath = path.join(depPath, 'aria2c.exe');
        
        console.log(`[${download.id}] FILE: Starting aria2c file download`);
        
        const outputDir = settings.downloadDir;
        
        // Get filename from URL or use download ID as fallback
        const urlObj = new URL(download.url);
        const pathname = urlObj.pathname;
        let filename = pathname.split('/').pop() || `download_${download.id}`;
        
        // If no extension, try to detect from URL or leave as-is
        if (!filename.includes('.') && urlObj.searchParams.has('filename')) {
            filename = urlObj.searchParams.get('filename');
        }
        
        // Always use the filename from URL as title for better display
        download.title = filename;
        
        const args = [
            '--continue=true',
            '--max-connection-per-server=' + (settings.connections || 16),
            '--split=' + (settings.segments || 16),
            '--min-split-size=' + (settings.segmentSize || '1M'),
            '--dir=' + outputDir,
            '--out=' + filename,
            '--file-allocation=none',
            '--retry-wait=3',
            '--max-tries=5',
            '--timeout=60',
            '--connect-timeout=30',
            '--summary-interval=1',
            '--console-log-level=info',
            '--log-level=info',
            '--disable-ipv6=true',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            download.url
        ];

        console.log(`[${download.id}] FILE: aria2c command:`, aria2cPath, args.join(' '));

        download.status = 'downloading';
        download.startedAt = new Date();
        this.broadcastUpdate();
        
        const aria2c = spawn(aria2cPath, args, {
            stdio: ['pipe', 'pipe', 'pipe']
        });

        download.process = aria2c;
        
        let lastProgressTime = Date.now();
        let downloadComplete = false;

        aria2c.stdout.on('data', (data) => {
            const output = data.toString();
            console.log(`[${download.id}] FILE: aria2c stdout:`, output);
            
            // Parse aria2c progress output
            const lines = output.split('\n');
            lines.forEach(line => {
                // Look for download progress patterns
                if (line.includes('(') && line.includes('%)')) {
                    const progressMatch = line.match(/\((\d+)%\)/);
                    if (progressMatch) {
                        download.progress = parseInt(progressMatch[1]);
                    }
                }
                
                // Look for speed information
                const speedMatch = line.match(/DL:(\S+)/);
                if (speedMatch) {
                    download.speed = speedMatch[1];
                }
                
                // Look for file size
                const sizeMatch = line.match(/SIZE:(\S+)/);
                if (sizeMatch) {
                    download.size = sizeMatch[1];
                }
                
                // Check for completion
                if (line.includes('Download complete')) {
                    downloadComplete = true;
                }
            });
            
            this.broadcastUpdate();
        });

        aria2c.stderr.on('data', (data) => {
            const errorOutput = data.toString();
            console.log(`[${download.id}] FILE: aria2c stderr:`, errorOutput);
            
            // Check if it's actually a torrent file that was downloaded
            if (errorOutput.includes('.torrent') || errorOutput.toLowerCase().includes('bittorrent')) {
                console.log(`[${download.id}] FILE: Detected torrent file download, checking if we should process as torrent`);
                
                // Check if the downloaded file is a torrent
                const downloadedFile = path.join(outputDir, filename);
                if (fs.existsSync(downloadedFile) && filename.endsWith('.torrent')) {
                    console.log(`[${download.id}] FILE: Downloaded .torrent file, switching to torrent processing`);
                    
                    // Update download type and reprocess
                    download.downloadType = 'torrent';
                    download.url = downloadedFile;
                    download.status = 'queued';
                    download.progress = 0;
                    download.speed = null;
                    download.process = null;
                    
                    this.broadcastUpdate();
                    
                    // Re-execute as torrent download
                    this.executeDownload(download).then(resolve).catch(reject);
                    return;
                }
            }
        });

        aria2c.on('close', (code) => {
            download.process = null;
            
            console.log(`[${download.id}] FILE: aria2c process closed with code ${code}`);
            
            if (code === 0 || downloadComplete) {
                download.status = 'completed';
                download.progress = 100;
                download.completedAt = new Date();
                download.speed = null;
                
                console.log(`[${download.id}] FILE: Download completed successfully`);
                
                logger.info('ARIA2C-FILE', `${download.id} completed successfully`, {
                    downloadId: download.id,
                    url: download.url,
                    outputFile: filename,
                    downloadType: 'file'
                });
                
                this.broadcastUpdate();
                this.autoSaveState();
                resolve(download);
            } else {
                const errorMessage = `aria2c exited with code ${code}`;
                download.error = errorMessage;
                download.status = 'error';
                
                console.log(`[${download.id}] FILE: Download failed - ${errorMessage}`);
                
                logger.error('ARIA2C-FILE', `${download.id} failed`, {
                    downloadId: download.id,
                    error: errorMessage,
                    exitCode: code,
                    url: download.url
                });
                
                this.broadcastUpdate();
                this.autoSaveState();
                reject(new Error(errorMessage));
            }
        });

        aria2c.on('error', (error) => {
            download.process = null;
            download.error = error.message;
            download.status = 'error';
            
            console.log(`[${download.id}] FILE: aria2c process error:`, error);
            
            logger.error('ARIA2C-FILE', `${download.id} process error`, {
                downloadId: download.id,
                error: error.message,
                stack: error.stack,
                url: download.url
            });
            
            this.broadcastUpdate();
            this.autoSaveState();
            reject(error);
        });
    }

    // Download .torrent file first, then process it
    async downloadTorrentFile(download, resolve, reject) {
        console.log(`[${download.id}] TORRENT FILE: Downloading .torrent file from URL`);
        
        try {
            const https = require('https');
            const http = require('http');
            const url = require('url');
            const fs = require('fs');
            
            download.status = 'starting';
            this.broadcastUpdate();
            
            const torrentUrl = new URL(download.url);
            const protocol = torrentUrl.protocol === 'https:' ? https : http;
            
            // Create temporary file for the .torrent
            const tempDir = path.join(settings.downloadDir, '.tmp');
            await fs.promises.mkdir(tempDir, { recursive: true });
            const torrentFileName = `temp_${download.id}.torrent`;
            const torrentFilePath = path.join(tempDir, torrentFileName);
            
            console.log(`[${download.id}] Downloading .torrent file to: ${torrentFilePath}`);
            
            const file = fs.createWriteStream(torrentFilePath);
            
            const request = protocol.get(download.url, (response) => {
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(torrentFilePath, () => {});
                    this.handleDownloadError(download, `Failed to download .torrent file: HTTP ${response.statusCode}`);
                    reject(new Error(`HTTP ${response.statusCode}`));
                    return;
                }
                
                response.pipe(file);
                
                file.on('finish', () => {
                    file.close();
                    console.log(`[${download.id}] .torrent file downloaded successfully`);
                    
                    // Read the .torrent file contents and pass to peerflix
                    fs.readFile(torrentFilePath, (err, torrentBuffer) => {
                        if (err) {
                            console.error(`[${download.id}] Error reading .torrent file:`, err);
                            fs.unlink(torrentFilePath, () => {});
                            this.handleDownloadError(download, `Failed to read .torrent file: ${err.message}`);
                            reject(err);
                            return;
                        }
                        
                        console.log(`[${download.id}] .torrent file read successfully, size: ${torrentBuffer.length} bytes`);
                        
                        // Validate the .torrent file has some basic structure
                        if (torrentBuffer.length < 20) {
                            console.error(`[${download.id}] .torrent file too small, likely invalid`);
                            fs.unlink(torrentFilePath, () => {});
                            this.handleDownloadError(download, 'Downloaded .torrent file appears to be invalid (too small)');
                            reject(new Error('Invalid .torrent file'));
                            return;
                        }
                        
                        // Store original URL before replacing with buffer
                        download.originalUrl = download.url;
                        download.torrentBuffer = torrentBuffer; // Store buffer separately
                        download.torrentFilePath = torrentFilePath; // Keep path for cleanup
                        this.executeTorrentStreamDownload(download, resolve, reject);
                    });
                });
            });
            
            request.on('error', (error) => {
                file.close();
                fs.unlink(torrentFilePath, () => {});
                console.error(`[${download.id}] Error downloading .torrent file:`, error);
                this.handleDownloadError(download, `Failed to download .torrent file: ${error.message}`);
                reject(error);
            });
            
            // Timeout for .torrent file download
            request.setTimeout(30000, () => {
                request.destroy();
                file.close();
                fs.unlink(torrentFilePath, () => {});
                this.handleDownloadError(download, 'Timeout downloading .torrent file');
                reject(new Error('Timeout'));
            });
            
        } catch (error) {
            console.error(`[${download.id}] Error setting up .torrent download:`, error);
            this.handleDownloadError(download, error.message);
            reject(error);
        }
    }

    // Execute torrent download using peerflix
    executeTorrentStreamDownload(download, resolve, reject) {
        console.log(`[${download.id}] PEERFLIX: Starting download for ${download.downloadType}`);
        
        const outputDir = settings.downloadDir;
        
        try {
            console.log(`[${download.id}] Creating peerflix engine with input type: ${typeof download.torrentBuffer}`);
            if (Buffer.isBuffer(download.torrentBuffer)) {
                console.log(`[${download.id}] Using .torrent file buffer (${download.torrentBuffer.length} bytes)`);
            } else if (typeof download.torrentBuffer === 'string') {
                console.log(`[${download.id}] Using magnet/string: ${download.torrentBuffer.substring(0, 100)}...`);
            } else {
                console.log(`[${download.id}] Warning: torrentBuffer is ${typeof download.torrentBuffer}, using download.url as fallback`);
                download.torrentBuffer = download.url; // Fallback to URL if torrentBuffer is undefined
            }
            
            // Create peerflix engine
            const engine = peerflix(download.torrentBuffer, {
                path: outputDir,
                connections: 50,  // Max peer connections
                uploads: 5,       // Max upload slots
                verify: true      // Verify pieces
            });
            
            // Store engine reference for cleanup
            download.torrentEngine = engine;
            activeTorrents.set(download.id, engine);
            download.status = 'starting';
            this.broadcastUpdate();
            
            let totalLength = 0;
            let lastUpdate = Date.now();
            let lastDownloaded = 0;
            
            engine.on('ready', () => {
                console.log(`[${download.id}] Peerflix engine ready`);
                console.log(`[${download.id}] Torrent name: ${engine.torrent.name}`);
                console.log(`[${download.id}] Files: ${engine.files.length}`);
                
                totalLength = engine.torrent.length;
                
                // Update title from "Torrent Download" to actual torrent name
                const actualTitle = engine.torrent.name || 'Unknown Torrent';
                download.title = actualTitle;
                download.size = this.formatBytes(totalLength);
                download.status = 'downloading';
                
                console.log(`[${download.id}] Updated title to: "${actualTitle}"`);
                console.log(`[${download.id}] Total size: ${download.size}`);
                
                // Immediately broadcast the title update
                this.broadcastUpdate();
                
                // Select all files for download and start streaming (with error handling)
                if (engine.files && Array.isArray(engine.files)) {
                    engine.files.forEach((file, index) => {
                        try {
                            if (file && file.name && typeof file.length === 'number') {
                                this.throttledLog(download.id, `[${download.id}] File ${index}: ${file.name} (${this.formatBytes(file.length)})`);
                                
                                if (typeof file.select === 'function') {
                                    file.select();
                                }
                                
                                // Only trigger download for first few files to avoid resource exhaustion
                                if (index < 3 && typeof file.createReadStream === 'function') {
                                    this.throttledLog(download.id, `[${download.id}] Triggering download for ${file.name}`);
                                    
                                    // Create minimal read stream to trigger download start
                                    const stream = file.createReadStream({ start: 0, end: 256 }); // Read just 256 bytes
                                    
                                    // Set up error handling and auto-cleanup
                                    const cleanup = () => {
                                        try {
                                            if (!stream.destroyed) {
                                                stream.destroy();
                                            }
                                        } catch (e) {
                                            // Ignore cleanup errors
                                        }
                                    };
                                    
                                    stream.on('data', () => {
                                        this.throttledLog(download.id, `[${download.id}] Download triggered for ${file.name}`);
                                        cleanup();
                                    });
                                    
                                    stream.on('error', () => {
                                        // Ignore stream errors, they're expected
                                        cleanup();
                                    });
                                    
                                    // Auto-cleanup after 5 seconds regardless
                                    setTimeout(cleanup, 5000);
                                }
                            } else {
                                console.log(`[${download.id}] Warning: Invalid file object at index ${index}`);
                            }
                        } catch (error) {
                            console.error(`[${download.id}] Error processing file ${index}:`, error.message);
                        }
                    });
                } else {
                    console.log(`[${download.id}] Warning: engine.files is not available or not an array`);
                }
                
                // Minimal swarm event logging to reduce performance impact
                try {
                    if (engine.swarm) {
                        let peerCount = 0;
                        engine.swarm.on('wire', (wire) => {
                            peerCount++;
                            // Only log every 5th peer connection to reduce spam
                            if (peerCount % 5 === 0) {
                                const wireCount = (engine.swarm.wires && Array.isArray(engine.swarm.wires)) ? engine.swarm.wires.length : 0;
                                console.log(`[${download.id}] Peers connected: ${wireCount}`);
                            }
                        });
                        
                        let downloadCount = 0;
                        engine.swarm.on('download', (index, data) => {
                            downloadCount++;
                            // Throttle piece download logging to reduce performance impact
                            if (downloadCount % 500 === 0) { // Increased from 100 to 500
                                const dataLength = (data && typeof data.length === 'number') ? data.length : 0;
                                this.throttledLog(download.id, `[${download.id}] Downloaded ${downloadCount} pieces (last: ${this.formatBytes(dataLength)})`);
                            }
                        });
                    }
                } catch (error) {
                    console.error(`[${download.id}] Error setting up swarm events:`, error.message);
                }
                
                // Try to prioritize the beginning of files (with error handling)
                setTimeout(() => {
                    try {
                        if (engine.files && Array.isArray(engine.files) && engine.torrent) {
                            engine.files.forEach(file => {
                                if (file && typeof file.length === 'number' && typeof file.offset === 'number' && file.length > 1024 * 1024) {
                                    if (engine.torrent.pieceLength && engine.torrent.pieces && Array.isArray(engine.torrent.pieces)) {
                                        const piece = Math.floor(file.offset / engine.torrent.pieceLength);
                                        const endPiece = Math.floor((file.offset + 1024 * 1024) / engine.torrent.pieceLength);
                                        for (let i = piece; i <= endPiece && i < engine.torrent.pieces.length; i++) {
                                            if (typeof engine.critical === 'function') {
                                                engine.critical(i, i + 1);
                                            }
                                        }
                                        console.log(`[${download.id}] Set critical pieces ${piece}-${endPiece} for ${file.name}`);
                                    }
                                }
                            });
                        }
                    } catch (error) {
                        console.error(`[${download.id}] Error setting critical pieces:`, error.message);
                    }
                }, 2000); // Wait 2 seconds then prioritize
            });
            
            // Track download progress
            const progressInterval = setInterval(() => {
                if (engine.destroyed) {
                    clearInterval(progressInterval);
                    return;
                }
                
                // Calculate downloaded bytes and file completion
                let downloaded = 0;
                let totalFiles = engine.files ? engine.files.length : 0;
                let completedFiles = 0;
                
                // Use torrent.downloaded if available, otherwise sum files
                try {
                    if (engine.torrent && typeof engine.torrent.downloaded === 'number') {
                        downloaded = engine.torrent.downloaded;
                    } else if (engine.swarm && typeof engine.swarm.downloaded === 'number') {
                        downloaded = engine.swarm.downloaded;
                    } else if (engine.files && Array.isArray(engine.files)) {
                        engine.files.forEach(file => {
                            if (file && typeof file.downloaded === 'number') {
                                downloaded += file.downloaded;
                            }
                        });
                    }
                    
                    // Check file completion differently - look at actual file progress
                    if (engine.files && Array.isArray(engine.files)) {
                        engine.files.forEach(file => {
                            if (file && typeof file.length === 'number') {
                                // Check if file is selected and has progress
                                const fileProgress = file.downloaded || 0;
                                const fileComplete = fileProgress >= file.length * 0.99; // 99% threshold for completion
                                
                                if (fileComplete) {
                                    completedFiles++;
                                }
                            }
                        });
                    }
                } catch (error) {
                    console.error(`[${download.id}] Error calculating progress:`, error.message);
                    // Use last known values if calculation fails
                }
                
                const newProgress = totalLength > 0 ? Math.round((downloaded / totalLength) * 100) : 0;
                const oldProgress = download.progress || 0;
                
                this.throttledLog(download.id, `[${download.id}] Progress: ${this.formatBytes(downloaded)}/${this.formatBytes(totalLength)} (${newProgress}%), Files: ${completedFiles}/${totalFiles}`);
                
                if (newProgress !== oldProgress || Date.now() - lastUpdate > 2000) {
                    download.progress = newProgress;
                    
                    // Calculate speed
                    const now = Date.now();
                    const timeDiff = (now - lastUpdate) / 1000;
                    const bytesDiff = downloaded - lastDownloaded;
                    const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
                    
                    download.speed = this.formatBytes(speed) + '/s';
                    download.peers = (engine.swarm && engine.swarm.wires && Array.isArray(engine.swarm.wires)) ? engine.swarm.wires.length : 0;
                    
                    // Calculate upload speed properly
                    try {
                        if (engine.swarm && typeof engine.swarm.uploadSpeed === 'number' && engine.swarm.uploadSpeed > 0) {
                            download.uploadSpeed = this.formatBytes(engine.swarm.uploadSpeed) + '/s';
                        } else {
                            download.uploadSpeed = null; // Don't show 0 upload speed
                        }
                    } catch (error) {
                        download.uploadSpeed = null;
                    }
                    
                    // Calculate ratio if we have upload/download data
                    try {
                        if (engine.swarm && typeof engine.swarm.uploaded === 'number' && downloaded > 0) {
                            download.ratio = engine.swarm.uploaded / downloaded;
                        } else {
                            download.ratio = null;
                        }
                    } catch (error) {
                        download.ratio = null;
                    }
                    
                    // Don't set seeds/leechers as peerflix doesn't distinguish them reliably
                    download.seeds = null;
                    download.leechers = null;
                    
                    // Calculate ETA
                    if (speed > 0 && totalLength > downloaded) {
                        const remaining = totalLength - downloaded;
                        const etaSeconds = remaining / speed;
                        download.eta = this.formatTime(etaSeconds);
                    }
                    
                    this.throttledLog(download.id, `[${download.id}] Progress: ${newProgress}% (${download.peers} peers, ${download.speed})`);
                    
                    // Use setImmediate to defer UI updates and prevent blocking
                    setImmediate(() => {
                        this.broadcastUpdate();
                    });
                    
                    lastUpdate = now;
                    lastDownloaded = downloaded;
                }
                
                // Check if download is complete using multiple criteria
                const isComplete = (
                    // All files are marked as complete
                    (completedFiles >= totalFiles && totalFiles > 0) ||
                    // Or download shows 100% and we have data
                    (newProgress >= 100 && downloaded > 0) ||
                    // Or swarm reports as complete
                    (engine.swarm && engine.swarm.downloaded >= totalLength && totalLength > 0)
                );
                
                if (isComplete) {
                    console.log(`[${download.id}] Download complete! Files: ${completedFiles}/${totalFiles}, Progress: ${newProgress}%, Downloaded: ${this.formatBytes(downloaded)}`);
                    clearInterval(progressInterval);
                    download.progress = 100;
                    
                    // Give peerflix a moment to finish writing files
                    setTimeout(() => {
                        this.completeDownload(download);
                        resolve();
                    }, 1000);
                }
            }, 3000); // Check every 3 seconds to reduce load
            
            engine.on('idle', () => {
                console.log(`[${download.id}] Peerflix engine idle - checking if download is complete`);
                
                // More aggressive completion check
                let totalDownloaded = 0;
                let filesWithProgress = 0;
                
                if (engine.files && Array.isArray(engine.files)) {
                    engine.files.forEach(file => {
                        if (file && typeof file.downloaded === 'number') {
                            totalDownloaded += file.downloaded;
                            if (file.downloaded > 0) {
                                filesWithProgress++;
                            }
                        }
                    });
                }
                
                // Also check torrent/swarm downloaded amount
                const torrentDownloaded = engine.torrent?.downloaded || engine.swarm?.downloaded || 0;
                const actualDownloaded = Math.max(totalDownloaded, torrentDownloaded);
                
                console.log(`[${download.id}] Idle check - Downloaded: ${this.formatBytes(actualDownloaded)}/${this.formatBytes(totalLength)}, Progress: ${download.progress}%`);
                
                // Complete if we have substantial progress and engine is idle
                const shouldComplete = (
                    actualDownloaded >= totalLength * 0.95 || // 95% downloaded
                    download.progress >= 99 || // 99% progress
                    (actualDownloaded > 0 && download.progress >= 100) // Any download with 100% progress
                );
                
                if (shouldComplete) {
                    console.log(`[${download.id}] Completing download on idle (${this.formatBytes(actualDownloaded)} downloaded)`);
                    clearInterval(progressInterval);
                    download.progress = 100;
                    this.completeDownload(download);
                    resolve();
                } else {
                    console.log(`[${download.id}] Engine idle but insufficient progress - waiting...`);
                }
            });
            
            engine.on('error', (error) => {
                console.error(`[${download.id}] Peerflix engine error:`, error);
                console.error(`[${download.id}] Error stack:`, error.stack);
                clearInterval(progressInterval);
                activeTorrents.delete(download.id);
                this.handleDownloadError(download, error.message);
                reject(error);
            });
            
            // Add more event handlers for debugging (limited logging)
            let verifyCount = 0;
            engine.on('verify', () => {
                verifyCount++;
                if (verifyCount <= 3 || verifyCount % 10 === 0) {
                    console.log(`[${download.id}] Torrent verification completed (${verifyCount} pieces verified)`);
                }
            });
            
            engine.on('invalid-piece', (piece) => {
                console.log(`[${download.id}] Invalid piece detected: ${piece}`);
            });
            
            // Log when engine is destroyed
            const originalDestroy = engine.destroy;
            engine.destroy = function() {
                console.log(`[${download.id}] Peerflix engine being destroyed`);
                return originalDestroy.apply(this, arguments);
            };
            
            // Timeout handling
            const timeoutDuration = download.downloadType === 'magnet' ? 3 * 60 * 1000 : 10 * 60 * 1000;
            const downloadTimeout = setTimeout(() => {
                if (download.progress === 0) {
                    console.log(`[${download.id}] Peerflix timeout: No progress after ${timeoutDuration/1000}s`);
                    engine.destroy();
                    clearInterval(progressInterval);
                    activeTorrents.delete(download.id);
                    this.handleDownloadError(download, 'Timeout: Unable to find seeders. Try a different torrent or check if the torrent is still active.');
                    reject(new Error('Download timeout'));
                }
            }, timeoutDuration);
            
            // Clear timeout when download starts making progress
            const progressCheckInterval = setInterval(() => {
                if (download.progress > 0) {
                    clearTimeout(downloadTimeout);
                    clearInterval(progressCheckInterval);
                }
            }, 5000); // Check every 5 seconds instead of 1
            
        } catch (error) {
            console.error(`[${download.id}] Peerflix setup error:`, error);
            this.handleDownloadError(download, error.message);
            reject(error);
        }
    }
    
    // Helper method to format bytes
    formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    // Helper method to format time
    formatTime(seconds) {
        if (seconds < 60) return Math.round(seconds) + 's';
        if (seconds < 3600) return Math.round(seconds / 60) + 'm';
        return Math.round(seconds / 3600) + 'h';
    }

    // Save torrent metadata to JSON file
    async saveTorrentMetadata(download) {
        try {
            const engine = download.torrentEngine;
            if (!engine || !engine.torrent) {
                console.log(`[${download.id}] No torrent engine or torrent data available for metadata`);
                return;
            }

            const torrent = engine.torrent;
            const outputDir = settings.downloadDir;
            
            // Create metadata object similar to yt-dlp format
            const metadata = {
                // Basic torrent info
                title: torrent.name || 'Unknown Torrent',
                description: `Torrent download: ${torrent.name || 'Unknown'}`,
                uploader: 'BitTorrent Network',
                extractor: 'peerflix',
                extractor_key: 'torrent',
                webpage_url: download.originalUrl || download.url,
                webpage_url_domain: 'torrent',
                
                // Torrent-specific metadata
                info_hash: torrent.infoHash || 'unknown',
                piece_length: torrent.pieceLength || 0,
                total_pieces: torrent.pieces ? torrent.pieces.length : 0,
                total_size: torrent.length || 0,
                
                // Download info
                download_date: new Date().toISOString(),
                download_type: download.downloadType,
                duration_string: null, // Not applicable for torrents
                
                // Files information
                files: [],
                file_count: engine.files ? engine.files.length : 0,
                
                // Download statistics
                final_peer_count: download.peers || 0,
                final_upload_ratio: download.ratio || 0,
                download_time_seconds: download.completedAt && download.startedAt ? 
                    Math.round((download.completedAt - download.startedAt) / 1000) : null,
                
                // Tracker information
                announce_list: [],
                
                // Format info (similar to video downloads)
                format: 'torrent',
                format_id: 'torrent',
                ext: null, // Will be determined by main file
                
                // Thumbnail (use a default torrent icon or first image file if available)
                thumbnail: null
            };
            
            // Add file information
            if (engine.files && Array.isArray(engine.files)) {
                engine.files.forEach((file, index) => {
                    if (file && file.name && typeof file.length === 'number') {
                        metadata.files.push({
                            filename: file.name,
                            size: file.length,
                            path: file.path || file.name,
                            offset: file.offset || 0,
                            index: index
                        });
                        
                        // Set main file extension from largest file
                        if (index === 0 || file.length > (metadata.filesize || 0)) {
                            const ext = path.extname(file.name).toLowerCase().slice(1);
                            if (ext) {
                                metadata.ext = ext;
                                metadata.filesize = file.length;
                            }
                        }
                    }
                });
            }
            
            // Add tracker information if available
            if (torrent.announce && Array.isArray(torrent.announce)) {
                metadata.announce_list = torrent.announce.map(tracker => [tracker]);
            } else if (torrent.announce && typeof torrent.announce === 'string') {
                metadata.announce_list = [[torrent.announce]];
            }
            
            // Create filename for metadata (use torrent name or fallback)
            const torrentName = torrent.name || `torrent_${torrent.infoHash?.substring(0, 8) || download.id}`;
            const safeFilename = torrentName.replace(/[<>:"/\|?*]/g, '_'); // Remove invalid filename chars
            const metadataPath = path.join(outputDir, `${safeFilename}.info.json`);
            
            // Write metadata file
            await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
            console.log(`[${download.id}] Torrent metadata saved to: ${metadataPath}`);
            
        } catch (error) {
            console.error(`[${download.id}] Error saving torrent metadata:`, error);
        }
    }

    // Parse torrent progress information from aria2c
    parseTorrentProgress(download, output) {
        let progressUpdated = false;
        
        // Debug-only: aria2c can be very chatty
        if (logger.debugEnabled && output.trim().length > 0) {
            console.log(`[${download.id}] ARIA2C OUTPUT:`, output.trim());
        }
        
        // aria2c progress format examples:
        // [#xxxxxx 123.4MiB/456.7MiB(27%) CN:8 DL:1.2MiB UL:345.6KiB ETA:5m23s]
        // [#xxxxxx SEEDING(share:1.00)]
        // BitTorrent: info hash=xxxxx
        
        // Extract percentage
        const percentMatch = output.match(/\((\d+)%\)/);
        if (percentMatch) {
            const newProgress = parseInt(percentMatch[1]);
            if (!isNaN(newProgress) && newProgress >= 0 && newProgress <= 100) {
                const oldProgress = download.progress || 0;
                if (newProgress !== oldProgress) {
                    download.progress = newProgress;
                    progressUpdated = true;
                    if (logger.debugEnabled) {
                        console.log(`[${download.id}] Torrent Progress: ${oldProgress}% → ${newProgress}%`);
                    }
                }
            }
        }

        // Extract download speed - handle multiple formats
        const dlSpeedPatterns = [
            /DL:([\d.]+(?:K|M|G)?iB\/s)/,
            /\s([\d.]+(?:K|M|G)?iB\/s)\s.*DL/,
            /download:\s*([\d.]+(?:K|M|G)?iB\/s)/i
        ];
        for (const pattern of dlSpeedPatterns) {
            const match = output.match(pattern);
            if (match) {
                download.speed = match[1];
                break;
            }
        }

        // Extract upload speed
        const ulSpeedPatterns = [
            /UL:([\d.]+(?:K|M|G)?iB\/s)/,
            /\s([\d.]+(?:K|M|G)?iB\/s)\s.*UL/,
            /upload:\s*([\d.]+(?:K|M|G)?iB\/s)/i
        ];
        for (const pattern of ulSpeedPatterns) {
            const match = output.match(pattern);
            if (match) {
                download.uploadSpeed = match[1];
                break;
            }
        }

        // Extract connections/peers from aria2c format: CN:5
        const cnMatch = output.match(/CN:(\d+)/);
        if (cnMatch) {
            download.peers = parseInt(cnMatch[1]);
        }

        // Extract seeds from aria2c format: SD:10 (seeders)
        const seedMatch = output.match(/SD:(\d+)/);
        if (seedMatch) {
            download.seeds = parseInt(seedMatch[1]);
        }
        
        // For leechers, we don't have direct info from aria2c progress
        // aria2c shows: [#hash downloaded/total(%) CN:connections SD:seeders DL:speed UL:speed]
        // We'll extract leecher info from tracker responses if available
        const trackerSeedMatch = output.match(/seeders?[:\s]*(\d+)/i);
        if (trackerSeedMatch && !seedMatch) { // Only if we didn't get SD: format
            download.seeds = parseInt(trackerSeedMatch[1]);
        }
        
        const trackerLeechMatch = output.match(/leechers?[:\s]*(\d+)/i);
        if (trackerLeechMatch) {
            download.leechers = parseInt(trackerLeechMatch[1]);
        }
        
        // Also check for peer info in tracker responses
        const trackerPeerMatch = output.match(/peers?[:\s]*(\d+)/i);
        if (trackerPeerMatch && !cnMatch) { // Only if we didn't get CN: format
            download.peers = parseInt(trackerPeerMatch[1]);
        }

        // Extract size information
        const sizeMatch = output.match(/([\d.]+(?:K|M|G)?iB)\/([\d.]+(?:K|M|G)?iB)/);
        if (sizeMatch) {
            download.size = sizeMatch[2]; // Total size
        }

        // Extract ETA - handle multiple formats
        const etaPatterns = [
            /ETA:(\d+[hms]+(?:\d+[ms]+)*)/,
            /ETA:\s*(\d+:\d+:\d+)/,
            /remaining:\s*(\d+[hms]+)/i
        ];
        for (const pattern of etaPatterns) {
            const match = output.match(pattern);
            if (match) {
                download.eta = match[1];
                break;
            }
        }

        // Check for BitTorrent status messages
        if (output.includes('info hash=')) {
            if (logger.debugEnabled) console.log(`[${download.id}] BitTorrent info hash detected - magnet link processing`);
        }
        
        if (output.includes('SEEDING')) {
            if (logger.debugEnabled) console.log(`[${download.id}] Download completed, now seeding`);
            if (download.progress < 100) {
                download.progress = 100;
                progressUpdated = true;
            }
        }

        // Check for DHT activity
        if (output.includes('DHT') || output.includes('dht')) {
            if (logger.debugEnabled) console.log(`[${download.id}] DHT activity detected: ${output.trim()}`);
            
            // Look for specific DHT events
            if (output.includes('bootstrap') || output.includes('entry-point')) {
                console.log(`[${download.id}] DHT bootstrap attempt detected`);
            }
            if (output.includes('node') && output.includes('added')) {
                console.log(`[${download.id}] DHT node added - good connectivity sign`);
            }
            if (output.includes('timeout') || output.includes('failed')) {
                console.log(`[${download.id}] DHT connectivity issue: ${output.trim()}`);
            }
        }
        
        // Check if we have metadata but no connections (common issue)
        if (output.includes('METADATA') && output.includes('CN:0')) {
            console.log(`[${download.id}] Metadata available but no peer connections - network/firewall issue detected`);
            console.log(`[${download.id}] DIAGNOSTIC: This indicates aria2c can download metadata but cannot establish peer connections`);
            console.log(`[${download.id}] DIAGNOSTIC: Possible causes: firewall blocking ports 6881-6889, NAT issues, or ISP blocking BitTorrent`);
            
            // If stuck in this state for too long with no progress, it's likely a network issue
            if (download.progress === 0 && download.status === 'downloading') {
                // Check how long we've been in this state
                const stuckTime = Date.now() - new Date(download.startedAt).getTime();
                if (stuckTime > 5 * 60 * 1000) { // 5 minutes
                    console.log(`[${download.id}] DIAGNOSTIC: Stuck with CN:0 for ${Math.round(stuckTime/1000)}s - likely network connectivity issue`);
                }
            }
        }
        
        // Log tracker communications
        if (output.includes('tracker') || output.includes('announce')) {
            if (logger.debugEnabled) console.log(`[${download.id}] Tracker communication: ${output.trim()}`);
        }

        // Check for peer connections and transition from starting to downloading
        if (output.includes('peer') || output.includes('Peer') || output.includes('CN:')) {
            if (logger.debugEnabled) console.log(`[${download.id}] Peer activity: ${output.trim()}`);
            
            // If we're still in starting status and we have peer activity, transition to downloading
            if (download.status === 'starting' && download.downloadType === 'magnet') {
                download.status = 'downloading';
                progressUpdated = true;
                if (logger.debugEnabled) console.log(`[${download.id}] Magnet link found peers, transitioning to downloading`);
            }
        }

        // Check for metadata download completion
        if (output.includes('metadata') || output.includes('Metadata')) {
            if (logger.debugEnabled) console.log(`[${download.id}] Metadata activity: ${output.trim()}`);
            
            if (download.status === 'starting') {
                download.status = 'downloading';
                progressUpdated = true;
                if (logger.debugEnabled) console.log(`[${download.id}] Metadata downloaded, transitioning to downloading`);
            }
        }

        return progressUpdated;
    }

    // Parse progress information
    parseProgress(download, output) {
        let progressUpdated = false;
        
        // Debug log the raw output (only if it contains useful info)
        if (logger.debugEnabled && (output.includes('%') || output.includes('ETA') || output.includes('MiB') || output.includes('download'))) {
            console.log(`[${download.id}] Parsing:`, JSON.stringify(output));
        }
        
        // Extract percentage - try multiple patterns for different downloaders
        const percentPatterns = [
            /(\d+\.?\d*)%/,                           // Basic percentage
            /\[download\]\s+(\d+\.?\d*)%/,           // yt-dlp format
            /\((\d+)%\)/,                            // aria2c format in parentheses
            /(\d+\.?\d*)\s*%/,                       // Percentage with spaces
        ];
        
        for (const pattern of percentPatterns) {
            const match = output.match(pattern);
            if (match) {
                const newProgress = parseFloat(match[1]);
                if (!isNaN(newProgress) && newProgress >= 0 && newProgress <= 100) {
                    // Update if progress increased, or if it's been the same for a while, or significant change
                    const oldProgress = download.progress || 0;
                    if (newProgress > oldProgress || 
                        Math.abs(newProgress - oldProgress) >= 0.1 || 
                        newProgress === 0 || newProgress === 100) {
                        download.progress = newProgress;
                        progressUpdated = true;
                        if (logger.debugEnabled) {
                            console.log(`[${download.id}] Progress: ${oldProgress}% → ${newProgress}%`);
                        }
                    }
                    break;
                }
            }
        }

        // Extract speed - handle multiple formats
        const speedPatterns = [
            /at\s+([\d.]+(?:K|M|G)?iB\/s)/,         // "at 1.2MiB/s"
            /([\d.]+(?:K|M|G)?iB\/s)/,              // Just the speed
            /(\d+\.?\d*(?:K|M|G)B\/s)/,             // Alternative format
        ];
        
        for (const pattern of speedPatterns) {
            const match = output.match(pattern);
            if (match) {
                download.speed = match[1];
                break;
            }
        }

        // Extract ETA
        const etaPatterns = [
            /ETA\s+([\d:]+)/,                        // "ETA 00:05:23"
            /eta\s+([\d:]+)/i,                       // Case insensitive
            /(\d+:\d+:\d+)/,                         // Just time format
        ];
        
        for (const pattern of etaPatterns) {
            const match = output.match(pattern);
            if (match) {
                download.eta = match[1];
                break;
            }
        }

        // Extract size
        const sizePatterns = [
            /of\s+([\d.]+(?:K|M|G)?iB)/,            // "of 123.4MiB"
            /([\d.]+(?:K|M|G)?iB)\s+at/,            // "123.4MiB at"
            /\/\s*([\d.]+(?:K|M|G)?iB)/,            // "/ 123.4MiB"
        ];
        
        for (const pattern of sizePatterns) {
            const match = output.match(pattern);
            if (match) {
                download.size = match[1];
                break;
            }
        }

        // Handle download completion (but don't mark as completed yet!)
        if (output.includes('100%') && output.includes('downloaded')) {
            if (logger.debugEnabled) console.log(`[${download.id}] File download reached 100%, keeping status as downloading until process completion`);
            if (download.status === 'downloading') {
                download.progress = 100;
                progressUpdated = true;
                // Keep status as 'downloading' - let process completion handle final status change
            }
        }
        
        // Only mark as completed if file already exists (no download needed)
        if (output.includes('has already been downloaded') || 
            output.includes('already exists') ||
            (output.includes('Destination:') && output.includes('already'))) {
            download.progress = 100;
            download.status = 'completed';
            progressUpdated = true;
            if (logger.debugEnabled) console.log(`[${download.id}] File already exists, marking as completed`);
        }
        
        // Return whether progress was updated (for immediate broadcast)
        return progressUpdated;
    }

    // Complete a download
    completeDownload(download) {
        console.log(`[${download.id}] COMPLETING DOWNLOAD - Final status change to completed`);
        download.status = 'completed';
        download.progress = 100;
        download.completedAt = new Date();
        download.speed = null;
        download.eta = null;
        
        // Clean up console log throttling data
        this.cleanupThrottledLogging(download.id);
        
        // Clear any debug warnings that may have been set as errors
        if (download.error && (download.error.includes('[debug]') || 
                              download.error.includes('PO Token') || 
                              download.error.includes('formats=missing_pot') ||
                              download.error.includes('Invoking hlsnative downloader') ||
                              download.error.includes('ios client https formats require'))) {
            logger.debug('DOWNLOAD', `Clearing debug warning from completed download ${download.id}`, {
                downloadId: download.id,
                clearedWarning: download.error
            });
            download.error = null;
        }
        
        // Save metadata for torrent/magnet downloads if enabled
        if ((download.downloadType === 'torrent' || download.downloadType === 'magnet') && settings.saveMetadata && download.torrentEngine) {
            this.saveTorrentMetadata(download);
        }
        
        // Clean up torrent engine
        if (download.torrentEngine) {
            download.torrentEngine.destroy();
            download.torrentEngine = null;
            activeTorrents.delete(download.id);
        }
        
        // Clean up temporary .torrent file if it was downloaded
        if (download.downloadType === 'torrent' && download.torrentFilePath) {
            const fs = require('fs');
            fs.unlink(download.torrentFilePath, (err) => {
                if (err) console.log(`[${download.id}] Note: Could not clean up temp .torrent file`);
                else console.log(`[${download.id}] Cleaned up temporary .torrent file`);
            });
        }
        
        this.activeDownloads.delete(download.id);
        this.completedDownloads.unshift(download);
        
        // Keep only last 50 completed downloads
        if (this.completedDownloads.length > 50) {
            this.completedDownloads.splice(50);
        }
        
        console.log(`[${download.id}] SUCCESS - Download officially completed and marked as finished`);
        this.broadcastUpdate();
        this.autoSaveState(); // Save state after completion
        this.processQueue(); // Start next download
    }

    // Handle download error
    handleDownloadError(download, error) {
        download.error = error;
        download.retryCount++;

        const maxRetries = settings.retryAttempts || this.maxRetries || 2;
        if (download.retryCount <= maxRetries) {
            download.status = 'retrying';
            this.activeDownloads.delete(download.id);
            
            // Retry after delay
            setTimeout(() => {
                download.status = 'queued';
                this.broadcastUpdate();
                this.autoSaveState(); // Save state after retry
                // Always try to process queue if enabled
                if (this.queueEnabled) {
                    this.processQueue();
                }
            }, settings.retryDelay || 5000);
        } else {
            download.status = 'failed';
            this.activeDownloads.delete(download.id);
            this.processQueue(); // Continue with next download
            
            // Clean up console log throttling data for failed downloads
            this.cleanupThrottledLogging(download.id);
        }
        
        this.broadcastUpdate();
        this.autoSaveState(); // Save state after error
    }

    // Cancel a download
    cancelDownload(id) {
        const download = this.getDownload(id);
        if (!download) return false;

        logger.info('DOWNLOAD', `Cancelling download ${id}`, {
            downloadId: id,
            downloadType: download.downloadType,
            status: download.status
        });

        // Handle aria2c process
        if (download.process) {
            download.process.kill('SIGTERM');
            download.process = null;
        }
        
        // Handle torrent-stream engine
        if (download.torrentEngine) {
            console.log(`[${download.id}] Cancelling torrent-stream download`);
            download.torrentEngine.destroy();
            download.torrentEngine = null;
            activeTorrents.delete(download.id);
        }

        // Remove from active downloads
        if (this.activeDownloads.has(id)) {
            this.activeDownloads.delete(id);
        }

        // For torrents and magnets, remove completely from queue (auto-remove)
        // For videos, keep them as cancelled (user might want to retry)
        if (download.downloadType === 'torrent' || download.downloadType === 'magnet') {
            // Remove completely from queue
            this.queue = this.queue.filter(d => d.id !== id);
            
            logger.info('DOWNLOAD', `Auto-removed cancelled torrent ${id}`, {
                downloadId: id,
                downloadType: download.downloadType
            });
        } else {
            // For video downloads, keep as cancelled for potential retry
            if (download.status === 'queued') {
                this.queue = this.queue.filter(d => d.id !== id);
            }
            download.status = 'cancelled';
        }

        this.broadcastUpdate();
        this.autoSaveState(); // Save state after cancellation
        this.processQueue(); // Start next download
        return true;
    }

    // Pause/Resume queue processing
    pauseQueue() {
        this.queueEnabled = false;
        this.broadcastUpdate();
        this.autoSaveState(); // Save state after pause
    }

    resumeQueue() {
        this.queueEnabled = true;
        this.processQueue();
        this.broadcastUpdate();
        this.autoSaveState(); // Save state after resume
    }

    // Reorder queue
    reorderQueue(fromIndex, toIndex) {
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= this.queue.length || toIndex >= this.queue.length) {
            return false;
        }

        const item = this.queue.splice(fromIndex, 1)[0];
        this.queue.splice(toIndex, 0, item);
        this.broadcastUpdate();
        this.autoSaveState(); // Save state after reorder
        return true;
    }

    // Get download by ID
    getDownload(id) {
        // Check active downloads
        if (this.activeDownloads.has(id)) {
            return this.activeDownloads.get(id);
        }
        
        // Check queue
        let download = this.queue.find(d => d.id === id);
        if (download) return download;
        
        // Check completed
        download = this.completedDownloads.find(d => d.id === id);
        return download || null;
    }

    // Calculate total speeds
    getTotalSpeeds() {
        let totalDownloadSpeed = 0;
        let totalUploadSpeed = 0;
        
        for (const download of this.activeDownloads.values()) {
            if (download.speed) {
                const speed = this.parseSpeed(download.speed);
                totalDownloadSpeed += speed;
            }
            if (download.uploadSpeed) {
                const uploadSpeed = this.parseSpeed(download.uploadSpeed);
                totalUploadSpeed += uploadSpeed;
            }
        }
        
        return {
            download: this.formatSpeed(totalDownloadSpeed),
            upload: this.formatSpeed(totalUploadSpeed)
        };
    }
    
    // Parse speed string to bytes per second
    parseSpeed(speedStr) {
        if (!speedStr) return 0;
        
        const match = speedStr.match(/([\d.]+)([KMGT]?i?B)\/s/);
        if (!match) return 0;
        
        const value = parseFloat(match[1]);
        const unit = match[2];
        
        const multipliers = {
            'B': 1,
            'KB': 1000, 'KiB': 1024,
            'MB': 1000000, 'MiB': 1048576,
            'GB': 1000000000, 'GiB': 1073741824,
            'TB': 1000000000000, 'TiB': 1099511627776
        };
        
        return value * (multipliers[unit] || 1);
    }
    
    // Format speed from bytes per second to human readable
    formatSpeed(bytesPerSecond) {
        if (bytesPerSecond === 0) return '0 B/s';
        
        const units = ['B/s', 'KiB/s', 'MiB/s', 'GiB/s', 'TiB/s'];
        const base = 1024;
        let size = Math.abs(bytesPerSecond);
        let unitIndex = 0;
        
        while (size >= base && unitIndex < units.length - 1) {
            size /= base;
            unitIndex++;
        }
        
        return `${size.toFixed(1)} ${units[unitIndex]}`;
    }

    // Get queue state (cleaned for JSON serialization)
    getQueueState() {
        const totalSpeeds = this.getTotalSpeeds();
        
        // Clean downloads for serialization (remove circular references)
        const cleanDownload = (download) => {
            const cleaned = { ...download };
            // Remove non-serializable objects
            delete cleaned.process;
            delete cleaned.torrentEngine;
            delete cleaned.webTorrent;
            // Remove large/verbose fields not needed by UI state streams
            delete cleaned.stderrOutput;
            return cleaned;
        };
        
        return {
            queue: this.queue.map(cleanDownload),
            active: Array.from(this.activeDownloads.values()).map(cleanDownload),
            completed: this.completedDownloads.slice(0, 20).map(cleanDownload), // Last 20 completed
            queueEnabled: settings.queueEnabled,
            maxConcurrent: settings.maxConcurrentDownloads,
            totalSpeeds: totalSpeeds,
            stats: {
                queued: this.queue.filter(d => d.status === 'queued').length,
                active: this.activeDownloads.size,
                completed: this.completedDownloads.length,
                failed: this.queue.filter(d => d.status === 'failed').length
            }
        };
    }

    // Add SSE client
    addClient(res) {
        this.clients.add(res);
        
        // Send current state immediately
        res.write(`data: ${JSON.stringify({ type: 'state', data: this.getQueueState() })}\n\n`);
        
        // Clean up on disconnect
        res.on('close', () => {
            this.clients.delete(res);
        });
    }

    // Throttled broadcast updates to reduce UI lag
    throttledBroadcastUpdate() {
        const now = Date.now();
        if (!this.lastBroadcast || now - this.lastBroadcast >= this.minBroadcastIntervalMs) {
            this.broadcastUpdate();
            this.lastBroadcast = now;
        }
    }

    // Broadcast updates to all connected clients
    broadcastUpdate() {
        const state = this.getQueueState();
        const message = `data: ${JSON.stringify({ type: 'update', data: state })}\n\n`;
        
        for (const client of this.clients) {
            try {
                client.write(message);
            } catch (error) {
                // Client disconnected, remove it
                this.clients.delete(client);
            }
        }
    }

    // Clean up on shutdown
    shutdown() {
        // Cancel all active downloads
        for (const download of this.activeDownloads.values()) {
            if (download.process) {
                download.process.kill('SIGTERM');
            }
            if (download.torrentEngine) {
                download.torrentEngine.destroy();
                activeTorrents.delete(download.id);
            }
        }
        
        // Close all SSE connections
        for (const client of this.clients) {
            try {
                client.end();
            } catch (error) {
                // Ignore errors during shutdown
            }
        }
        
        this.activeDownloads.clear();
        this.clients.clear();
    }

    // Get downloads state file path
    getDownloadsStatePath() {
        return path.join(basePath, 'downloads-state.json');
    }

    // Serialize download object for JSON storage (remove circular references)
    serializeDownload(download) {
        // Filter out debug warnings from error field before saving
        let filteredError = download.error;
        if (filteredError && typeof filteredError === 'string') {
            // Remove all debug warnings and informational messages that shouldn't persist
            filteredError = filteredError
                .split('\n')
                .filter(line => {
                    const lowerLine = line.toLowerCase();
                    return !lowerLine.includes('warning:') && 
                           !lowerLine.includes('deprecated') &&
                           !lowerLine.includes('debug:') &&
                           !lowerLine.includes('[debug]') &&
                           !lowerLine.includes('po token') &&
                           !lowerLine.includes('formats=missing_pot') &&
                           !lowerLine.includes('invoking hlsnative downloader') &&
                           !lowerLine.includes('ios client https formats require');
                })
                .join('\n')
                .trim();
            
            // If all that's left is whitespace, clear the error
            if (!filteredError) {
                filteredError = null;
            }
        }

        return {
            id: download.id,
            url: download.url,
            format: download.format,
            title: download.title,
            status: download.status,
            progress: download.progress,
            speed: download.speed,
            eta: download.eta,
            size: download.size,
            error: filteredError,
            retryCount: download.retryCount,
            addedAt: download.addedAt,
            startedAt: download.startedAt,
            completedAt: download.completedAt,
            downloadType: download.downloadType,
            // Torrent-specific fields
            uploadSpeed: download.uploadSpeed,
            seeds: download.seeds,
            leechers: download.leechers,
            peers: download.peers,
            ratio: download.ratio,
            // Resume-related fields
            hasPartialFile: download.hasPartialFile,
            partialFiles: download.partialFiles,
            canResume: download.canResume,
            // Preserve original URL if it was replaced
            originalUrl: download.originalUrl
            // Exclude: process, engine, torrentEngine, torrentBuffer, and any other non-serializable objects
        };
    }

    // Save download state to persistent storage
    async saveState() {
        try {
            const state = {
                version: 1,
                savedAt: new Date().toISOString(),
                nextId: this.nextId,
                queue: this.queue.map(download => this.serializeDownload(download)),
                completedDownloads: this.completedDownloads.slice(-50).map(download => this.serializeDownload(download)), // Keep last 50 completed
                settings: {
                    queueEnabled: this.queueEnabled,
                    maxRetries: this.maxRetries
                }
            };

            await fs.writeFile(this.getDownloadsStatePath(), JSON.stringify(state, null, 2));
            console.log(`[PERSISTENCE] Download state saved to ${this.getDownloadsStatePath()}`);
        } catch (error) {
            console.error('[PERSISTENCE] Error saving download state:', error);
        }
    }

    // Load download state from persistent storage
    async loadState() {
        try {
            const statePath = this.getDownloadsStatePath();
            const data = await fs.readFile(statePath, 'utf8');

            let state;
            try {
                state = JSON.parse(data);
            } catch (parseErr) {
                console.error('[PERSISTENCE] downloads-state.json contains invalid JSON. Starting fresh.', parseErr.message);
                await quarantineCorruptJsonFile(statePath, 'PERSISTENCE');
                return;
            }
            
            console.log(`[PERSISTENCE] Loading download state from ${this.getDownloadsStatePath()}`);
            
            // Restore ID counter
            if (state.nextId) {
                this.nextId = Math.max(this.nextId, state.nextId);
            }

            // Restore queue
            if (state.queue && Array.isArray(state.queue)) {
                this.queue = state.queue.map(download => {
                    // Reset process-related fields
                    download.process = null;
                    download.engine = null;
                    
                    // Re-evaluate download status based on current state
                    if (download.status === 'downloading' || download.status === 'starting') {
                        download.status = 'queued'; // Reset to queued for resumption
                        download.progress = 0;
                        download.speed = null;
                        download.eta = null;
                        download.error = null;
                    }
                    
                    return download;
                });
                
                console.log(`[PERSISTENCE] Restored ${this.queue.length} downloads from state`);
            }

            // Restore completed downloads
            if (state.completedDownloads && Array.isArray(state.completedDownloads)) {
                this.completedDownloads = state.completedDownloads;
                console.log(`[PERSISTENCE] Restored ${this.completedDownloads.length} completed downloads`);
            }

            // Restore settings
            if (state.settings) {
                if (state.settings.queueEnabled !== undefined) this.queueEnabled = state.settings.queueEnabled;
                if (state.settings.maxRetries) this.maxRetries = state.settings.maxRetries;
            }

            // Check for partial downloads that can be resumed
            await this.checkForResumableDownloads();

            // Start processing queue if enabled
            if (this.queueEnabled) {
                this.processQueue();
            }

            console.log(`[PERSISTENCE] Download state restored successfully`);
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('[PERSISTENCE] No existing download state file found, starting fresh');
            } else {
                console.error('[PERSISTENCE] Error loading download state:', error);
            }
        }
    }

    // Check for partial downloads that can be resumed
    async checkForResumableDownloads() {
        const outputDir = settings.downloadDir;
        
        try {
            const files = await fs.readdir(outputDir);
            
            for (const download of this.queue) {
                if (download.status === 'queued') {
                    await this.checkDownloadForResume(download, files, outputDir);
                }
            }
        } catch (error) {
            console.error('[PERSISTENCE] Error checking for resumable downloads:', error);
        }
    }

    // Check individual download for resume capability
    async checkDownloadForResume(download, files, outputDir) {
        try {
            if (download.downloadType === 'video') {
                // Look for yt-dlp partial files
                const partialFiles = files.filter(file => 
                    file.includes('.part') || 
                    file.includes('.f') || 
                    file.includes('.ytdl') ||
                    file.includes('.temp') ||
                    (file.includes(download.title) && (file.includes('.part') || file.includes('.tmp')))
                );
                
                if (partialFiles.length > 0) {
                    console.log(`[PERSISTENCE] Found ${partialFiles.length} partial video files for "${download.title}"`);
                    download.hasPartialFile = true;
                    download.partialFiles = partialFiles;
                }
            } else if (download.downloadType === 'torrent' || download.downloadType === 'magnet') {
                // Look for aria2c control files and partial downloads
                const torrentFiles = files.filter(file => 
                    file.endsWith('.aria2') ||
                    file.endsWith('.torrent') ||
                    (download.title && download.title !== 'Torrent Download' && file.includes(download.title))
                );
                
                if (torrentFiles.length > 0) {
                    console.log(`[PERSISTENCE] Found ${torrentFiles.length} torrent files for "${download.title}"`);
                    download.hasPartialFile = true;
                    download.partialFiles = torrentFiles;
                    
                    // Check for .aria2 control files which indicate resumable downloads
                    const aria2Files = torrentFiles.filter(file => file.endsWith('.aria2'));
                    if (aria2Files.length > 0) {
                        console.log(`[PERSISTENCE] Found aria2 control files - download can be resumed`);
                        download.canResume = true;
                    }
                }
            }

            // Check if download is already completed
            if (download.title && download.title !== 'Torrent Download' && download.title !== 'Magnet Download') {
                const possibleCompletedFiles = files.filter(file => 
                    file.includes(download.title) && 
                    !file.includes('.part') && 
                    !file.includes('.aria2') && 
                    !file.includes('.ytdl')
                );
                
                if (possibleCompletedFiles.length > 0) {
                    console.log(`[PERSISTENCE] Download may already be completed: ${possibleCompletedFiles[0]}`);
                    download.status = 'completed';
                    download.progress = 100;
                    download.completedAt = new Date();
                    
                    // Move to completed downloads
                    this.queue = this.queue.filter(d => d.id !== download.id);
                    this.completedDownloads.unshift(download);
                }
            }
        } catch (error) {
            console.error(`[PERSISTENCE] Error checking resume for download ${download.id}:`, error);
        }
    }

    // Auto-save state with debouncing to prevent excessive writes
    autoSaveState() {
        if (this.saveStateTimeout) {
            clearTimeout(this.saveStateTimeout);
        }
        
        this.saveStateTimeout = setTimeout(() => {
            this.saveState();
        }, 1000); // Save 1 second after last change
    }

    // Remove a download from the list (for completed downloads)
    removeDownload(id) {
        // Check completed downloads
        const completedIndex = this.completedDownloads.findIndex(d => d.id === id);
        if (completedIndex !== -1) {
            this.completedDownloads.splice(completedIndex, 1);
            this.broadcastUpdate();
            this.autoSaveState();
            return true;
        }

        // Check if it's in queue or active (shouldn't happen, but handle it)
        const queueIndex = this.queue.findIndex(d => d.id === id);
        if (queueIndex !== -1) {
            this.queue.splice(queueIndex, 1);
            this.broadcastUpdate();
            this.autoSaveState();
            return true;
        }

        if (this.activeDownloads.has(id)) {
            const download = this.activeDownloads.get(id);
            this.cancelDownload(id); // This will handle cleanup
            return true;
        }

        return false;
    }

    // Retry a specific download
    retryDownload(id) {
        // Find the download in completed downloads (failed ones)
        const completedIndex = this.completedDownloads.findIndex(d => d.id === id && d.status === 'failed');
        if (completedIndex !== -1) {
            const download = this.completedDownloads.splice(completedIndex, 1)[0];
            
            // Reset download state for retry
            download.status = 'queued';
            download.progress = 0;
            download.speed = null;
            download.eta = null;
            download.error = null;
            download.retryCount = 0;
            download.process = null;
            download.startedAt = null;
            download.completedAt = null;
            
            // Add back to queue
            this.queue.push(download);
            this.broadcastUpdate();
            this.autoSaveState();
            
            // Start processing if queue is enabled
            if (this.queueEnabled) {
                this.processQueue();
            }
            
            return true;
        }

        return false;
    }

    // Clear all completed and canceled downloads
    clearCompleted() {
        // Clear completed downloads
        this.completedDownloads = [];
        
        // Also remove any canceled downloads that might still be in the queue
        const beforeCount = this.queue.length;
        this.queue = this.queue.filter(d => d.status !== 'cancelled');
        const removedCount = beforeCount - this.queue.length;
        
        if (removedCount > 0) {
            logger.info('DOWNLOAD', `Cleared ${removedCount} canceled downloads from queue`);
        }
        
        this.broadcastUpdate();
        this.autoSaveState();
    }

    // Retry all failed downloads
    retryAllFailed() {
        const failedDownloads = this.completedDownloads.filter(d => d.status === 'failed');
        
        for (const download of failedDownloads) {
            // Reset download state for retry
            download.status = 'queued';
            download.progress = 0;
            download.speed = null;
            download.eta = null;
            download.error = null;
            download.retryCount = 0;
            download.process = null;
            download.startedAt = null;
            download.completedAt = null;
            
            // Add back to queue
            this.queue.push(download);
        }
        
        // Remove failed downloads from completed list
        this.completedDownloads = this.completedDownloads.filter(d => d.status !== 'failed');
        
        this.broadcastUpdate();
        this.autoSaveState();
        
        // Start processing if queue is enabled
        if (this.queueEnabled && failedDownloads.length > 0) {
            this.processQueue();
        }
    }
}

// Initialize download manager
const downloadManager = new DownloadManager();

// Store active torrent engines for cleanup
const activeTorrents = new Map();

// Helper function to calculate directory size recursively
async function calculateDirectorySize(dirPath) {
    let totalSize = 0;
    
    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const item of items) {
            const itemPath = path.join(dirPath, item.name);
            
            if (item.isDirectory()) {
                totalSize += await calculateDirectorySize(itemPath);
            } else if (item.isFile()) {
                const stats = await fs.stat(itemPath);
                totalSize += stats.size;
            }
        }
    } catch (error) {
        console.error(`Error calculating directory size for ${dirPath}:`, error.message);
    }
    
    return totalSize;
}


// Global error handling for torrent operations
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception in torrent operations:', error);
    console.error('Stack:', error.stack);
    // Don't exit, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection in torrent operations:', reason);
    console.error('Promise:', promise);
});

// Clean up torrent engines on app shutdown
function cleanupTorrents() {
    console.log('Shutting down torrent engines...');
    for (const [id, engine] of activeTorrents) {
        try {
            engine.destroy();
            console.log(`Cleaned up torrent engine for download ${id}`);
        } catch (error) {
            console.error(`Error cleaning up torrent engine ${id}:`, error);
        }
    }
    activeTorrents.clear();
}

// Initialize Express server
function createServer() {
    const expressApp = express();
    
    expressApp.use(cors());
    expressApp.use(express.json());
    
    // Redirect root to index.html
    expressApp.get('/', (req, res) => {
        res.redirect('/index.html');
    });

    // Current app version (from Electron / package metadata)
    expressApp.get('/api/app-version', (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            version: app.getVersion()
        });
    });

    // Debug info (frontend can use this to gate console logs)
    expressApp.get('/api/debug', (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            debug: !!(DEBUG_LOGS || settings?.debugLogging)
        });
    });

    // Version manifest: try fetching from the official repo; fall back to the local bundled copy.
    expressApp.get('/api/version-manifest', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');

        try {
            const response = await fetch(OFFICIAL_VERSION_MANIFEST_URL, {
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const json = await response.json();
            return res.json({ ...json, _source: 'official', _fetchedAt: new Date().toISOString() });
        } catch (err) {
            return res.status(502).json({
                error: 'Failed to load version manifest from GitHub',
                details: String(err?.message || err)
            });
        }
    });
    
    // Endpoint to get video info
    expressApp.post('/api/video-info', async (req, res) => {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        // Let yt-dlp try to handle any URL - it will determine if it's supported

        try {
            const args = [
                '-J',
                '--no-warnings'
            ];
            
            // Add cookie file if configured
            if (settings.cookieFile) {
                args.push('--cookies', settings.cookieFile);
            }
            
            args.push(url);
            
            const ytDlp = spawn(path.join(depPath, 'yt-dlp.exe'), args);

            let output = '';
            let error = '';

            ytDlp.stdout.on('data', (data) => {
                output += data.toString();
            });

            ytDlp.stderr.on('data', (data) => {
                error += data.toString();
            });

            ytDlp.on('close', (code) => {
                if (code !== 0) {
                    console.error('yt-dlp error:', error);
                    let errorMsg = 'Failed to fetch video info';
                    let details = '';
                    
                    // Parse specific errors from yt-dlp stderr
                    if (error.includes('Sign in to confirm you\'re not a bot')) {
                        errorMsg = 'Authentication required';
                        details = 'This video requires authentication. Please configure cookies in settings.';
                    } else if (error.includes('This video is DRM protected')) {
                        errorMsg = 'DRM protected content';
                        details = 'This video is protected by DRM and cannot be downloaded.';
                    } else if (error.includes('Private video')) {
                        errorMsg = 'Private video';
                        details = 'This video is private and requires authentication to access.';
                    } else if (error.includes('Unsupported URL')) {
                        errorMsg = 'Unsupported URL';
                        details = 'The URL format is not supported. Please check the URL.';
                    } else if (error.includes('Cookies are needed')) {
                        errorMsg = 'Cookies required';
                        details = 'This site requires cookies for authentication. Please upload cookies file.';
                    } else if (error.includes('not available')) {
                        errorMsg = 'Video not available';
                        details = 'This video is not available or has been removed.';
                    } else if (isDirectFileDownload(url)) {
                        errorMsg = 'Direct file detected';
                        details = 'This appears to be a direct file download. Try using the "Download File" option or go directly to the Downloads page.';
                    }
                    
                    return res.status(500).json({ error: errorMsg, details: details });
                }

                try {
                    const videoInfo = JSON.parse(output);
                    
                    // Handle direct file downloads (no formats array)
                    if (videoInfo.direct || !videoInfo.formats) {
                        const info = {
                            title: videoInfo.title || path.basename(videoInfo.original_url || url) || 'Downloaded File',
                            thumbnail: videoInfo.thumbnail,
                            duration: videoInfo.duration_string,
                            uploader: videoInfo.uploader,
                            description: videoInfo.description,
                            webpage_url: videoInfo.webpage_url || videoInfo.original_url || url,
                            extractor: videoInfo.extractor || 'generic',
                            formats: [{
                                format_id: videoInfo.format_id || '0',
                                ext: videoInfo.ext && videoInfo.ext !== 'unknown_video' ? videoInfo.ext : 'bin',
                                resolution: 'file',
                                filesize: videoInfo.filesize || videoInfo.filesize_approx,
                                quality: 1,
                                format_note: 'Direct file download',
                                fps: null,
                                vcodec: 'none',
                                acodec: 'none',
                                container: videoInfo.ext && videoInfo.ext !== 'unknown_video' ? videoInfo.ext : 'bin',
                                protocol: videoInfo.protocol || 'https',
                                downloadMethod: 'aria2c',
                                url: videoInfo.url
                            }]
                        };
                        return res.json(info);
                    }
                    
                    // Handle normal video/media with formats
                    const info = {
                        title: videoInfo.title,
                        thumbnail: videoInfo.thumbnail,
                        duration: videoInfo.duration_string,
                        uploader: videoInfo.uploader,
                        description: videoInfo.description,
                        webpage_url: videoInfo.webpage_url,
                        extractor: videoInfo.extractor,
                        formats: videoInfo.formats
                            .filter(f => f.format_id && f.url) // Only require format_id and url
                            .map(f => ({
                                format_id: f.format_id,
                                ext: f.ext || 'unknown',
                                resolution: f.resolution || (f.width && f.height ? `${f.width}x${f.height}` : 
                                            (f.vcodec === 'none' ? 'audio' : f.format)),
                                filesize: f.filesize || f.filesize_approx,
                                quality: f.quality,
                                format_note: f.format_note || f.format || '',
                                fps: f.fps,
                                vcodec: f.vcodec,
                                acodec: f.acodec,
                                container: f.container || f.ext,
                                protocol: f.protocol,
                                // Determine download method
                                downloadMethod: (f.protocol && (f.protocol.includes('m3u8') || f.protocol.includes('f4m'))) 
                                    ? 'yt-dlp' : 'aria2c'
                            }))
                            .sort((a, b) => (b.quality || 0) - (a.quality || 0))
                    };

                    res.json(info);
                } catch (parseError) {
                    console.error('Parse error:', parseError);
                    res.status(500).json({ error: 'Failed to parse video info', details: parseError.message });
                }
            });
        } catch (err) {
            console.error('Server error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    });
    
    // Endpoint for URL resolution and method determination
    expressApp.post('/api/resolve-url', async (req, res) => {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        try {
            logger.log('INFO', 'API', `Resolving URL: ${url}`);
            
            const resolution = await resolveUrlAndDetermineMethod(url);
            
            logger.log('INFO', 'API', `URL resolution completed: ${url} -> ${resolution.method} (${resolution.type})`);
            
            res.json({
                success: true,
                originalUrl: url,
                resolvedUrl: resolution.resolvedUrl,
                method: resolution.method,
                type: resolution.type,
                title: resolution.title,
                reason: resolution.reason,
                contentType: resolution.contentType,
                contentLength: resolution.contentLength,
                redirectChain: resolution.redirectChain,
                error: resolution.error
            });
            
        } catch (error) {
            logger.log('ERROR', 'API', `URL resolution failed: ${url}`, error);
            res.status(500).json({ 
                success: false,
                error: 'Failed to resolve URL',
                details: error.message 
            });
        }
    });
    
    // Endpoint for direct file downloads
    expressApp.post('/api/file-download', async (req, res) => {
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({ error: 'URL is required' });
        }
        
        try {
            // Extract filename from URL for title
            let title;
            try {
                const urlObj = new URL(url);
                title = path.basename(urlObj.pathname) || 'Downloaded File';
            } catch {
                title = 'Downloaded File';
            }
            
            logger.info('API', 'File download request received', {
                endpoint: '/api/file-download',
                url: url,
                title: title,
                clientIP: req.ip || req.connection.remoteAddress
            });
            
            // Use the existing download manager
            const downloadId = downloadManager.addToQueue(url, 'file', title);
            
            logger.info('API', 'File download added to queue successfully', {
                endpoint: '/api/file-download',
                downloadId: downloadId,
                url: url
            });
            
            res.json({ 
                success: true, 
                downloadId: downloadId,
                filename: title,
                message: 'File download started'
            });
            
        } catch (error) {
            console.error('File download error:', error);
            logger.error('API', 'File download failed', {
                endpoint: '/api/file-download',
                error: error.message,
                url: url
            });
            res.status(500).json({ error: 'Failed to start file download' });
        }
    });
    
    // Endpoint to add download to queue
    expressApp.post('/api/download', async (req, res) => {
        const { url, format, title, resolvedMethod, resolvedType } = req.body;

        logger.info('API', 'Download request received', {
            endpoint: '/api/download',
            url: url,
            format: format,
            title: title,
            clientIP: req.ip || req.connection.remoteAddress
        });

        if (!url) {
            logger.warn('API', 'Download request missing URL', { endpoint: '/api/download' });
            return res.status(400).json({ error: 'URL is required' });
        }

        try {
            console.log(`[API] Attempting to add download to queue: ${url}`);
            const downloadId = downloadManager.addToQueue(url, format, title, resolvedMethod, resolvedType);
            console.log(`[API] Download added successfully with ID: ${downloadId}`);
            
            logger.info('API', 'Download added to queue successfully', {
                endpoint: '/api/download',
                downloadId: downloadId,
                url: url,
                format: format
            });
            
            const response = { 
                success: true, 
                downloadId,
                message: 'Download added to queue'
            };
            
            console.log(`[API] Sending response:`, response);
            res.json(response);
        } catch (err) {
            console.error(`[API] Error adding download to queue:`, err);
            logger.error('API', 'Failed to add download to queue', {
                endpoint: '/api/download',
                error: err.message,
                stack: err.stack,
                url: url,
                format: format
            });
            res.status(500).json({ error: `Failed to add download to queue: ${err.message}` });
        }
    });

    // New SSE endpoint for download updates
    expressApp.get('/api/download-stream', (req, res) => {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
        });

        downloadManager.addClient(res);
    });

    // Queue management endpoints
    expressApp.get('/api/queue', (req, res) => {
        try {
            res.json(downloadManager.getQueueState());
        } catch (err) {
            console.error('Error getting queue state:', err);
            res.status(500).json({ error: 'Failed to get queue state' });
        }
    });

    expressApp.post('/api/queue/pause', (req, res) => {
        try {
            downloadManager.pauseQueue();
            res.json({ success: true, message: 'Queue paused' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to pause queue' });
        }
    });

    expressApp.post('/api/queue/resume', (req, res) => {
        try {
            downloadManager.resumeQueue();
            res.json({ success: true, message: 'Queue resumed' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to resume queue' });
        }
    });

    expressApp.delete('/api/download/:id', (req, res) => {
        try {
            const success = downloadManager.cancelDownload(req.params.id);
            if (success) {
                res.json({ success: true, message: 'Download cancelled' });
            } else {
                res.status(404).json({ error: 'Download not found' });
            }
        } catch (err) {
            res.status(500).json({ error: 'Failed to cancel download' });
        }
    });

    expressApp.post('/api/queue/reorder', (req, res) => {
        try {
            const { fromIndex, toIndex } = req.body;
            const success = downloadManager.reorderQueue(fromIndex, toIndex);
            if (success) {
                res.json({ success: true, message: 'Queue reordered' });
            } else {
                res.status(400).json({ error: 'Invalid reorder parameters' });
            }
        } catch (err) {
            res.status(500).json({ error: 'Failed to reorder queue' });
        }
    });

    // Remove a download from the list (completed downloads)
    expressApp.delete('/api/download/:id/remove', (req, res) => {
        console.log(`[REMOVE] Attempting to remove download: ${req.params.id}`);
        try {
            const success = downloadManager.removeDownload(req.params.id);
            console.log(`[REMOVE] Remove result: ${success}`);
            if (success) {
                res.json({ success: true, message: 'Download removed' });
            } else {
                res.status(404).json({ error: 'Download not found' });
            }
        } catch (err) {
            console.error('[REMOVE] Error:', err);
            res.status(500).json({ error: 'Failed to remove download' });
        }
    });

    // Retry a failed download
    expressApp.post('/api/download/:id/retry', (req, res) => {
        const downloadId = req.params.id;
        
        logger.info('API', 'Retry download request', {
            endpoint: '/api/download/:id/retry',
            downloadId: downloadId,
            clientIP: req.ip || req.connection.remoteAddress
        });
        
        try {
            const success = downloadManager.retryDownload(downloadId);
            if (success) {
                logger.info('API', 'Download retry successful', {
                    endpoint: '/api/download/:id/retry',
                    downloadId: downloadId
                });
                res.json({ success: true, message: 'Download retried' });
            } else {
                logger.warn('API', 'Download not found for retry', {
                    endpoint: '/api/download/:id/retry',
                    downloadId: downloadId
                });
                res.status(404).json({ error: 'Download not found' });
            }
        } catch (err) {
            logger.error('API', 'Failed to retry download', {
                endpoint: '/api/download/:id/retry',
                downloadId: downloadId,
                error: err.message,
                stack: err.stack
            });
            res.status(500).json({ error: 'Failed to retry download' });
        }
    });

    // Clear completed and canceled downloads
    expressApp.post('/api/downloads/clear-completed', (req, res) => {
        logger.info('API', 'Clear completed/canceled downloads request', {
            endpoint: '/api/downloads/clear-completed',
            clientIP: req.ip || req.connection.remoteAddress
        });
        
        try {
            downloadManager.clearCompleted();
            logger.info('API', 'Completed and canceled downloads cleared successfully');
            res.json({ success: true, message: 'Completed and canceled downloads cleared' });
        } catch (err) {
            logger.error('API', 'Failed to clear downloads', {
                endpoint: '/api/downloads/clear-completed',
                error: err.message,
                stack: err.stack
            });
            res.status(500).json({ error: 'Failed to clear downloads' });
        }
    });

    // Retry all failed downloads
    expressApp.post('/api/downloads/retry-failed', (req, res) => {
        try {
            downloadManager.retryAllFailed();
            res.json({ success: true, message: 'Failed downloads retried' });
        } catch (err) {
            res.status(500).json({ error: 'Failed to retry downloads' });
        }
    });

    console.log('[ROUTES] Download management endpoints registered successfully');
    
    // Endpoint to get list of downloaded videos
    expressApp.get('/api/videos', async (req, res) => {
        try {
            const dir = settings.downloadDir;
                
            const files = await fs.readdir(dir, { withFileTypes: true });
            const videos = [];
            
            for (const dirent of files) {
                const fileName = dirent.name;
                
                // Skip hidden files and temp directories
                if (fileName.startsWith('.')) {
                    continue;
                }
                
                // Check if it's a directory (likely torrent download)
                const isDirectory = dirent.isDirectory();
                
                // Match video files and common torrent download files
                const isVideo = fileName.match(/\.(mp4|mkv|webm|avi|mov)$/i);
                const isTorrentDownload = fileName.match(/\.(iso|img|dmg|exe|zip|rar|7z|tar|gz|bin|deb|rpm|pkg)$/i);
                
                // Include torrent directories or matching files
                if (isVideo || isTorrentDownload || isDirectory) {
                    // Try to get metadata from companion JSON if it exists
                    const baseName = fileName.replace(/\.[^/.]+$/, '');
                    const jsonPath = path.join(dir, `${baseName}.info.json`);
                    let metadata = null;
                    
                    try {
                        const jsonContent = await fs.readFile(jsonPath, 'utf8');
                        metadata = JSON.parse(jsonContent);
                    } catch (err) {
                        // No metadata file, that's okay
                    }
                    
                    // Get actual file/directory stats for size and dates
                    let fileStats = null;
                    try {
                        const filePath = path.join(dir, fileName);
                        fileStats = await fs.stat(filePath);
                    } catch (err) {
                        console.error(`Error getting stats for ${fileName}:`, err.message);
                    }
                    
                    // Determine file type and icon
                    const fileType = isVideo ? 'video' : (isDirectory || isTorrentDownload) ? 'torrent' : 'torrent';
                    const defaultTitle = isVideo ? baseName : 
                        (metadata?.title || fileName);
                    
                    // Calculate directory size if it's a directory
                    let totalSize = fileStats?.size || 0;
                    if (isDirectory) {
                        try {
                            totalSize = await calculateDirectorySize(path.join(dir, fileName));
                        } catch (err) {
                            console.log(`Could not calculate size for directory ${fileName}`);
                            totalSize = 0;
                        }
                    }
                    
                    videos.push({
                        filename: fileName,
                        title: metadata?.title || defaultTitle,
                        description: metadata?.description || '',
                        thumbnail: metadata?.thumbnail || '',
                        duration: metadata?.duration_string || (isDirectory || isTorrentDownload ? 'N/A' : ''),
                        uploader: metadata?.uploader || (isDirectory || isTorrentDownload ? 'BitTorrent Network' : ''),
                        site: metadata?.extractor || (isDirectory || isTorrentDownload ? 'torrent' : ''),
                        siteKey: metadata?.extractor_key || (isDirectory || isTorrentDownload ? 'torrent' : ''),
                        siteDomain: metadata?.webpage_url_domain || (isDirectory || isTorrentDownload ? 'torrent' : ''),
                        siteUrl: metadata?.webpage_url || '',
                        fileType: fileType,
                        isDirectory: isDirectory,
                        // File system information
                        filesize: totalSize,
                        size: totalSize,
                        totalSize: metadata?.total_size || totalSize,
                        downloadDate: fileStats?.mtime || new Date(),
                        download_date: fileStats?.mtime || new Date(),
                        // Torrent-specific fields
                        infoHash: metadata?.info_hash || '',
                        fileCount: metadata?.file_count || (isDirectory ? 'Multiple' : 1)
                    });
                }
            }
            
            res.json(videos);
        } catch (err) {
            console.error('Error listing videos:', err);
            res.status(500).json({ error: 'Failed to list videos' });
        }
    });
    
    // Search videos using yt-dlp
    expressApp.post('/api/search', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        
        try {
            const { query, limit = 40 } = req.body;
            
            if (!query || typeof query !== 'string') {
                return res.status(400).json({ error: 'Search query is required' });
            }
            
            logger.log('INFO', 'SEARCH', `Searching for: "${query}" with limit: ${limit}`);
            
            // Use yt-dlp to search YouTube
            const ytDlpPath = path.join(depPath, 'yt-dlp.exe');
            const searchArgs = [
                '--flat-playlist',
                '--dump-json',
                '--no-warnings',
                '--skip-download',
                `ytsearch${limit}:${query}`
            ];
            
            // Add cookies if available
            if (settings.cookieFile && fsSync.existsSync(settings.cookieFile)) {
                searchArgs.push('--cookies', settings.cookieFile);
            }
            
            logger.log('DEBUG', 'SEARCH', `Running yt-dlp with args: ${searchArgs.join(' ')}`);
            
            const ytDlpProcess = spawn(ytDlpPath, searchArgs);
            let output = '';
            let errorOutput = '';
            
            ytDlpProcess.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            ytDlpProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            
            ytDlpProcess.on('close', (code) => {
                try {
                    logger.log('DEBUG', 'SEARCH', `yt-dlp process finished with code: ${code}`);
                    logger.log('DEBUG', 'SEARCH', `stdout output: ${output.substring(0, 500)}...`);
                    logger.log('DEBUG', 'SEARCH', `stderr output: ${errorOutput}`);
                    
                    if (code !== 0) {
                        logger.log('ERROR', 'SEARCH', `yt-dlp search failed with code ${code}`, errorOutput);
                        return res.status(500).json({ error: 'Search failed', details: errorOutput });
                    }
                    
                    // Parse JSON output - each line is a separate video entry
                    const results = [];
                    const lines = output.trim().split('\n').filter(line => line.trim());
                    
                    for (const line of lines) {
                        try {
                            const videoData = JSON.parse(line);
                            
                            // Log the first few results to debug field names
                            if (results.length < 3) {
                                logger.log('DEBUG', 'SEARCH', `Raw video data fields: ${JSON.stringify(Object.keys(videoData))}`);
                                logger.log('DEBUG', 'SEARCH', `Sample video data: ${JSON.stringify(videoData, null, 2)}`);
                            }
                            
                            // Extract relevant information - handle flat playlist format
                            const result = {
                                id: videoData.id,
                                title: videoData.title,
                                description: videoData.description || '',
                                duration: videoData.duration,
                                uploader: videoData.uploader || videoData.channel || videoData.uploader_id,
                                upload_date: videoData.upload_date,
                                view_count: videoData.view_count,
                                thumbnail: videoData.thumbnail || videoData.thumbnails?.[0]?.url,
                                webpage_url: videoData.webpage_url || videoData.url || `https://www.youtube.com/watch?v=${videoData.id}`,
                                url: videoData.url || `https://www.youtube.com/watch?v=${videoData.id}`
                            };
                            
                            results.push(result);
                        } catch (parseError) {
                            logger.log('WARN', 'SEARCH', `Failed to parse search result line: ${line}`, parseError.message);
                        }
                    }
                    
                    logger.log('INFO', 'SEARCH', `Search completed successfully with ${results.length} results`);
                    logger.log('DEBUG', 'SEARCH', `Raw yt-dlp output length: ${output.length} characters`);
                    logger.log('DEBUG', 'SEARCH', `Number of JSON lines: ${lines.length}`);
                    logger.log('DEBUG', 'SEARCH', `Final results: ${JSON.stringify(results.slice(0, 2), null, 2)}`);
                    res.json({ results, query, total: results.length });
                    
                } catch (error) {
                    logger.log('ERROR', 'SEARCH', 'Error processing search results', error);
                    res.status(500).json({ error: 'Failed to process search results' });
                }
            });
            
        } catch (error) {
            logger.log('ERROR', 'SEARCH', 'Search endpoint error', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    
    // Get streaming URL for a video
    expressApp.post('/api/stream-url', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        
        try {
            const { url } = req.body;
            
            if (!url) {
                return res.status(400).json({ error: 'Video URL is required' });
            }
            
            logger.log('INFO', 'STREAM', `Getting stream URL for: ${url}`);
            
            const ytDlpPath = path.join(depPath, 'yt-dlp.exe');
            
            const buildArgs = (format) => {
                const args = [
                    '--get-url',
                    '--no-playlist',
                    '--no-warnings',
                    '--format', format,
                    url
                ];
                
                // Add cookies if available
                if (settings.cookieFile && fsSync.existsSync(settings.cookieFile)) {
                    args.push('--cookies', settings.cookieFile);
                }
                
                return args;
            };
            
            const parseUrls = (stdout) => stdout
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter(Boolean);
            
            const looksLikeManifestUrl = (u) => {
                const s = String(u || '').toLowerCase();
                return s.includes('/api/manifest/') || s.includes('.m3u8');
            };
            
            const runYtDlpGetUrl = (format) => new Promise((resolve) => {
                const args = buildArgs(format);
                logger.log('DEBUG', 'STREAM', `Running yt-dlp with args: ${args.join(' ')}`);
                
                const proc = spawn(ytDlpPath, args);
                let stdout = '';
                let stderr = '';
                
                proc.stdout.on('data', (data) => { stdout += data.toString(); });
                proc.stderr.on('data', (data) => { stderr += data.toString(); });
                proc.on('close', (code) => resolve({ code, stdout, stderr, args }));
            });
            
            // Prefer progressive (video+audio) formats that HTML5 <video> can play directly.
            // YouTube often provides high quality via DASH/HLS manifests which Chromium <video> will not play.
            const formatCandidates = [
                // Strong preference: mp4 with both audio+video, capped to 720p.
                'best[height<=720][vcodec!=none][acodec!=none][ext=mp4]',
                // Fallback: any container with both audio+video, capped to 720p.
                'best[height<=720][vcodec!=none][acodec!=none]',
                // Last resort: any format with both audio+video.
                'best[vcodec!=none][acodec!=none]',
                // Absolute fallback (may be a manifest on some sites).
                'best[height<=720]'
            ];
            
            let lastErrorOutput = '';
            
            for (const format of formatCandidates) {
                // eslint-disable-next-line no-await-in-loop
                const { code, stdout, stderr } = await runYtDlpGetUrl(format);
                
                if (code !== 0) {
                    lastErrorOutput = (stderr || stdout || lastErrorOutput || '');
                    
                    // Check for common errors
                    if (lastErrorOutput.includes('requires authentication') || lastErrorOutput.includes('Sign in to confirm')) {
                        return res.status(401).json({
                            error: 'Authentication required',
                            message: 'This video requires authentication. Please upload cookies in settings.'
                        });
                    }
                    
                    if (lastErrorOutput.includes('DRM') || lastErrorOutput.includes('protected')) {
                        return res.status(403).json({
                            error: 'DRM protected content',
                            message: 'This content is protected and cannot be streamed.'
                        });
                    }
                    
                    // Try next candidate
                    continue;
                }
                
                const urls = parseUrls(stdout);
                
                if (!urls.length) {
                    continue;
                }
                
                // If yt-dlp returns multiple URLs (common when a format resolves to multiple resources),
                // choose the first one that doesn't look like an HLS/DASH manifest.
                const chosen = urls.find((u) => !looksLikeManifestUrl(u)) || urls[0];
                
                if (!chosen) {
                    continue;
                }
                
                if (urls.length > 1) {
                    logger.log('WARN', 'STREAM', `yt-dlp returned ${urls.length} URLs; using one for playback.`);
                }
                
                if (looksLikeManifestUrl(chosen)) {
                    // Try next candidate format in hopes of getting a direct media URL.
                    continue;
                }
                
                logger.log('INFO', 'STREAM', 'Stream URL obtained successfully');
                return res.json({ streamUrl: chosen, streamUrls: urls.length > 1 ? urls : undefined });
            }
            
            logger.log('ERROR', 'STREAM', 'yt-dlp failed to produce a playable stream URL', lastErrorOutput);
            return res.status(500).json({
                error: 'Failed to get stream URL',
                details: lastErrorOutput || 'No playable URL returned by yt-dlp'
            });
            
        } catch (error) {
            logger.log('ERROR', 'STREAM', 'Stream URL endpoint error', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    });
    
    // Stream video via server-side ffmpeg muxing (handles DASH/HLS/adaptive formats).
    // This avoids CORS and manifest playback limitations in Chromium <video>.
    expressApp.get('/api/stream', async (req, res) => {
        try {
            const url = req.query?.url;
            
            if (!url || typeof url !== 'string') {
                return res.status(400).json({ error: 'Video URL is required' });
            }
            
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Content-Type', 'video/mp4');
            res.setHeader('Accept-Ranges', 'none');
            
            const rangeHeader = req.headers?.range ? String(req.headers.range) : '';
            logger.log('INFO', 'STREAM', `Starting server-side stream for: ${url}${rangeHeader ? ` (Range: ${rangeHeader})` : ''}`);
            
            const ytDlpPath = path.join(depPath, 'yt-dlp.exe');
            const ffmpegPath = path.join(depPath, 'ffmpeg.exe');
            
            const buildYtDlpArgs = () => {
                // Try to prefer broadly compatible H.264/AAC first; fall back to "best" if needed.
                // Note: when using separate streams, yt-dlp prints 2 URLs (video then audio).
                const format = [
                    'bestvideo[height<=720][vcodec^=avc1]+bestaudio[acodec^=mp4a]',
                    'best[height<=720][vcodec^=avc1][acodec^=mp4a]',
                    'bestvideo[height<=720]+bestaudio/best[height<=720]',
                    'best'
                ].join('/');
                
                const args = [
                    '--get-url',
                    '--no-playlist',
                    '--no-warnings',
                    '--format', format,
                    url
                ];
                
                if (settings.cookieFile && fsSync.existsSync(settings.cookieFile)) {
                    args.push('--cookies', settings.cookieFile);
                }
                
                return args;
            };
            
            const runYtDlp = () => new Promise((resolve) => {
                const args = buildYtDlpArgs();
                logger.log('DEBUG', 'STREAM', `Resolving stream inputs with yt-dlp: ${args.join(' ')}`);
                
                const proc = spawn(ytDlpPath, args);
                let stdout = '';
                let stderr = '';
                proc.stdout.on('data', (d) => { stdout += d.toString(); });
                proc.stderr.on('data', (d) => { stderr += d.toString(); });
                proc.on('close', (code) => resolve({ code, stdout, stderr, args }));
            });
            
            const parseUrls = (stdout) => stdout
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean);
            
            const { code, stdout, stderr } = await runYtDlp();
            
            if (code !== 0) {
                const errText = (stderr || stdout || '').trim();
                logger.log('ERROR', 'STREAM', `yt-dlp failed to resolve stream inputs (code ${code})`, errText);
                
                if (errText.includes('requires authentication') || errText.includes('Sign in to confirm')) {
                    return res.status(401).json({
                        error: 'Authentication required',
                        message: 'This video requires authentication. Please upload cookies in settings.'
                    });
                }
                
                if (errText.includes('DRM') || errText.includes('protected')) {
                    return res.status(403).json({
                        error: 'DRM protected content',
                        message: 'This content is protected and cannot be streamed.'
                    });
                }
                
                return res.status(500).json({ error: 'Failed to resolve stream inputs', details: errText });
            }
            
            const inputUrls = parseUrls(stdout);
            if (!inputUrls.length) {
                logger.log('ERROR', 'STREAM', 'yt-dlp returned no URLs for streaming', stdout);
                return res.status(404).json({ error: 'No stream URLs found' });
            }
            
            // Build ffmpeg pipeline. We output fragmented MP4 for progressive playback over HTTP.
            const commonFfmpegArgs = [
                '-hide_banner',
                '-loglevel', 'error',
                // Faster startup (reduce probe/analyze time)
                '-analyzeduration', '0',
                '-probesize', '32k',
                '-fflags', '+genpts',
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5'
            ];
            
            const outputArgsCopy = [
                '-c', 'copy',
                '-movflags', 'frag_keyframe+empty_moov+faststart',
                '-f', 'mp4',
                'pipe:1'
            ];
            
            const outputArgsTranscode = [
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '128k',
                '-movflags', 'frag_keyframe+empty_moov+faststart',
                '-f', 'mp4',
                'pipe:1'
            ];
            
            const makeFfmpegArgs = (mode) => {
                const out = mode === 'transcode' ? outputArgsTranscode : outputArgsCopy;
                
                if (inputUrls.length >= 2) {
                    return [
                        ...commonFfmpegArgs,
                        '-i', inputUrls[0],
                        '-i', inputUrls[1],
                        '-map', '0:v:0',
                        '-map', '1:a:0',
                        '-shortest',
                        ...out
                    ];
                }
                
                return [
                    ...commonFfmpegArgs,
                    '-i', inputUrls[0],
                    ...out
                ];
            };
            
            const runFfmpeg = (mode) => new Promise((resolve) => {
                const args = makeFfmpegArgs(mode);
                logger.log('DEBUG', 'STREAM', `Starting ffmpeg (${mode}) with args: ${args.join(' ')}`);
                
                const ff = spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
                let bytes = 0;
                let ffErr = '';
                let clientClosed = false;
                
                const cleanup = () => {
                    try { ff.kill('SIGKILL'); } catch { /* ignore */ }
                };
                
                req.on('close', () => {
                    clientClosed = true;
                    logger.log('DEBUG', 'STREAM', 'Client disconnected; stopping ffmpeg stream');
                    cleanup();
                });
                
                ff.stderr.on('data', (d) => { ffErr += d.toString(); });
                ff.stdout.on('data', (chunk) => { bytes += chunk.length; });
                
                // Stream to client
                ff.stdout.pipe(res, { end: true });
                
                ff.on('close', (exitCode) => resolve({ exitCode, bytes, ffErr, clientClosed }));
            });
            
            // Try remux/copy first; if it fails before producing any bytes, retry with transcode.
            const copyResult = await runFfmpeg('copy');
            if (copyResult.exitCode !== 0 && copyResult.bytes === 0) {
                logger.log('WARN', 'STREAM', 'ffmpeg copy failed; retrying with transcode', copyResult.ffErr);
                
                // If we already wrote headers/body, Express may have ended; but in the "0 bytes" case this is safe.
                // Re-open response if not finished.
                if (!res.headersSent) {
                    res.setHeader('Cache-Control', 'no-store');
                    res.setHeader('Content-Type', 'video/mp4');
                }
                
                const transcodeResult = await runFfmpeg('transcode');
                if (transcodeResult.exitCode !== 0) {
                    if (transcodeResult.clientClosed) {
                        logger.log('DEBUG', 'STREAM', 'ffmpeg transcode stopped due to client disconnect');
                    } else {
                        logger.log('ERROR', 'STREAM', 'ffmpeg transcode failed', transcodeResult.ffErr);
                    }
                }
            } else if (copyResult.exitCode !== 0) {
                if (copyResult.clientClosed) {
                    logger.log('DEBUG', 'STREAM', 'ffmpeg stream stopped due to client disconnect');
                } else {
                    logger.log('ERROR', 'STREAM', 'ffmpeg stream ended with error after sending data', copyResult.ffErr);
                }
            }
            
        } catch (error) {
            logger.log('ERROR', 'STREAM', 'Stream endpoint error', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' });
            } else {
                try { res.end(); } catch { /* ignore */ }
            }
        }
    });
    
    // Get individual video metadata
    expressApp.get('/api/video-metadata/:filename', async (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        
        try {
            const requested = decodeURIComponent(req.params.filename || '');
            // Only use the last path segment for metadata lookups.
            const safeFileName = path.basename(requested);
            const baseName = safeFileName.replace(/\.[^/.]+$/, '');
            
            const dir = settings.downloadDir;
            
            const jsonPath = resolvePathInsideDir(dir, `${baseName}.info.json`);
            
            // Check if the metadata file exists
            try {
                await fs.access(jsonPath);
            } catch {
                console.error(`Metadata file not found: ${jsonPath}`);
                return res.status(404).json({ error: 'Metadata file not found' });
            }
            
            const jsonContent = await fs.readFile(jsonPath, 'utf8');
            const metadata = JSON.parse(jsonContent);
            
            res.json(metadata);
        } catch (err) {
            console.error('Error reading metadata:', err);
            res.status(404).json({ error: 'Metadata not found', details: err.message });
        }
    });
    
    // Serve video files
    expressApp.use('/videos', (req, res, next) => {
        const dir = settings.downloadDir;
        express.static(dir)(req, res, next);
    });
    
    // Serve downloads directly (for files.html)
    expressApp.use('/downloads', (req, res, next) => {
        const dir = settings.downloadDir;
        express.static(dir)(req, res, next);
    });
    
    // Endpoint to get settings
    expressApp.get('/api/settings', (req, res) => {
        res.json(settings);
    });
    
    // Endpoint to save settings
    expressApp.post('/api/settings', async (req, res) => {
        const newSettings = req.body;
        settings = { ...settings, ...newSettings };
        
        try {
            await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
            
            // Ensure new download directory exists
            if (newSettings.downloadDir) {
                await ensureDownloadsDir();
            }

            // Keep the runtime queue state in sync with settings changes
            if (typeof newSettings.queueEnabled === 'boolean' && downloadManager) {
                if (newSettings.queueEnabled) {
                    downloadManager.resumeQueue();
                } else {
                    downloadManager.pauseQueue();
                }
            }
            
            res.json({ success: true });
        } catch (err) {
            console.error('Error saving settings:', err);
            res.status(500).json({ error: 'Failed to save settings' });
        }
    });
    
    // Endpoint to get version information for dependencies
    expressApp.get('/api/versions', async (req, res) => {
        try {
            const versions = {};
            
            // Get yt-dlp version
            try {
                const ytdlpProcess = spawn(path.join(depPath, 'yt-dlp.exe'), ['--version'], { 
                    stdio: ['ignore', 'pipe', 'pipe'] 
                });
                
                let ytdlpOutput = '';
                ytdlpProcess.stdout.on('data', (data) => {
                    ytdlpOutput += data.toString();
                });
                
                await new Promise((resolve) => {
                    ytdlpProcess.on('close', () => resolve());
                });
                
                versions.ytdlp = ytdlpOutput.trim();
            } catch (error) {
                console.error('Error getting yt-dlp version:', error);
                versions.ytdlp = 'Unknown';
            }
            
            // Get aria2c version
            try {
                const aria2cProcess = spawn(path.join(depPath, 'aria2c.exe'), ['--version'], { 
                    stdio: ['ignore', 'pipe', 'pipe'] 
                });
                
                let aria2cOutput = '';
                aria2cProcess.stdout.on('data', (data) => {
                    aria2cOutput += data.toString();
                });
                
                await new Promise((resolve) => {
                    aria2cProcess.on('close', () => resolve());
                });
                
                // Parse aria2 version from output (first line usually contains version)
                const versionMatch = aria2cOutput.match(/aria2 version (\d+\.\d+\.\d+)/);
                versions.aria2c = versionMatch ? versionMatch[1] : aria2cOutput.split('\n')[0].trim();
            } catch (error) {
                console.error('Error getting aria2c version:', error);
                versions.aria2c = 'Unknown';
            }
            
            res.json(versions);
        } catch (error) {
            console.error('Error getting versions:', error);
            res.status(500).json({ error: 'Failed to get version information' });
        }
    });
    
    // Endpoint to select directory (Windows)
    expressApp.post('/api/select-directory', async (req, res) => {
        try {
            // Determine current directory for the dialog
            const currentDir = settings.downloadDir;
                
            // Create a temporary PowerShell script to show folder picker
            const psScript = `
                Add-Type -AssemblyName System.Windows.Forms
                $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
                $dialog.Description = "Select download directory for FireFetch"
                $dialog.SelectedPath = "${currentDir.replace(/\\/g, '\\\\')}"
                $dialog.ShowNewFolderButton = $true
                $result = $dialog.ShowDialog()
                if ($result -eq [System.Windows.Forms.DialogResult]::OK) {
                    Write-Output $dialog.SelectedPath
                }
            `;
            
            const command = `powershell -ExecutionPolicy Bypass -Command "${psScript.replace(/\r?\n/g, '; ').replace(/"/g, '\\"')}"`;
            const { stdout, stderr } = await execAsync(command);
            
            if (stderr && !stderr.includes('WARNING')) {
                throw new Error(stderr);
            }
            
            const selectedPath = stdout.trim();
            if (selectedPath) {
                res.json({ path: selectedPath });
            } else {
                res.json({ path: null });
            }
        } catch (err) {
            console.error('Error selecting directory:', err);
            // Fallback for non-Windows systems
            res.json({ path: settings.downloadDir });
        }
    });
    
    // Cookie file upload endpoint
    expressApp.post('/api/upload-cookies', upload.single('cookieFile'), async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            
            // Move file to permanent location
            const permanentPath = path.join(cookiesDir, 'cookies.txt');
            await fs.rename(req.file.path, permanentPath);
            
            // Update settings
            settings.cookieFile = permanentPath;
            await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
            
            res.json({ success: true, fileName: req.file.originalname });
        } catch (err) {
            console.error('Error uploading cookies:', err);
            res.status(500).json({ error: 'Failed to upload cookie file' });
        }
    });
    
    // Clear cookies endpoint
    expressApp.post('/api/clear-cookies', async (req, res) => {
        try {
            if (settings.cookieFile) {
                // Try to delete the cookie file
                try {
                    await fs.unlink(settings.cookieFile);
                } catch (err) {
                    console.error('Error deleting cookie file:', err);
                }
                
                // Update settings
                settings.cookieFile = null;
                await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
            }
            
            res.json({ success: true });
        } catch (err) {
            console.error('Error clearing cookies:', err);
            res.status(500).json({ error: 'Failed to clear cookies' });
        }
    });
    
    // Cookie status endpoint
    expressApp.get('/api/cookie-status', (req, res) => {
        res.json({
            hasCookies: !!settings.cookieFile,
            fileName: settings.cookieFile ? path.basename(settings.cookieFile) : null
        });
    });
    
    // Reset settings endpoint
    expressApp.post('/api/reset-settings', async (req, res) => {
        try {
            // Reset to default settings
            settings = {
                downloadDir: downloadsDir,
                defaultQuality: 'best',
                outputFormat: 'mp4',
                saveMetadata: true,
                connections: 16,
                segments: 16,
                segmentSize: '1M',
                autoPlay: false,
                cookieFile: null,
                // Queue settings
                maxConcurrentDownloads: 3,
                queueEnabled: true,
                retryAttempts: 2,
                retryDelay: 5000,
                // Torrent settings
                torrentEngine: 'webtorrent'
            };
            
            // Persist default settings and ensure dirs exist
            await fs.writeFile(getSettingsPath(), JSON.stringify(settings, null, 2));
            await ensureDownloadsDir();

            // Keep runtime queue state in sync with defaults
            if (downloadManager) {
                downloadManager.queueEnabled = true;
                downloadManager.processQueue();
                downloadManager.broadcastUpdate();
                downloadManager.autoSaveState();
            }
            
            res.json({ success: true });
        } catch (err) {
            console.error('Error resetting settings:', err);
            res.status(500).json({ error: 'Failed to reset settings' });
        }
    });
    
    // Delete video endpoint
    expressApp.delete('/api/delete-video/:filename', async (req, res) => {
        try {
            const filename = decodeURIComponent(req.params.filename);
            const dir = settings.downloadDir;
            
            const videoPath = resolvePathInsideDir(dir, filename);
            const baseName = path.basename(filename).replace(/\.[^/.]+$/, '');
            const metadataPath = resolvePathInsideDir(dir, `${baseName}.info.json`);
            
            console.log(`[DELETE] Attempting to delete file: ${filename}`);
            
            // Check if this file is associated with an active torrent
            const activeDownloads = Array.from(downloadManager.activeDownloads.values());
            const completedDownloads = downloadManager.completedDownloads;
            
            // Find any download associated with this file
            const associatedDownload = [...activeDownloads, ...completedDownloads].find(download => {
                if (download.downloadType === 'torrent' || download.downloadType === 'magnet') {
                    // Check if the filename matches any files in the torrent
                    return download.title && filename.includes(download.title.replace(/[^\w\s.-]/g, '_'));
                }
                return false;
            });
            
            // If it's a torrent file, stop seeding first
            if (associatedDownload && associatedDownload.torrentEngine) {
                console.log(`[DELETE] Stopping torrent engine for ${associatedDownload.id} before deleting file`);
                try {
                    associatedDownload.torrentEngine.destroy();
                    activeTorrents.delete(associatedDownload.id);
                    
                    // Wait a moment for the engine to fully release the file
                    await new Promise(resolve => setTimeout(resolve, 2000));
                } catch (engineError) {
                    console.warn(`[DELETE] Error stopping torrent engine: ${engineError.message}`);
                    // Continue with deletion attempt anyway
                }
            }
            
            // Check if it's a file or directory and delete accordingly
            let deleteAttempts = 0;
            const maxAttempts = 3;
            
            // Check if path exists and if it's a file or directory
            let isDirectory = false;
            try {
                const stats = await fs.stat(videoPath);
                isDirectory = stats.isDirectory();
            } catch (statError) {
                console.error(`[DELETE] Could not stat ${videoPath}: ${statError.message}`);
                return res.status(404).json({ error: 'File or directory not found' });
            }
            
            while (deleteAttempts < maxAttempts) {
                try {
                    if (isDirectory) {
                        await fs.rm(videoPath, { recursive: true, force: true });
                        console.log(`[DELETE] Successfully deleted directory: ${filename}`);
                    } else {
                        await fs.unlink(videoPath);
                        console.log(`[DELETE] Successfully deleted file: ${filename}`);
                    }
                    break;
                } catch (deleteError) {
                    deleteAttempts++;
                    
                    if (deleteError.code === 'EBUSY' || deleteError.code === 'ENOENT') {
                        if (deleteAttempts < maxAttempts) {
                            console.log(`[DELETE] File/directory busy, retrying in 2 seconds (attempt ${deleteAttempts}/${maxAttempts})`);
                            await new Promise(resolve => setTimeout(resolve, 2000));
                            continue;
                        } else if (deleteError.code === 'ENOENT') {
                            // File doesn't exist, consider it deleted
                            console.log(`[DELETE] File already deleted: ${filename}`);
                            break;
                        } else {
                            throw new Error(`File is busy or locked. Please stop any torrents seeding this file and try again. (${deleteError.code})`);
                        }
                    } else {
                        throw deleteError;
                    }
                }
            }
            
            // Try to delete metadata file if it exists
            try {
                await fs.unlink(metadataPath);
                console.log(`[DELETE] Deleted metadata file: ${baseName}.info.json`);
            } catch (err) {
                if (err.code !== 'ENOENT') {
                    console.warn(`[DELETE] Warning: Could not delete metadata file: ${err.message}`);
                }
            }
            
            res.json({ success: true });
        } catch (err) {
            if (err.code === 'INVALID_PATH') {
                return res.status(400).json({ error: 'Invalid filename/path' });
            }
            console.error('Error deleting video:', err);
            res.status(500).json({ 
                error: err.message || 'Failed to delete video',
                code: err.code 
            });
        }
    });
    
    // Open file with system default application
    expressApp.post('/api/open-file', async (req, res) => {
        try {
            const { filename } = req.body;
            
            if (!filename) {
                return res.status(400).json({ error: 'Filename is required' });
            }
            
            const dir = settings.downloadDir;
            const filePath = resolvePathInsideDir(dir, filename);
            
            console.log(`[OPEN-FILE] Attempting to open: ${filePath}`);
            console.log(`[OPEN-FILE] Download dir: ${dir}`);
            console.log(`[OPEN-FILE] Filename: ${filename}`);
            
            // Check if file exists
            try {
                await fs.access(filePath);
                console.log(`[OPEN-FILE] File exists at: ${filePath}`);
            } catch (err) {
                console.log(`[OPEN-FILE] File not found at: ${filePath}`);
                return res.status(404).json({ error: 'File not found' });
            }
            
            // Open file with system default application
            console.log(`[OPEN-FILE] Calling shell.openPath with: ${filePath}`);
            
            try {
                const result = await shell.openPath(filePath);
                console.log(`[OPEN-FILE] shell.openPath result: "${result}"`);
                
                if (result) {
                    // If result is not empty, it means there was an error
                    console.error('[OPEN-FILE] shell.openPath failed:', result);
                    
                    // Fallback for Windows: try using shell.openExternal with file:// protocol
                    if (process.platform === 'win32') {
                        console.log('[OPEN-FILE] Trying Windows fallback...');
                        const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`;
                        console.log(`[OPEN-FILE] Trying file URL: ${fileUrl}`);
                        
                        try {
                            await shell.openExternal(fileUrl);
                            res.json({ success: true, message: 'File opened successfully (fallback)' });
                        } catch (fallbackError) {
                            console.error('[OPEN-FILE] Fallback failed:', fallbackError);
                            res.status(500).json({ error: 'Failed to open file', details: result });
                        }
                    } else {
                        res.status(500).json({ error: 'Failed to open file', details: result });
                    }
                } else {
                    console.log('[OPEN-FILE] File opened successfully');
                    res.json({ success: true, message: 'File opened successfully' });
                }
            } catch (error) {
                console.error('[OPEN-FILE] Exception occurred:', error);
                res.status(500).json({ error: 'Exception while opening file', details: error.message });
            }
            
        } catch (err) {
            if (err.code === 'INVALID_PATH') {
                return res.status(400).json({ error: 'Invalid filename/path' });
            }
            console.error('Error opening file:', err);
            res.status(500).json({ error: 'Failed to open file' });
        }
    });
    
    // Open downloads folder in file explorer
    expressApp.post('/api/open-downloads-folder', async (req, res) => {
        try {
            let dir = settings.downloadDir;
            
            // Ensure we have an absolute path
            if (!path.isAbsolute(dir)) {
                dir = path.resolve(dir);
            }
            
            console.log(`[OPEN-FOLDER] Attempting to open downloads folder: ${dir}`);
            
            // Check if directory exists
            try {
                await fs.access(dir);
                console.log(`[OPEN-FOLDER] Downloads directory exists: ${dir}`);
            } catch (err) {
                console.log(`[OPEN-FOLDER] Downloads directory not found: ${dir}`);
                return res.status(404).json({ error: 'Downloads folder not found' });
            }
            
            // Open folder with system file explorer
            try {
                const result = await shell.openPath(dir);
                console.log(`[OPEN-FOLDER] shell.openPath result: "${result}"`);
                
                // shell.openPath returns empty string on success, error message on failure
                if (result === '') {
                    console.log('[OPEN-FOLDER] Downloads folder opened successfully');
                    res.json({ success: true, message: 'Downloads folder opened successfully' });
                } else {
                    console.error('[OPEN-FOLDER] shell.openPath failed:', result);
                    res.status(500).json({ error: 'Failed to open downloads folder', details: result });
                }
            } catch (error) {
                console.error('[OPEN-FOLDER] Exception occurred:', error);
                res.status(500).json({ error: 'Exception while opening downloads folder', details: error.message });
            }
            
        } catch (err) {
            console.error('Error opening downloads folder:', err);
            res.status(500).json({ error: 'Failed to open downloads folder' });
        }
    });

    // Dependency updater endpoints
    expressApp.get('/api/dependencies/status', async (req, res) => {
        try {
            const dependencies = {
                'aria2c': {
                    filename: 'aria2c.exe',
                    repo: 'aria2/aria2',
                    assetPattern: 'win-64bit-build1.zip'
                },
                'ffmpeg': {
                    filename: 'ffmpeg.exe',
                    repo: 'BtbN/FFmpeg-Builds',
                    assetPattern: 'ffmpeg-master-latest-win64-gpl.zip',
                    extraFiles: ['ffplay.exe', 'ffprobe.exe']
                },
                'yt-dlp': {
                    filename: 'yt-dlp.exe',
                    repo: 'yt-dlp/yt-dlp',
                    assetPattern: 'yt-dlp.exe'
                }
            };

            const status = {};
            
            for (const [name, info] of Object.entries(dependencies)) {
                const exePath = path.join(depPath, info.filename);
                let currentVersion = 'Not installed';
                
                if (fsSync.existsSync(exePath)) {
                    try {
                        if (name === 'aria2c') {
                            const result = await execAsync(`"${exePath}" --version`, { timeout: 10000 });
                            const match = result.stdout.match(/aria2 version ([\d.]+)/);
                            if (match) currentVersion = match[1];
                        } else if (name === 'ffmpeg') {
                            const result = await execAsync(`"${exePath}" -version`, { timeout: 10000 });
                            const match = result.stdout.match(/ffmpeg version (\S+)/);
                            if (match) {
                                // Extract date from version string (handles formats like N-119869-g3ac7d70291-20250611)
                                const versionStr = match[1];
                                // Try to find date at the end of the string (YYYYMMDD format)
                                const dateMatch = versionStr.match(/(\d{8})$/);
                                if (dateMatch) {
                                    // Convert YYYYMMDD to YYYY-MM-DD
                                    const dateStr = dateMatch[1];
                                    const formattedDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
                                    currentVersion = `Build ${formattedDate}`;
                                } else {
                                    // Try other date formats
                                    const altDateMatch = versionStr.match(/(\d{4}-\d{2}-\d{2})/);
                                    currentVersion = altDateMatch ? `Build ${altDateMatch[1]}` : match[1];
                                }
                            }
                        } else if (name === 'yt-dlp') {
                            const result = await execAsync(`"${exePath}" --version`, { timeout: 10000 });
                            currentVersion = result.stdout.trim();
                        }
                    } catch (err) {
                        logger.warn('DEPENDENCIES', `Failed to get version for ${name}`, err);
                        currentVersion = 'Unknown';
                    }
                }
                
                status[name] = {
                    installed: fsSync.existsSync(exePath),
                    currentVersion,
                    latestVersion: 'Checking...'
                };
            }
            
            res.json(status);
        } catch (err) {
            logger.error('DEPENDENCIES', 'Failed to get dependency status', err);
            res.status(500).json({ error: 'Failed to get dependency status' });
        }
    });

    expressApp.get('/api/dependencies/latest', async (req, res) => {
        try {
            const axios = require('axios');
            const dependencies = {
                'aria2c': {
                    repo: 'aria2/aria2',
                    assetPattern: 'win-64bit-build1.zip'
                },
                'ffmpeg': {
                    repo: 'BtbN/FFmpeg-Builds',
                    assetPattern: 'ffmpeg-master-latest-win64-gpl.zip'
                },
                'yt-dlp': {
                    repo: 'yt-dlp/yt-dlp',
                    assetPattern: 'yt-dlp.exe'
                }
            };

            const latestVersions = {};
            
            for (const [name, info] of Object.entries(dependencies)) {
                try {
                    const response = await axios.get(
                        `https://api.github.com/repos/${info.repo}/releases/latest`,
                        { timeout: 30000 }
                    );
                    
                    const tagName = response.data.tag_name;
                    let version = tagName;
                    
                    if (name === 'aria2c' && tagName.startsWith('release-')) {
                        version = tagName.substring(8);
                    } else if (name === 'ffmpeg') {
                        const publishedDate = response.data.published_at.substring(0, 10);
                        version = `Build ${publishedDate}`;
                    }
                    
                    latestVersions[name] = version;
                } catch (err) {
                    logger.warn('DEPENDENCIES', `Failed to get latest version for ${name}`, err);
                    latestVersions[name] = 'Error';
                }
            }
            
            res.json(latestVersions);
        } catch (err) {
            logger.error('DEPENDENCIES', 'Failed to get latest versions', err);
            res.status(500).json({ error: 'Failed to get latest versions' });
        }
    });

    expressApp.post('/api/dependencies/update', async (req, res) => {
        const { dependency } = req.body;
        
        if (!dependency || !['aria2c', 'ffmpeg', 'yt-dlp'].includes(dependency)) {
            return res.status(400).json({ error: 'Invalid dependency name' });
        }
        
        const axios = require('axios');
        const AdmZip = require('adm-zip');
        const tempDir = path.join(basePath, '.temp_update');
        
        try {
            // Create temp directory
            await fs.mkdir(tempDir, { recursive: true });
            
            logger.info('DEPENDENCIES', `Starting update for ${dependency}`);
            
            const dependencies = {
                'aria2c': {
                    filename: 'aria2c.exe',
                    repo: 'aria2/aria2',
                    assetPattern: 'win-64bit-build1.zip'
                },
                'ffmpeg': {
                    filename: 'ffmpeg.exe',
                    repo: 'BtbN/FFmpeg-Builds',
                    assetPattern: 'ffmpeg-master-latest-win64-gpl.zip',
                    extraFiles: ['ffplay.exe', 'ffprobe.exe']
                },
                'yt-dlp': {
                    filename: 'yt-dlp.exe',
                    repo: 'yt-dlp/yt-dlp',
                    assetPattern: 'yt-dlp.exe'
                }
            };
            
            const depInfo = dependencies[dependency];
            
            // Get latest release info
            const releaseResponse = await axios.get(
                `https://api.github.com/repos/${depInfo.repo}/releases/latest`,
                { timeout: 30000 }
            );
            
            let downloadUrl = null;
            
            // Find download URL
            if (dependency === 'yt-dlp') {
                downloadUrl = `https://github.com/${depInfo.repo}/releases/latest/download/yt-dlp.exe`;
            } else {
                for (const asset of releaseResponse.data.assets) {
                    if (asset.name.includes(depInfo.assetPattern)) {
                        downloadUrl = asset.browser_download_url;
                        break;
                    }
                }
            }
            
            if (!downloadUrl) {
                throw new Error('Could not find download URL');
            }
            
            logger.info('DEPENDENCIES', `Downloading ${dependency} from ${downloadUrl}`);
            
            // Download file
            const filename = path.basename(downloadUrl);
            const downloadPath = path.join(tempDir, filename);
            
            const downloadResponse = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream',
                timeout: 300000
            });
            
            const writer = fsSync.createWriteStream(downloadPath);
            downloadResponse.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            
            logger.info('DEPENDENCIES', `Downloaded ${dependency} successfully`);
            
            // Process the download
            const targetPath = path.join(depPath, depInfo.filename);
            
            // Backup existing file
            if (fsSync.existsSync(targetPath)) {
                const backupPath = targetPath + '.bk';
                if (fsSync.existsSync(backupPath)) {
                    await fs.unlink(backupPath);
                }
                await fs.rename(targetPath, backupPath);
                logger.info('DEPENDENCIES', `Backed up existing ${depInfo.filename}`);
            }
            
            // Extract or copy file
            if (dependency === 'yt-dlp') {
                // Direct exe download
                await fs.copyFile(downloadPath, targetPath);
            } else {
                // Extract from zip
                const zip = new AdmZip(downloadPath);
                const entries = zip.getEntries();
                
                let found = false;
                for (const entry of entries) {
                    if (entry.entryName.endsWith(depInfo.filename)) {
                        zip.extractEntryTo(entry, depPath, false, true);
                        found = true;
                        logger.info('DEPENDENCIES', `Extracted ${depInfo.filename}`);
                        break;
                    }
                }
                
                // Extract extra files if specified
                if (depInfo.extraFiles) {
                    for (const extraFile of depInfo.extraFiles) {
                        for (const entry of entries) {
                            if (entry.entryName.endsWith(extraFile)) {
                                const extraPath = path.join(depPath, extraFile);
                                if (fsSync.existsSync(extraPath)) {
                                    const backupPath = extraPath + '.bk';
                                    if (fsSync.existsSync(backupPath)) {
                                        await fs.unlink(backupPath);
                                    }
                                    await fs.rename(extraPath, backupPath);
                                }
                                zip.extractEntryTo(entry, depPath, false, true);
                                logger.info('DEPENDENCIES', `Extracted ${extraFile}`);
                                break;
                            }
                        }
                    }
                }
                
                if (!found) {
                    throw new Error(`Could not find ${depInfo.filename} in archive`);
                }
            }
            
            // Clean up temp directory
            await fs.rm(tempDir, { recursive: true, force: true });
            
            logger.info('DEPENDENCIES', `Successfully updated ${dependency}`);
            res.json({ success: true, message: `Successfully updated ${dependency}` });
            
        } catch (err) {
            logger.error('DEPENDENCIES', `Failed to update ${dependency}`, err);
            
            // Clean up temp directory on error
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupErr) {
                logger.warn('DEPENDENCIES', 'Failed to clean up temp directory', cleanupErr);
            }
            
            res.status(500).json({ error: `Failed to update ${dependency}: ${err.message}` });
        }
    });

    expressApp.post('/api/dependencies/delete-backups', async (req, res) => {
        try {
            const backupFiles = [];
            const files = await fs.readdir(depPath);
            
            for (const file of files) {
                if (file.endsWith('.bk')) {
                    const filePath = path.join(depPath, file);
                    await fs.unlink(filePath);
                    backupFiles.push(file);
                    logger.info('DEPENDENCIES', `Deleted backup file: ${file}`);
                }
            }
            
            res.json({ 
                success: true, 
                deletedCount: backupFiles.length,
                deletedFiles: backupFiles 
            });
        } catch (err) {
            logger.error('DEPENDENCIES', 'Failed to delete backup files', err);
            res.status(500).json({ error: 'Failed to delete backup files' });
        }
    });
    
    // Serve static files from public directory - MUST be after all API routes
    const publicPath = path.join(resourcesPath, 'public');
    console.log('Public path:', publicPath);
    expressApp.use(express.static(publicPath));
    
    return expressApp;
}

// Create the menu
function createMenu() {
    const template = [
        {
            label: 'File',
            submenu: [
                {
                    label: 'About FireFetch',
                    click: () => {
                        const aboutWindow = new BrowserWindow({
                            width: 600,
                            height: 700,
                            parent: mainWindow,
                            modal: true,
                            webPreferences: {
                                nodeIntegration: false,
                                contextIsolation: true
                            },
                            title: 'About FireFetch',
                            backgroundColor: '#0f0f0f',
                            autoHideMenuBar: true,
                            icon: path.join(__dirname, 'icon.ico')
                        });
                        
                        addContextMenuToWindow(aboutWindow);
                        
                        const aboutPath = path.join(resourcesPath, 'public', 'about.html');
                        aboutWindow.loadFile(aboutPath);
                    }
                },
                {
                    label: 'Help',
                    click: () => {
                        const helpWindow = new BrowserWindow({
                            width: 800,
                            height: 600,
                            parent: mainWindow,
                            modal: true,
                            webPreferences: {
                                nodeIntegration: false,
                                contextIsolation: true
                            },
                            title: 'FireFetch Help',
                            backgroundColor: '#0f0f0f',
                            autoHideMenuBar: true,
                            icon: path.join(__dirname, 'icon.ico')
                        });
                        
                        addContextMenuToWindow(helpWindow);
                        
                        const helpPath = path.join(resourcesPath, 'public', 'help.html');
                        helpWindow.loadFile(helpPath);
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Exit',
                    accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
                    click: () => {
                        app.isQuiting = true;
                        app.quit();
                    }
                }
            ]
        }
    ];

    // macOS specific menu adjustments
    if (process.platform === 'darwin') {
        template.unshift({
            label: app.getName(),
            submenu: [
                {
                    label: 'About FireFetch',
                    click: () => {
                        const aboutWindow = new BrowserWindow({
                            width: 600,
                            height: 700,
                            parent: mainWindow,
                            modal: true,
                            webPreferences: {
                                nodeIntegration: false,
                                contextIsolation: true
                            },
                            title: 'About FireFetch',
                            backgroundColor: '#0f0f0f'
                        });
                        
                        addContextMenuToWindow(aboutWindow);
                        
                        const aboutPath = path.join(resourcesPath, 'public', 'about.html');
                        aboutWindow.loadFile(aboutPath);
                    }
                },
                {
                    type: 'separator'
                },
                {
                    label: 'Quit',
                    accelerator: 'Cmd+Q',
                    click: () => {
                        app.quit();
                    }
                }
            ]
        });
    }

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// Create system tray
function createTray() {
    const iconPath = path.join(__dirname, 'icon.ico');
    tray = new Tray(iconPath);
    
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Show FireFetch',
            click: () => {
                mainWindow.show();
                if (process.platform === 'darwin') {
                    app.dock.show();
                }
            }
        },
        {
            label: 'Hide FireFetch',
            click: () => {
                mainWindow.hide();
                if (process.platform === 'darwin') {
                    app.dock.hide();
                }
            }
        },
        {
            type: 'separator'
        },
        {
            label: 'Help',
            click: () => {
                const helpWindow = new BrowserWindow({
                    width: 800,
                    height: 600,
                    parent: mainWindow,
                    modal: false,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true
                    },
                    title: 'FireFetch Help',
                    backgroundColor: '#0f0f0f',
                    autoHideMenuBar: true,
                    icon: path.join(__dirname, 'icon.ico')
                });
                
                addContextMenuToWindow(helpWindow);
                
                const helpPath = path.join(resourcesPath, 'public', 'help.html');
                helpWindow.loadFile(helpPath);
            }
        },
        {
            type: 'separator'
        },
        {
            label: 'Exit',
            click: () => {
                app.isQuiting = true;
                app.quit();
            }
        }
    ]);
    
    tray.setContextMenu(contextMenu);
    tray.setToolTip('FireFetch - Video Downloader');
    
    // Double-click tray icon to show/hide window
    tray.on('double-click', () => {
        if (mainWindow.isVisible()) {
            mainWindow.hide();
        } else {
            mainWindow.show();
            if (process.platform === 'darwin') {
                app.dock.show();
            }
        }
    });
}

// Helper function to add context menu to any window
function addContextMenuToWindow(window) {
    window.webContents.on('context-menu', (event, params) => {
        const { Menu, MenuItem } = require('electron');
        const contextMenu = new Menu();

        // Add copy/paste/cut options for editable content
        if (params.isEditable) {
            if (params.selectionText) {
                contextMenu.append(new MenuItem({
                    label: 'Cut',
                    accelerator: 'CmdOrCtrl+X',
                    click: () => window.webContents.cut()
                }));
                contextMenu.append(new MenuItem({
                    label: 'Copy',
                    accelerator: 'CmdOrCtrl+C',
                    click: () => window.webContents.copy()
                }));
            }
            contextMenu.append(new MenuItem({
                label: 'Paste',
                accelerator: 'CmdOrCtrl+V',
                click: () => window.webContents.paste()
            }));
            if (params.selectionText) {
                contextMenu.append(new MenuItem({ type: 'separator' }));
                contextMenu.append(new MenuItem({
                    label: 'Select All',
                    accelerator: 'CmdOrCtrl+A',
                    click: () => window.webContents.selectAll()
                }));
            }
        } else if (params.selectionText) {
            // For non-editable content, just show copy
            contextMenu.append(new MenuItem({
                label: 'Copy',
                accelerator: 'CmdOrCtrl+C',
                click: () => window.webContents.copy()
            }));
        }

        // Show context menu if it has items
        if (contextMenu.items.length > 0) {
            contextMenu.popup();
        }
    });
}

// Create the main application window
function createWindow() {
    // Create the browser window
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            webviewTag: true,
            experimentalFeatures: true
        },
        title: 'FireFetch',
        backgroundColor: '#0f0f0f',
        icon: path.join(__dirname, 'icon.ico'),
        show: false // Don't show until ready
    });

    // Handle external links - open in default browser instead of new Electron window
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        console.log('External link clicked:', url);
        shell.openExternal(url);
        return { action: 'deny' }; // Prevent opening new window
    });

    // Enable right-click context menu for copy/paste functionality
    addContextMenuToWindow(mainWindow);

    // Create the menu
    createMenu();
    
    // Create system tray
    createTray();

    // Load the app
    mainWindow.loadURL(`http://localhost:${PORT}`);

    // Show window when ready
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.maximize();
    });

    // Handle window close - minimize to tray instead of closing
    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });

    // Handle window closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
    // Initialize logger first
    const logDir = path.join(userDataPath, 'logs');
    await logger.init(logDir);
    logger.info('STARTUP', 'Application initializing', {
        basePath,
        userDataPath,
        depPath,
        isPortable
    });
    
    // (Authentication removed: FireFetch is free/unlocked)
    
    // Load settings and ensure directories exist
    await loadSettings();
    syncLoggerDebugSetting();
    await ensureDownloadsDir();
    await ensureCookiesDir();
    
    // Load download manager state
    await downloadManager.loadState();
    
    // Create and start Express server
    const expressApp = createServer();
    server = expressApp.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        
        // Create window after server starts
        createWindow();
    });
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
    // Don't quit the app when all windows are closed - app runs in system tray
    // Only quit if running on macOS and user explicitly quits
    if (process.platform === 'darwin') {
        app.dock.hide();
    }
});

// Clean up server on app quit
app.on('before-quit', async () => {
    logger.info('SYSTEM', 'Application shutting down...');
    
    // Save download state before shutdown
    await downloadManager.saveState();
    
    // Shutdown download manager
    downloadManager.shutdown();
    
    // Clean up torrents
    cleanupTorrents();
    
    if (server) {
        server.close();
    }
    
    // Close logger last
    logger.close();
});

// Handle deep links (optional)
app.on('open-url', (event, url) => {
    event.preventDefault();
    // Handle the URL if you want to support opening URLs from outside
});