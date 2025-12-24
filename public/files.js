let allFiles = [];
let filteredFiles = [];
let currentFile = null;

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    loadFiles();
});

// Load files from the server
async function loadFiles() {
    try {
        const response = await fetch('/api/videos');
        const data = await response.json();
        
        // Filter for non-video files (torrents, archives, executables, etc.)
        allFiles = data.filter(file => {
            // Check if it's marked as a direct file download
            if (file.isFile) {
                return true;
            }
            
            // Use the fileType from the API if available
            if (file.fileType === 'torrent') {
                return true;
            }
            
            // Check if it's a torrent download by metadata fields
            if (file.extractor === 'peerflix' || file.download_type === 'torrent' || file.extractor_key === 'torrent' || file.siteKey === 'torrent') {
                return true;
            }
            
            // Check by file extension - exclude common video extensions to catch everything else
            const filename = file.filename.toLowerCase();
            const isVideoFile = filename.match(/\.(mp4|avi|mkv|mov|wmv|flv|webm|m4v|mpg|mpeg|3gp|asf|divx|f4v|m2v|mts|mxf|ogv|rm|rmvb|ts|vob|y4m)$/i);
            return !isVideoFile; // Include everything that's NOT a video file
        });
        
        filteredFiles = [...allFiles];
        displayFiles();
        updateTypeFilter();
    } catch (error) {
        console.error('Error loading files:', error);
        showNoFiles('Error loading files');
    }
}

// Display files in the grid
function displayFiles() {
    const filesGrid = document.getElementById('filesGrid');
    const noFiles = document.getElementById('noFiles');
    
    if (filteredFiles.length === 0) {
        filesGrid.style.display = 'none';
        noFiles.style.display = 'block';
        return;
    }
    
    filesGrid.style.display = 'grid';
    noFiles.style.display = 'none';
    
    filesGrid.innerHTML = filteredFiles.map(file => createFileCard(file)).join('');

    try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    } catch {
        // ignore icon failures
    }
}

// Create a file card HTML
function createFileCard(file) {
    const icon = getFileIcon(file.filename, file);
    const type = getFileType(file.filename, file);
    const size = formatFileSize(file.totalSize || file.filesize || file.size || 0);
    const date = new Date(file.downloadDate || file.download_date || Date.now()).toLocaleDateString();
    
    return `
        <div class="ff-card ff-card-pad file-card" onclick="showFileModal('${file.filename}')">
            <div class="media-actions">
                <button class="icon-btn" type="button" onclick="event.stopPropagation(); openFile('${file.filename}')" title="Open">
                    <i data-lucide="external-link"></i>
                </button>
                <button class="icon-btn danger" type="button" onclick="event.stopPropagation(); deleteFile('${file.filename}')" title="Delete">
                    <i data-lucide="trash-2"></i>
                </button>
            </div>
            <div style="display:flex; gap: 12px; align-items: center;">
                <div class="file-icon">${icon}</div>
                <div style="min-width:0">
                    <div class="media-title">${truncateText(file.title || file.filename, 42)}</div>
                    <div class="media-sub"><span>${type}</span><span>• ${size}</span><span>• ${date}</span></div>
                </div>
            </div>
        </div>
    `;
}

// Get file icon based on extension or file metadata
function getFileIcon(filename, file) {
    // Check if it's a torrent download first
    if (file && (file.fileType === 'torrent' || file.extractor === 'peerflix' || file.download_type === 'torrent' || file.siteKey === 'torrent')) {
        return '🧲';
    }
    
    const ext = filename.toLowerCase().split('.').pop();
    const icons = {
        'iso': '💿',
        'img': '💿',
        'dmg': '💿',
        'exe': '⚙️',
        'zip': '📦',
        'rar': '📦',
        '7z': '📦',
        'tar': '📦',
        'gz': '📦',
        'bin': '⚡',
        'deb': '📦',
        'rpm': '📦',
        'pkg': '📦',
        'torrent': '🧲'
    };
    return icons[ext] || '📁';
}

// Get file type category
function getFileType(filename, file) {
    // Check if it's a torrent download first
    if (file && (file.fileType === 'torrent' || file.extractor === 'peerflix' || file.download_type === 'torrent' || file.siteKey === 'torrent')) {
        return 'Torrent Download';
    }
    
    const ext = filename.toLowerCase().split('.').pop();
    
    if (['iso', 'img', 'dmg'].includes(ext)) return 'Disk Image';
    if (['exe', 'bin'].includes(ext)) return 'Executable';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'deb', 'rpm', 'pkg'].includes(ext)) return 'Archive';
    if (ext === 'torrent') return 'Torrent';
    
    return 'File';
}

// Get file type for filtering
function getFileTypeCategory(filename, file) {
    // Check if it's a torrent download first
    if (file && (file.fileType === 'torrent' || file.extractor === 'peerflix' || file.download_type === 'torrent' || file.siteKey === 'torrent')) {
        return 'torrent';
    }
    
    const ext = filename.toLowerCase().split('.').pop();
    
    if (['iso', 'img', 'dmg'].includes(ext)) return 'disk';
    if (['exe', 'bin'].includes(ext)) return 'executable';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'deb', 'rpm', 'pkg'].includes(ext)) return 'archive';
    if (ext === 'torrent') return 'torrent';
    
    return 'other';
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Truncate text
function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Update type filter options
function updateTypeFilter() {
    const typeFilter = document.getElementById('typeFilter');
    const types = [...new Set(allFiles.map(file => getFileTypeCategory(file.filename, file)))];
    
    // Keep existing options and add found types
    const existingOptions = Array.from(typeFilter.options).map(opt => opt.value);
    
    types.forEach(type => {
        if (!existingOptions.includes(type)) {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type.charAt(0).toUpperCase() + type.slice(1) + 's';
            typeFilter.appendChild(option);
        }
    });
}

// Filter files by type
function filterFiles() {
    const typeFilter = document.getElementById('typeFilter').value;
    
    if (typeFilter === '') {
        filteredFiles = [...allFiles];
    } else {
        filteredFiles = allFiles.filter(file => getFileTypeCategory(file.filename, file) === typeFilter);
    }
    
    displayFiles();
}

// Sort files
function sortFiles() {
    const sortBy = document.getElementById('sortBy').value;
    
    filteredFiles.sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return (a.title || a.filename).localeCompare(b.title || b.filename);
            case 'size':
                return (b.totalSize || b.filesize || b.size || 0) - (a.totalSize || a.filesize || a.size || 0);
            case 'type':
                return getFileType(a.filename, a).localeCompare(getFileType(b.filename, b));
            case 'date':
            default:
                return new Date(b.downloadDate || b.download_date || 0) - new Date(a.downloadDate || a.download_date || 0);
        }
    });
    
    displayFiles();
}

// Show file modal
async function showFileModal(filename) {
    try {
        // Find the file in our data
        currentFile = allFiles.find(file => file.filename === filename);
        if (!currentFile) {
            console.error('File not found:', filename);
            return;
        }
        
        // Update modal content
        document.getElementById('modalIcon').textContent = getFileIcon(filename, currentFile);
        document.getElementById('modalTitle').textContent = currentFile.title || filename;
        document.getElementById('modalType').textContent = getFileType(filename, currentFile);
        document.getElementById('modalSize').textContent = formatFileSize(currentFile.totalSize || currentFile.filesize || currentFile.size || 0);
        document.getElementById('modalDate').textContent = new Date(currentFile.downloadDate || currentFile.download_date || Date.now()).toLocaleString();
        document.getElementById('modalSource').textContent = currentFile.siteUrl || currentFile.webpage_url || currentFile.originalUrl || 'Unknown';
        
        // Load metadata if available
        try {
            const metadataResponse = await fetch(`/downloads/${filename.replace(/\.[^/.]+$/, '.info.json')}`);
            if (metadataResponse.ok) {
                const metadata = await metadataResponse.json();
                document.getElementById('metadataContent').textContent = JSON.stringify(metadata, null, 2);
            } else {
                document.getElementById('metadataContent').textContent = 'No metadata available';
            }
        } catch (error) {
            document.getElementById('metadataContent').textContent = 'No metadata available';
        }
        
        // Show modal
        document.getElementById('fileModal').style.display = 'flex';
        document.getElementById('fullMetadata').style.display = 'none';
        
    } catch (error) {
        console.error('Error showing file modal:', error);
    }
}

// Close modal
function closeModal() {
    document.getElementById('fileModal').style.display = 'none';
    currentFile = null;
}

// Show full metadata
function showFullMetadata() {
    const fullMetadata = document.getElementById('fullMetadata');
    fullMetadata.style.display = fullMetadata.style.display === 'none' ? 'block' : 'none';
}

// Open file in default application
async function openFile(filename) {
    if (!filename && currentFile) {
        filename = currentFile.filename;
    }
    
    if (filename) {
        try {
            const response = await fetch('/api/open-file', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ filename })
            });
            
            const result = await response.json();
            
            if (result.success) {
                console.log('File opened successfully');
                // File opened successfully - no need for notification as the file will open
            } else {
                console.error('Failed to open file:', result.error);
                alert(`Failed to open file: ${result.error}`);
            }
        } catch (error) {
            console.error('Error opening file:', error);
            alert('Error opening file. Please try again.');
        }
    }
}

// Open downloads folder in file explorer
async function openDownloadsFolder() {
    try {
        const response = await fetch('/api/open-downloads-folder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            console.log('Downloads folder opened successfully');
        } else {
            console.error('Failed to open downloads folder:', result.error);
            alert(`Failed to open downloads folder: ${result.error}`);
        }
    } catch (error) {
        console.error('Error opening downloads folder:', error);
        alert('Error opening downloads folder. Please try again.');
    }
}

// Delete file
async function deleteFile(filename) {
    if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/delete-video/${encodeURIComponent(filename)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Remove from local arrays
            allFiles = allFiles.filter(file => file.filename !== filename);
            filteredFiles = filteredFiles.filter(file => file.filename !== filename);
            
            // Refresh display
            displayFiles();
            
            // Close modal if it was showing this file
            if (currentFile && currentFile.filename === filename) {
                closeModal();
            }
        } else {
            const error = await response.text();
            alert(`Error deleting file: ${error}`);
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        alert('Error deleting file');
    }
}

// Show no files message
function showNoFiles(message) {
    const filesGrid = document.getElementById('filesGrid');
    const noFiles = document.getElementById('noFiles');
    
    filesGrid.style.display = 'none';
    noFiles.style.display = 'block';
    
    if (message) {
        noFiles.querySelector('h2').textContent = message;
    }
}

// Close modal when clicking outside
document.getElementById('fileModal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeModal();
    }
});

// Handle keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closeModal();
    }
});