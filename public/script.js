let currentVideoInfo = null;

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

// Handle direct file downloads
async function handleDirectFileDownload(url) {
    try {
        // Show progress section
        document.getElementById('loading').style.display = 'none';
        document.getElementById('videoInfo').style.display = 'none';
        document.getElementById('downloadProgress').style.display = 'block';
        
        // Update UI to show file download status
        const progressElement = document.getElementById('progressText');
        progressElement.textContent = 'Starting file download...';
        
        const response = await fetch('/api/file-download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        
        if (!response.ok) {
            showError(data.error || 'Failed to start file download', data.details || '');
            document.getElementById('downloadProgress').style.display = 'none';
            return;
        }
        
        progressElement.textContent = `File download started: ${data.filename}`;
        
        // Immediately redirect to downloads page
        setTimeout(() => {
            window.location.href = '/downloads.html';
        }, 1000);
        
    } catch (error) {
        console.error('File download error:', error);
        showError('Failed to start file download');
        document.getElementById('downloadProgress').style.display = 'none';
    }
}

function showError(message, details = '') {
    const errorDiv = document.getElementById('errorMessage');
    if (!errorDiv) {
        // Create error element if it doesn't exist
        const div = document.createElement('div');
        div.id = 'errorMessage';
        div.className = 'error-message';
        const container = document.querySelector('.input-section').parentNode;
        container.insertBefore(div, document.querySelector('.input-section').nextSibling);
    }
    
    const errorContainer = document.getElementById('errorMessage');
    errorContainer.innerHTML = `
        <div class="error-content">
            <strong>${message}</strong>
            ${details ? `<div class="error-details">${details}</div>` : ''}
            <div style="margin-top: 10px; font-style: italic; color: #ff6a00;">
                "Gretchen, stop trying to make fetch happen, it's not going to happen!"
            </div>
            <div style="margin-top: 15px; text-align: center;">
                <img src="fetch.gif" alt="Fetch GIF" style="max-width: 200px; border-radius: 8px;">
            </div>
        </div>
    `;
    errorContainer.style.display = 'block';
}

function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

function showDRMError(message = 'This content is protected by DRM (digital-rights management) software. We can\'t legally bypass this.') {
    const errorDiv = document.getElementById('drmErrorMessage');
    if (!errorDiv) {
        // Create error element if it doesn't exist
        const div = document.createElement('div');
        div.id = 'drmErrorMessage';
        div.className = 'error-message';
        const container = document.querySelector('.input-section').parentNode;
        container.insertBefore(div, document.querySelector('.input-section').nextSibling);
    }
    
    const errorContainer = document.getElementById('drmErrorMessage');
    errorContainer.innerHTML = `
        <div class="error-content">
            <strong>Error: ${message}</strong>
            <div style="margin-top: 15px; text-align: center;">
                <img src="bitches.gif" alt="DRM Error GIF" style="max-width: 200px; border-radius: 8px;">
            </div>
        </div>
    `;
    errorContainer.style.display = 'block';
    
    // Auto-hide after 15 seconds (longer for DRM message)
    setTimeout(() => {
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }, 15000);
}

function showDownloadError(message) {
    const errorDiv = document.getElementById('downloadErrorMessage');
    if (!errorDiv) {
        // Create error element if it doesn't exist
        const div = document.createElement('div');
        div.id = 'downloadErrorMessage';
        div.className = 'error-message';
        div.style.position = 'fixed';
        div.style.bottom = '20px';
        div.style.right = '20px';
        div.style.maxWidth = '400px';
        div.style.zIndex = '1000';
        document.body.appendChild(div);
    }
    
    const errorContainer = document.getElementById('downloadErrorMessage');
    errorContainer.innerHTML = `
        <div class="error-content">
            <strong>${message}</strong>
            <div style="margin-top: 10px; font-style: italic; color: #ff6a00;">
                "Gretchen, stop trying to make fetch happen, it's not going to happen!"
            </div>
            <div style="margin-top: 15px; text-align: center;">
                <img src="fetch.gif" alt="Fetch GIF" style="max-width: 200px; border-radius: 8px;">
            </div>
            <button onclick="document.getElementById('downloadErrorMessage').style.display='none'" 
                    style="margin-top: 15px; background: #ff6a00; color: white; border: none; 
                           padding: 5px 10px; border-radius: 4px; cursor: pointer;">
                Close
            </button>
        </div>
    `;
    errorContainer.style.display = 'block';
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (errorContainer) {
            errorContainer.style.display = 'none';
        }
    }, 10000);
}

async function fetchVideoInfo() {
    const urlInput = document.getElementById('urlInput');
    const url = urlInput.value.trim();
    
    if (!url) {
        showError('Please enter a valid URL');
        return;
    }

    // Secret debug functionality - if user types "drm", show DRM error
    if (url.toLowerCase() === 'drm') {
        showDRMError();
        return;
    }

    // Hide any previous errors
    hideError();
    
    // Check if it's a magnet link or torrent file
    const isMagnet = url.startsWith('magnet:');
    const isTorrent = url.toLowerCase().endsWith('.torrent');
    
    if (isMagnet || isTorrent) {
        // For torrents and magnets, skip video info and go directly to download
        handleTorrentDownload(url, isMagnet ? 'magnet' : 'torrent');
        return;
    }
    
    // Let yt-dlp try to handle any URL - direct file detection is now handled by the download system
    
    // Show loading
    document.getElementById('loading').style.display = 'block';
    document.getElementById('videoInfo').style.display = 'none';
    document.getElementById('downloadProgress').style.display = 'none';

    try {
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        
        if (!response.ok) {
            // Show specific error message from server
            const errorMsg = data.error || 'Failed to fetch video info';
            const details = data.details || '';
            
            // Check if this is a DRM-related error
            if (errorMsg.toLowerCase().includes('drm') || 
                details.toLowerCase().includes('drm') ||
                errorMsg.toLowerCase().includes('protected') ||
                details.toLowerCase().includes('protected')) {
                showDRMError();
            } else {
                showError(errorMsg, details);
            }
            return;
        }

        currentVideoInfo = data;
        
        // Check if this is a direct file download
        if (isDirectFileDownload(data)) {
            displayFileInfo(data);
        } else {
            displayVideoInfo(data);
        }
    } catch (error) {
        showError('Network error', error.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

// Check if the response indicates a direct file download
function isDirectFileDownload(info) {
    if (info.formats && info.formats.length >= 1) {
        const format = info.formats[0];
        return format.resolution === 'file' || 
               format.format_note === 'Direct file download' ||
               (format.vcodec === 'none' && format.acodec === 'none' && format.downloadMethod === 'aria2c');
    }
    return false;
}

// Display file download information
function displayFileInfo(info) {
    // Hide other sections
    document.getElementById('videoInfo').style.display = 'none';
    document.getElementById('downloadProgress').style.display = 'none';
    
    // Show file info section
    document.getElementById('fileInfo').style.display = 'block';
    
    // Get file format info
    const format = info.formats[0];
    const fileName = info.title || 'Unknown File';
    const fileExt = format.ext || 'unknown';
    const fileSize = format.filesize ? formatFilesize(format.filesize) : 'Unknown size';
    
    // Set file details
    document.getElementById('fileName').textContent = fileName;
    document.getElementById('fileType').textContent = fileExt.toUpperCase() + ' file';
    document.getElementById('fileSize').textContent = fileSize;
    
    // Set file source
    try {
        if (info.webpage_url) {
            const hostname = new URL(info.webpage_url).hostname;
            document.getElementById('fileSource').textContent = hostname;
        } else {
            document.getElementById('fileSource').textContent = 'Direct link';
        }
    } catch (e) {
        document.getElementById('fileSource').textContent = 'Unknown source';
    }
    
    // Set description if available
    const descriptionElement = document.getElementById('fileDescription');
    if (info.description) {
        descriptionElement.textContent = info.description.substring(0, 200) + '...';
        descriptionElement.style.display = 'block';
    } else {
        descriptionElement.style.display = 'none';
    }
    
    // Update file icon based on extension
    const iconElement = document.querySelector('.file-icon');
    iconElement.textContent = getFileIcon(fileExt);
}

// Get appropriate icon for file type
function getFileIcon(extension) {
    const ext = extension.toLowerCase();
    
    // Document types
    if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(ext)) return '📄';
    
    // Archive types
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2'].includes(ext)) return '📦';
    
    // Executable types
    if (['exe', 'msi', 'dmg', 'pkg', 'deb', 'rpm', 'apk'].includes(ext)) return '⚙️';
    
    // Image types
    if (['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return '🖼️';
    
    // Audio types
    if (['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'].includes(ext)) return '🎵';
    
    // Video types
    if (['mp4', 'avi', 'mkv', 'mov', 'wmv', 'flv', 'webm'].includes(ext)) return '🎬';
    
    // Code types
    if (['js', 'py', 'java', 'cpp', 'c', 'html', 'css', 'php'].includes(ext)) return '💻';
    
    // Default file icon
    return '📄';
}

// Download file function
function downloadFile() {
    if (!currentVideoInfo) {
        showError('No file information available');
        return;
    }
    
    // Get the file format
    const format = currentVideoInfo.formats[0];
    
    // Redirect to Downloads page with file download parameters
    const params = new URLSearchParams({
        url: currentVideoInfo.webpage_url || format.url,
        format: format.format_id,
        title: currentVideoInfo.title
    });
    
    window.location.href = `downloads.html?${params.toString()}`;
}

function displayVideoInfo(info) {
    // Hide other sections
    document.getElementById('fileInfo').style.display = 'none';
    document.getElementById('downloadProgress').style.display = 'none';
    
    // Set video details
    document.getElementById('thumbnail').src = info.thumbnail || '';
    document.getElementById('title').textContent = info.title || 'Unknown Title';
    document.getElementById('uploader').textContent = info.uploader || info.extractor || 'Unknown';
    document.getElementById('duration').textContent = info.duration || '';
    try {
        if (info.extractor) {
            document.getElementById('site').textContent = info.extractor;
        } else if (info.webpage_url) {
            document.getElementById('site').textContent = new URL(info.webpage_url).hostname;
        } else {
            document.getElementById('site').textContent = 'Unknown';
        }
    } catch (e) {
        document.getElementById('site').textContent = info.extractor || 'Unknown';
    }
    document.getElementById('description').textContent = info.description ? 
        info.description.substring(0, 200) + '...' : '';

    // Populate quality options
    const qualitySelect = document.getElementById('qualitySelect');
    qualitySelect.innerHTML = '<option value="">Select quality...</option>';
    
    // Add best format option first - this will merge best video + best audio
    const bestOption = document.createElement('option');
    bestOption.value = 'best';
    bestOption.textContent = 'Best Quality (Auto-select highest resolution)';
    qualitySelect.appendChild(bestOption);
    
    // Group formats by type
    const bestFormats = [];
    const videoFormats = [];
    const audioFormats = [];
    const otherFormats = [];
    
    info.formats.forEach(format => {
        if (format.vcodec && format.vcodec !== 'none' && format.acodec && format.acodec !== 'none') {
            bestFormats.push(format);
        } else if (format.vcodec && format.vcodec !== 'none') {
            videoFormats.push(format);
        } else if (format.acodec && format.acodec !== 'none') {
            audioFormats.push(format);
        } else {
            // Handle formats without clear video/audio codec info
            otherFormats.push(format);
        }
    });
    
    // Add best formats (video + audio)
    if (bestFormats.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Pre-merged (Video + Audio) - Limited Quality';
        bestFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.format_id;
            let text = `${format.resolution}`;
            if (format.fps && format.fps > 30) {
                text += `@${format.fps}fps`;
            }
            text += ` (${format.ext})`;
            if (format.format_note) {
                text += ` ${format.format_note}`;
            }
            if (format.filesize) {
                text += ` - ${formatFilesize(format.filesize)}`;
            }
            option.textContent = text;
            optgroup.appendChild(option);
        });
        qualitySelect.appendChild(optgroup);
    }
    
    // Add video-only formats (will be merged with audio)
    if (videoFormats.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'High Quality Video (Will merge with best audio)';
        videoFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.format_id;
            let text = `${format.resolution}`;
            if (format.fps && format.fps > 30) {
                text += `@${format.fps}fps`;
            }
            text += ` (${format.ext}→mp4)`;
            if (format.format_note) {
                text += ` ${format.format_note}`;
            }
            if (format.filesize) {
                text += ` - ${formatFilesize(format.filesize)}`;
            }
            option.textContent = text;
            optgroup.appendChild(option);
        });
        qualitySelect.appendChild(optgroup);
    }
    
    // Add audio-only formats
    if (audioFormats.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Audio Only';
        audioFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.format_id;
            let text = `Audio (${format.ext})`;
            if (format.format_note) {
                text += ` ${format.format_note}`;
            }
            if (format.filesize) {
                text += ` - ${formatFilesize(format.filesize)}`;
            }
            option.textContent = text;
            optgroup.appendChild(option);
        });
        qualitySelect.appendChild(optgroup);
    }
    
    // Add other formats (e.g., from non-YouTube sites)
    if (otherFormats.length > 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'Other Formats';
        otherFormats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.format_id;
            let text = `${format.resolution || format.format_note || format.format_id}`;
            if (format.ext) {
                text += ` (${format.ext})`;
            }
            if (format.protocol) {
                text += ` [${format.protocol}]`;
            }
            if (format.filesize) {
                text += ` - ${formatFilesize(format.filesize)}`;
            }
            option.textContent = text;
            optgroup.appendChild(option);
        });
        qualitySelect.appendChild(optgroup);
    }
    
    // Show all formats for debugging if there are formats but none categorized
    if (info.formats.length > 0 && bestFormats.length === 0 && videoFormats.length === 0 && 
        audioFormats.length === 0 && otherFormats.length === 0) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = 'All Available Formats';
        info.formats.forEach(format => {
            const option = document.createElement('option');
            option.value = format.format_id;
            let text = `${format.format_id}`;
            if (format.resolution) text += ` - ${format.resolution}`;
            if (format.ext) text += ` (${format.ext})`;
            if (format.format_note) text += ` ${format.format_note}`;
            if (format.filesize) text += ` - ${formatFilesize(format.filesize)}`;
            option.textContent = text;
            optgroup.appendChild(option);
        });
        qualitySelect.appendChild(optgroup);
    }

    // Show video info section
    document.getElementById('videoInfo').style.display = 'block';
    
    // Set default quality based on settings
    const savedSettings = localStorage.getItem('firefetch-settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        const defaultQuality = settings.defaultQuality;
        
        // Try to set the default quality
        if (defaultQuality && defaultQuality !== 'best') {
            // Look for matching quality option
            const options = qualitySelect.getElementsByTagName('option');
            for (const option of options) {
                if (option.value === defaultQuality || 
                    (option.textContent && option.textContent.includes(defaultQuality))) {
                    qualitySelect.value = option.value;
                    break;
                }
            }
        } else {
            // Set to best quality
            qualitySelect.value = 'best';
        }
    }
}

function formatFilesize(bytes) {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

async function downloadVideo() {
    const url = document.getElementById('urlInput').value.trim();
    const format = document.getElementById('qualitySelect').value;
    
    if (!url || !format) {
        alert('Please select a quality format');
        return;
    }

    // Redirect to Downloads page with parameters
    const params = new URLSearchParams({
        url: url,
        format: format
    });
    
    window.location.href = `downloads.html?${params.toString()}`;
}

function updateProgress(progressText, showDetailed = true) {
    const progressElement = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    
    if (showDetailed) {
        progressElement.textContent = progressText;
    } else {
        // Show simple progress without detailed info
        const percentMatch = progressText.match(/(\d+\.?\d*)%/);
        if (percentMatch) {
            progressElement.textContent = `Downloading... ${percentMatch[0]}`;
        } else {
            progressElement.textContent = 'Downloading...';
        }
    }
    
    // Extract percentage from progress text
    const percentMatch = progressText.match(/(\d+\.?\d*)%/);
    if (percentMatch) {
        // Limit to 90% max while downloading (red bar)
        const percentage = Math.min(parseFloat(percentMatch[1]), 90);
        progressBar.style.width = percentage + '%';
    }
}
// Handle torrent and magnet downloads
async function handleTorrentDownload(url, type) {
    try {
        // Show loading
        document.getElementById("loading").style.display = "block";
        document.getElementById("videoInfo").style.display = "none";
        document.getElementById("downloadProgress").style.display = "none";
        
        // Add to download queue directly
        const response = await fetch("/api/download", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                url: url, 
                format: type, 
                title: `${type.charAt(0).toUpperCase() + type.slice(1)} Download`
            })
        });

        // Check if response is ok before parsing JSON
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
        }

        let result;
        try {
            result = await response.json();
        } catch (jsonError) {
            throw new Error(`Invalid JSON response from server: ${jsonError.message}`);
        }
        
        if (result.success) {
            // Hide loading and show success
            document.getElementById("loading").style.display = "none";
            
            // Show success message
            const successDiv = document.createElement("div");
            successDiv.className = "success-message";
            successDiv.style.cssText = `
                background: #2ecc71;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                margin: 20px 0;
                text-align: center;
            `;
            successDiv.innerHTML = `
                <strong>${type.charAt(0).toUpperCase() + type.slice(1)} added to download queue\!</strong>
                <div style="margin-top: 10px;">
                    <a href="downloads.html" style="color: white; text-decoration: underline;">
                        View Downloads →
                    </a>
                </div>
            `;
            
            const container = document.querySelector(".content-wrapper");
            container.insertBefore(successDiv, document.getElementById("loading"));
            
            // Auto-hide after 5 seconds
            setTimeout(() => {
                if (successDiv.parentNode) {
                    successDiv.remove();
                }
            }, 5000);
            
            // Clear the URL input
            document.getElementById("urlInput").value = "";
            
        } else {
            const errorMsg = result.error || "Unknown error";
            // Check if this is a DRM-related error
            if (errorMsg.toLowerCase().includes('drm') || 
                errorMsg.toLowerCase().includes('protected')) {
                showDRMError();
            } else {
                showError("Failed to add to download queue", errorMsg);
            }
        }
    } catch (error) {
        console.error('Error in handleTorrentDownload:', error);
        
        // Provide more specific error messages
        let errorMessage = error.message;
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = "Unable to connect to the server. Please check if the application is running.";
        } else if (error.message.includes('HTTP 500')) {
            errorMessage = "Server error occurred while adding the torrent. Check the server logs.";
        } else if (error.message.includes('HTTP 400')) {
            errorMessage = "Invalid request. Please check the torrent URL.";
        }
        
        // Check if this is a DRM-related error
        if (errorMessage.toLowerCase().includes('drm') || 
            errorMessage.toLowerCase().includes('protected')) {
            showDRMError();
        } else {
            showError("Network error", errorMessage);
        }
    } finally {
        document.getElementById("loading").style.display = "none";
    }
}
