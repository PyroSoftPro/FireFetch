// Default settings
const defaultSettings = {
    downloadDir: 'downloads',
    defaultQuality: 'best',
    outputFormat: 'mp4',
    saveMetadata: true,
    connections: 16,
    segments: 16,
    segmentSize: '1M',
    autoPlay: true,
    showProgress: true,
    cookieFile: null,
    // Queue settings
    maxConcurrentDownloads: 3,
    queueEnabled: true,
    autoStart: true,
    retryAttempts: 2,
    retryDelay: 5,
    // Torrent settings
    torrentEngine: 'aria2c'
};

function showDRMError(message = 'This content is protected by DRM (digital-rights management) software. We can\'t legally bypass this.') {
    const existingError = document.getElementById('drmErrorMessage');
    if (existingError) {
        existingError.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.id = 'drmErrorMessage';
    errorDiv.className = 'error-message';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        max-width: 400px;
        z-index: 1000;
    `;
    
    errorDiv.innerHTML = `
        <div class="error-content">
            <strong>Error: ${message}</strong>
            <div style="margin-top: 15px; text-align: center;">
                <img src="bitches.gif" alt="DRM Error GIF" style="max-width: 200px; border-radius: 8px;">
            </div>
            <button onclick="document.getElementById('drmErrorMessage').remove()" 
                    style="margin-top: 15px; background: #ff4444; color: white; border: none; 
                           padding: 8px 16px; border-radius: 4px; cursor: pointer;
                           font-size: 14px;">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto-hide after 15 seconds
    setTimeout(() => {
        if (document.getElementById('drmErrorMessage')) {
            document.getElementById('drmErrorMessage').remove();
        }
    }, 15000);
}

function showFetchError(message) {
    const existingError = document.getElementById('fetchErrorMessage');
    if (existingError) {
        existingError.remove();
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.id = 'fetchErrorMessage';
    errorDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #1a1a1a;
        border: 2px solid #ff6a00;
        border-radius: 8px;
        padding: 20px;
        max-width: 400px;
        z-index: 1000;
        color: #e0e0e0;
        font-family: Arial, sans-serif;
    `;
    
    errorDiv.innerHTML = `
        <div>
            <strong style="color: #ff6a00; font-size: 16px;">${message}</strong>
            <div style="margin-top: 10px; font-style: italic; color: #ff6a00;">
                "Gretchen, stop trying to make fetch happen, it's not going to happen!"
            </div>
            <div style="margin-top: 15px; text-align: center;">
                <img src="fetch.gif" alt="Fetch GIF" style="max-width: 200px; border-radius: 8px;">
            </div>
            <button onclick="document.getElementById('fetchErrorMessage').remove()" 
                    style="margin-top: 15px; background: #ff6a00; color: white; border: none; 
                           padding: 8px 16px; border-radius: 4px; cursor: pointer;
                           font-size: 14px;">
                Close
            </button>
        </div>
    `;
    
    document.body.appendChild(errorDiv);
    
    // Auto-hide after 10 seconds
    setTimeout(() => {
        if (document.getElementById('fetchErrorMessage')) {
            document.getElementById('fetchErrorMessage').remove();
        }
    }, 10000);
}

// Load settings from localStorage
function loadSettings() {
    const savedSettings = localStorage.getItem('firefetch-settings');
    const settings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;
    
    // Apply settings to form
    document.getElementById('downloadDir').value = settings.downloadDir;
    document.getElementById('defaultQuality').value = settings.defaultQuality;
    document.getElementById('outputFormat').value = settings.outputFormat;
    document.getElementById('connections').value = settings.connections;
    document.getElementById('segments').value = settings.segments;
    document.getElementById('segmentSize').value = settings.segmentSize;
    
    // Torrent settings
    document.getElementById('torrentEngine').value = settings.torrentEngine || 'webtorrent';
    
    // Queue settings
    document.getElementById('maxConcurrentDownloads').value = settings.maxConcurrentDownloads || 3;
    document.getElementById('retryAttempts').value = settings.retryAttempts || 2;
    document.getElementById('retryDelay').value = (settings.retryDelay || 5000) / 1000; // Convert to seconds
    
    // Set toggle switches
    setToggleSwitch('saveMetadata', settings.saveMetadata);
    setToggleSwitch('autoPlay', settings.autoPlay);
    setToggleSwitch('showProgress', settings.showProgress);
    setToggleSwitch('queueEnabled', settings.queueEnabled !== false);
    setToggleSwitch('autoStart', settings.autoStart !== false);
}

// Save settings to localStorage and server
async function saveSettings() {
    const settings = {
        downloadDir: document.getElementById('downloadDir').value,
        defaultQuality: document.getElementById('defaultQuality').value,
        outputFormat: document.getElementById('outputFormat').value,
        saveMetadata: getToggleSwitch('saveMetadata'),
        connections: parseInt(document.getElementById('connections').value),
        segments: parseInt(document.getElementById('segments').value),
        segmentSize: document.getElementById('segmentSize').value,
        autoPlay: getToggleSwitch('autoPlay'),
        showProgress: getToggleSwitch('showProgress'),
        // Torrent settings
        torrentEngine: document.getElementById('torrentEngine').value,
        // Queue settings
        maxConcurrentDownloads: parseInt(document.getElementById('maxConcurrentDownloads').value),
        queueEnabled: getToggleSwitch('queueEnabled'),
        autoStart: getToggleSwitch('autoStart'),
        retryAttempts: parseInt(document.getElementById('retryAttempts').value),
        retryDelay: parseInt(document.getElementById('retryDelay').value) * 1000 // Convert to milliseconds
    };
    
    // Save to localStorage
    localStorage.setItem('firefetch-settings', JSON.stringify(settings));
    
    // Save to server
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings)
        });
        
        if (response.ok) {
            showSuccessMessage();
        } else {
            showFetchError('Failed to save settings to server');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        // Still show success if localStorage save worked
        showSuccessMessage();
    }
}

// Toggle switch functionality
function setToggleSwitch(id, value) {
    const toggle = document.getElementById(id);
    if (value) {
        toggle.classList.add('active');
    } else {
        toggle.classList.remove('active');
    }
}

function getToggleSwitch(id) {
    const toggle = document.getElementById(id);
    return toggle.classList.contains('active');
}

// Add click handlers to toggle switches
document.querySelectorAll('.toggle-switch').forEach(toggle => {
    toggle.addEventListener('click', function() {
        this.classList.toggle('active');
    });
});

// Show success message
function showSuccessMessage() {
    const message = document.getElementById('successMessage');
    message.style.display = 'block';
    setTimeout(() => {
        message.style.display = 'none';
    }, 3000);
}

// Directory selection
async function selectDirectory() {
    try {
        const response = await fetch('/api/select-directory', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const result = await response.json();
        if (result.path) {
            document.getElementById('downloadDir').value = result.path;
        }
    } catch (error) {
        console.error('Error selecting directory:', error);
        showFetchError('Failed to open directory selector. Please enter path manually.');
        document.getElementById('downloadDir').readOnly = false;
    }
}

// Cookie file handling
async function handleCookieFile(input) {
    const file = input.files[0];
    if (!file) return;
    
    // Check if it's a text file
    if (!file.name.endsWith('.txt')) {
        showFetchError('Please select a .txt file (Netscape cookies format)');
        input.value = '';
        return;
    }
    
    const formData = new FormData();
    formData.append('cookieFile', file);
    
    try {
        const response = await fetch('/api/upload-cookies', {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            document.getElementById('cookieFileName').value = file.name;
            document.getElementById('clearCookies').style.display = 'inline-block';
            showSuccessMessage();
        } else {
            const error = await response.json();
            showFetchError('Failed to upload cookie file: ' + (error.error || 'Unknown error'));
            input.value = '';
        }
    } catch (error) {
        console.error('Error uploading cookie file:', error);
        showFetchError('Failed to upload cookie file');
        input.value = '';
    }
}

async function clearCookieFile() {
    try {
        const response = await fetch('/api/clear-cookies', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            document.getElementById('cookieFileName').value = '';
            document.getElementById('cookieFileName').placeholder = 'No cookie file uploaded';
            document.getElementById('clearCookies').style.display = 'none';
            document.getElementById('cookieFile').value = '';
            showSuccessMessage();
        } else {
            showFetchError('Failed to clear cookie file');
        }
    } catch (error) {
        console.error('Error clearing cookie file:', error);
        showFetchError('Failed to clear cookie file');
    }
}

// Update loadSettings to handle cookie status
function loadSettings() {
    const savedSettings = localStorage.getItem('firefetch-settings');
    const settings = savedSettings ? JSON.parse(savedSettings) : defaultSettings;
    
    // Apply settings to form
    document.getElementById('downloadDir').value = settings.downloadDir;
    document.getElementById('defaultQuality').value = settings.defaultQuality;
    document.getElementById('outputFormat').value = settings.outputFormat;
    document.getElementById('connections').value = settings.connections;
    document.getElementById('segments').value = settings.segments;
    document.getElementById('segmentSize').value = settings.segmentSize;
    
    // Set toggle switches
    setToggleSwitch('saveMetadata', settings.saveMetadata);
    setToggleSwitch('autoPlay', settings.autoPlay);
    setToggleSwitch('showProgress', settings.showProgress);
    
    // Check cookie file status
    checkCookieFileStatus();
}

async function checkCookieFileStatus() {
    try {
        const response = await fetch('/api/cookie-status');
        if (response.ok) {
            const status = await response.json();
            if (status.hasCookies) {
                document.getElementById('cookieFileName').value = status.fileName || 'Cookie file uploaded';
                document.getElementById('clearCookies').style.display = 'inline-block';
            }
        }
    } catch (error) {
        console.error('Error checking cookie status:', error);
    }
}

// Reset settings to defaults
async function resetSettings() {
    const confirmReset = confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.');
    
    if (!confirmReset) return;
    
    // Clear local storage
    localStorage.removeItem('firefetch-settings');
    
    // Reset server settings
    try {
        const response = await fetch('/api/reset-settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (response.ok) {
            // Clear any uploaded cookies
            await clearCookieFile();
            
            // Reload the page to show default settings
            window.location.reload();
        } else {
            showFetchError('Failed to reset settings on server');
        }
    } catch (error) {
        console.error('Error resetting settings:', error);
        showFetchError('Failed to reset settings');
    }
}

// Dependency Manager Functions
let dependencyData = {};

async function checkDependencies() {
    const statusDiv = document.getElementById('dependencyStatus');
    const progressDiv = document.getElementById('dependencyProgress');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    
    // Show progress
    progressDiv.style.display = 'block';
    statusDiv.style.display = 'none';
    progressText.textContent = 'Checking current versions...';
    progressBar.style.width = '30%';
    
    try {
        // Get current status
        const statusResponse = await fetch('/api/dependencies/status');
        if (!statusResponse.ok) throw new Error('Failed to get dependency status');
        dependencyData = await statusResponse.json();
        
        progressText.textContent = 'Checking latest versions...';
        progressBar.style.width = '60%';
        
        // Get latest versions
        const latestResponse = await fetch('/api/dependencies/latest');
        if (!latestResponse.ok) throw new Error('Failed to get latest versions');
        const latestVersions = await latestResponse.json();
        
        // Merge latest versions into dependency data
        for (const [name, version] of Object.entries(latestVersions)) {
            if (dependencyData[name]) {
                dependencyData[name].latestVersion = version;
            }
        }
        
        progressText.textContent = 'Done!';
        progressBar.style.width = '100%';
        
        // Display results
        setTimeout(() => {
            progressDiv.style.display = 'none';
            displayDependencyStatus();
        }, 500);
        
    } catch (error) {
        console.error('Error checking dependencies:', error);
        progressDiv.style.display = 'none';
        showFetchError('Failed to check dependencies: ' + error.message);
    }
}

function displayDependencyStatus() {
    const statusDiv = document.getElementById('dependencyStatus');
    const tbody = document.getElementById('dependencyTableBody');
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    // Add rows for each dependency
    for (const [name, info] of Object.entries(dependencyData)) {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #2a2a2a';
        
        // Determine status
        let status = 'Up to date';
        let statusColor = '#4CAF50';
        let showUpdateButton = false;
        
        if (!info.installed) {
            status = 'Not installed';
            statusColor = '#ff4444';
            showUpdateButton = true;
        } else if (info.currentVersion === 'Unknown') {
            status = 'Unknown version';
            statusColor = '#ff9800';
        } else if (info.latestVersion === 'Error') {
            status = 'Check failed';
            statusColor = '#ff9800';
        } else if (info.currentVersion !== info.latestVersion) {
            status = 'Update available';
            statusColor = '#2196F3';
            showUpdateButton = true;
        }
        
        row.innerHTML = `
            <td style="padding: 12px; color: #e5e5e5; font-weight: 500;">${name}</td>
            <td style="padding: 12px; color: #999;">${info.currentVersion}</td>
            <td style="padding: 12px; color: #999;">${info.latestVersion}</td>
            <td style="padding: 12px; color: ${statusColor}; font-weight: 500;">${status}</td>
            <td style="padding: 12px; text-align: center;">
                ${showUpdateButton ? 
                    `<button class="browse-button" style="padding: 6px 16px; font-size: 14px;" 
                            onclick="updateDependency('${name}')" id="update-${name}">
                        Update
                    </button>` : 
                    '<span style="color: #666;">—</span>'}
            </td>
        `;
        
        tbody.appendChild(row);
    }
    
    statusDiv.style.display = 'block';
}

async function updateDependency(name) {
    const button = document.getElementById(`update-${name}`);
    const originalText = button.textContent;
    
    button.disabled = true;
    button.textContent = 'Updating...';
    
    try {
        const response = await fetch('/api/dependencies/update', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dependency: name })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Update failed');
        }
        
        const result = await response.json();
        showSuccessMessage();
        
        // Refresh the dependency list
        await checkDependencies();
        
    } catch (error) {
        console.error(`Error updating ${name}:`, error);
        showFetchError(`Failed to update ${name}: ${error.message}`);
        button.disabled = false;
        button.textContent = originalText;
    }
}

async function updateAllDependencies() {
    const dependencies = ['aria2c', 'ffmpeg', 'yt-dlp'];
    const progressDiv = document.getElementById('dependencyProgress');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');
    
    progressDiv.style.display = 'block';
    
    for (let i = 0; i < dependencies.length; i++) {
        const dep = dependencies[i];
        const info = dependencyData[dep];
        
        // Skip if already up to date
        if (info && info.installed && info.currentVersion === info.latestVersion) {
            continue;
        }
        
        progressText.textContent = `Updating ${dep}...`;
        progressBar.style.width = `${((i + 0.5) / dependencies.length) * 100}%`;
        
        try {
            const response = await fetch('/api/dependencies/update', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ dependency: dep })
            });
            
            if (!response.ok) {
                const error = await response.json();
                console.error(`Failed to update ${dep}:`, error);
            }
        } catch (error) {
            console.error(`Error updating ${dep}:`, error);
        }
        
        progressBar.style.width = `${((i + 1) / dependencies.length) * 100}%`;
    }
    
    progressText.textContent = 'Updates complete!';
    
    setTimeout(() => {
        progressDiv.style.display = 'none';
        checkDependencies();
    }, 1000);
}

async function deleteBackups() {
    const confirmDelete = confirm('Delete all backup files (.bk) in the dependencies folder?');
    if (!confirmDelete) return;
    
    try {
        const response = await fetch('/api/dependencies/delete-backups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) throw new Error('Failed to delete backups');
        
        const result = await response.json();
        
        if (result.deletedCount > 0) {
            showSuccessMessage();
            alert(`Deleted ${result.deletedCount} backup file(s)`);
        } else {
            alert('No backup files found');
        }
        
    } catch (error) {
        console.error('Error deleting backups:', error);
        showFetchError('Failed to delete backup files');
    }
}

function refreshDependencies() {
    checkDependencies();
}

// Load settings when page loads
window.addEventListener('DOMContentLoaded', loadSettings);