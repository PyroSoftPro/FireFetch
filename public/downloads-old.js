// Downloads page functionality with queue support

let eventSource = null;
let currentState = null;

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Check for pending download from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const downloadUrl = urlParams.get('url');
    const downloadFormat = urlParams.get('format');
    
    if (downloadUrl && downloadFormat) {
        // Add to queue instead of starting immediately
        addDownloadToQueue(downloadUrl, downloadFormat);
    }
    
    // Connect to download stream
    connectToDownloadStream();
    
    // Load initial state
    loadQueueState();
});

// Connect to Server-Sent Events stream
function connectToDownloadStream() {
    if (eventSource) {
        eventSource.close();
    }
    
    eventSource = new EventSource('/api/download-stream');
    
    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'state' || data.type === 'update') {
                currentState = data.data;
                // Use requestAnimationFrame for smooth UI updates
                requestAnimationFrame(() => {
                    updateUI();
                });
            }
        } catch (error) {
            console.error('Error parsing SSE data:', error);
        }
    };
    
    eventSource.onerror = function(error) {
        console.error('SSE connection error:', error);
        // Reconnect after delay
        setTimeout(() => {
            connectToDownloadStream();
        }, 5000);
    };
}

// Add download to queue
async function addDownloadToQueue(url, format, title = null) {
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url, format, title })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(`Download added to queue`, 'success');
        } else {
            showNotification(`Failed to add download: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error adding download to queue:', error);
        showNotification('Failed to add download to queue', 'error');
    }
}

// Load current queue state
async function loadQueueState() {
    try {
        const response = await fetch('/api/queue');
        const state = await response.json();
        currentState = state;
        updateUI();
    } catch (error) {
        console.error('Error loading queue state:', error);
    }
}

// Update the UI based on current state
function updateUI() {
    if (!currentState) return;
    
    // Update all sections - they handle their own change detection
    updateQueueSection();
    updateActiveSection();
    updateCompletedSection();
    updateQueueControls();
    updateStats();
    updateStatusBar();
}

// Update queue section
function updateQueueSection() {
    const queueContainer = document.getElementById('queuedDownloads');
    const noQueueEl = document.getElementById('noQueuedDownloads');
    
    if (!queueContainer) {
        // Create queue section if it doesn't exist
        createQueueSection();
        return updateQueueSection();
    }
    
    const queuedItems = currentState.queue.filter(d => d.status === 'queued');
    
    if (queuedItems.length === 0) {
        queueContainer.style.display = 'none';
        if (noQueueEl) noQueueEl.style.display = 'block';
        return;
    }
    
    queueContainer.style.display = 'block';
    if (noQueueEl) noQueueEl.style.display = 'none';
    
    queueContainer.innerHTML = '';
    
    queuedItems.forEach((download, index) => {
        const item = createDownloadItem(download, 'queue', index);
        queueContainer.appendChild(item);
    });
}

// Update active downloads section
function updateActiveSection() {
    const activeContainer = document.getElementById('activeDownloads');
    const noActiveEl = document.getElementById('noActiveDownloads');
    
    if (currentState.active.length === 0) {
        if (activeContainer) activeContainer.innerHTML = '';
        if (noActiveEl) noActiveEl.style.display = 'block';
        return;
    }
    
    if (noActiveEl) noActiveEl.style.display = 'none';
    if (!activeContainer) return;
    
    // Instead of recreating all items, update existing ones or create new ones
    const existingItems = activeContainer.querySelectorAll('.download-item');
    const existingIds = Array.from(existingItems).map(item => item.getAttribute('data-id'));
    
    currentState.active.forEach((download, index) => {
        const existingItem = activeContainer.querySelector(`[data-id="${download.id}"]`);
        
        if (existingItem) {
            // Update existing item in place for smoother animations
            updateDownloadItemInPlace(existingItem, download, 'active');
        } else {
            // Create new item
            const item = createDownloadItem(download, 'active');
            activeContainer.appendChild(item);
        }
    });
    
    // Remove items that are no longer active
    existingItems.forEach(item => {
        const id = item.getAttribute('data-id');
        if (!currentState.active.find(d => d.id === id)) {
            item.remove();
        }
    });
}

// Update completed downloads section
function updateCompletedSection() {
    const completedContainer = document.getElementById('completedDownloads');
    
    if (!completedContainer) {
        createCompletedSection();
        return updateCompletedSection();
    }
    
    if (currentState.completed.length === 0) {
        completedContainer.innerHTML = '<p class="no-downloads">No completed downloads</p>';
        return;
    }
    
    completedContainer.innerHTML = '';
    
    currentState.completed.forEach(download => {
        const item = createDownloadItem(download, 'completed');
        completedContainer.appendChild(item);
    });
}

// Create queue section if missing
function createQueueSection() {
    const container = document.querySelector('.container');
    const activeSection = container.querySelector('h2');
    
    const queueHTML = `
        <h2>Download Queue</h2>
        <div id="queuedDownloads" class="downloads-section"></div>
        <div id="noQueuedDownloads" class="no-downloads" style="display: none;">
            <p>No downloads in queue</p>
        </div>
    `;
    
    activeSection.insertAdjacentHTML('beforebegin', queueHTML);
}

// Create completed section if missing
function createCompletedSection() {
    const container = document.querySelector('.container');
    
    const completedHTML = `
        <h2>Completed Downloads</h2>
        <div id="completedDownloads" class="downloads-section"></div>
    `;
    
    container.insertAdjacentHTML('beforeend', completedHTML);
}

// Create download item element
function createDownloadItem(download, type, queueIndex = null) {
    const item = document.createElement('div');
    const downloadType = download.downloadType || 'video';
    item.className = `download-item ${type} ${downloadType}`;
    item.setAttribute('data-id', download.id);
    
    let statusClass = 'queued';
    let statusText = 'Queued';
    
    switch (download.status) {
        case 'starting':
            statusClass = 'starting';
            statusText = 'Starting...';
            break;
        case 'downloading':
            statusClass = 'downloading';
            statusText = 'Downloading';
            break;
        case 'processing':
            statusClass = 'processing';
            statusText = 'Processing...';
            break;
        case 'completed':
            statusClass = 'completed';
            statusText = 'Completed';
            break;
        case 'failed':
            statusClass = 'failed';
            statusText = 'Failed';
            break;
        case 'cancelled':
            statusClass = 'cancelled';
            statusText = 'Cancelled';
            break;
        case 'retrying':
            statusClass = 'retrying';
            statusText = `Retrying (${download.retryCount}/${currentState.maxRetries || 2})`;
            break;
    }
    
    const progressPercent = download.progress || 0;
    const addedTime = new Date(download.addedAt).toLocaleString();
    
    // Create torrent-specific details if it's a torrent/magnet
    const torrentDetails = (downloadType === 'torrent' || downloadType === 'magnet') ? `
        <div class="torrent-details">
            ${download.peers !== null && download.peers !== undefined && download.peers > 0 ? `<span class="peers">👥 ${download.peers} peers</span>` : ''}
            ${download.uploadSpeed && download.uploadSpeed !== '0 B/s' && download.uploadSpeed !== 'NaN undefined/s' && download.uploadSpeed !== 'null' ? `<span class="upload-speed">📤 ${download.uploadSpeed}</span>` : ''}
            ${download.ratio !== null && download.ratio !== undefined && !isNaN(download.ratio) && download.ratio > 0 ? `<span class="ratio">⚖️ ${download.ratio.toFixed(2)}</span>` : ''}
        </div>
    ` : '';
    
    item.innerHTML = `
        <div class="download-header">
            <div class="download-info">
                <div class="download-url" title="${download.url}">
                    ${download.title || download.url}
                    <span class="download-type-badge ${downloadType}">${downloadType}</span>
                </div>
                <div class="download-format">
                    ${downloadType === 'video' ? `Format: ${download.format}` : `Type: ${downloadType.charAt(0).toUpperCase() + downloadType.slice(1)}`}
                </div>
                ${queueIndex !== null ? `<div class="queue-position">Position: ${queueIndex + 1}</div>` : ''}
            </div>
            <div class="download-status ${statusClass}">${statusText}</div>
            <div class="download-actions">
                ${createActionButtons(download, type, queueIndex)}
            </div>
        </div>
        ${type !== 'completed' ? `
            <div class="progress-container">
                <div class="progress-bar">
                    <div class="progress-fill ${statusClass}" style="width: ${progressPercent}%"></div>
                </div>
                <div class="progress-text">${getProgressText(download)}</div>
            </div>
        ` : ''}
        <div class="download-details">
            ${download.speed ? `<span class="download-speed">📥 ${download.speed}</span>` : ''}
            ${download.eta ? `<span class="download-eta">⏰ ${download.eta}</span>` : ''}
            ${download.size ? `<span class="download-size">💾 ${download.size}</span>` : ''}
            <span class="download-time">📅 ${addedTime}</span>
            ${download.completedAt ? `<span class="completed-time">✅ ${new Date(download.completedAt).toLocaleString()}</span>` : ''}
        </div>
        ${torrentDetails}
        ${download.error ? `<div class="download-error">Error: ${download.error}</div>` : ''}
    `;
    
    return item;
}

// Update existing download item in place (for smooth progress updates)
function updateDownloadItemInPlace(item, download, type) {
    // Update title if it has changed (for .torrent files that load metadata)
    const titleEl = item.querySelector('.download-url');
    if (titleEl) {
        const currentTitle = titleEl.textContent.replace(/\s*(torrent|magnet)\s*$/i, '').trim();
        const newTitle = download.title || download.url;
        const downloadType = download.downloadType || 'video';
        
        if (currentTitle !== newTitle) {
            titleEl.innerHTML = `
                ${newTitle}
                <span class="download-type-badge ${downloadType}">${downloadType}</span>
            `;
            titleEl.setAttribute('title', download.url);
        }
    }
    
    // Update progress bar
    const progressFill = item.querySelector('.progress-fill');
    const progressText = item.querySelector('.progress-text');
    
    if (progressFill) {
        const progressPercent = download.progress || 0;
        progressFill.style.width = progressPercent + '%';
        
        // Update status class
        const statusClass = getStatusClass(download.status);
        progressFill.className = `progress-fill ${statusClass}`;
    }
    
    if (progressText) {
        progressText.textContent = getProgressText(download);
    }
    
    // Update status
    const statusEl = item.querySelector('.download-status');
    if (statusEl) {
        const statusClass = getStatusClass(download.status);
        const statusText = getStatusText(download);
        statusEl.className = `download-status ${statusClass}`;
        statusEl.textContent = statusText;
    }
    
    // Update download details
    const speedEl = item.querySelector('.download-speed');
    const etaEl = item.querySelector('.download-eta');
    const sizeEl = item.querySelector('.download-size');
    
    if (speedEl) {
        speedEl.textContent = download.speed ? `📥 ${download.speed}` : '';
    }
    if (etaEl) {
        etaEl.textContent = download.eta ? `⏰ ${download.eta}` : '';
    }
    if (sizeEl) {
        sizeEl.textContent = download.size ? `💾 ${download.size}` : '';
    }
    
    // Update torrent details
    const downloadType = download.downloadType || 'video';
    let torrentDetailsEl = item.querySelector('.torrent-details');
    
    if ((downloadType === 'torrent' || downloadType === 'magnet')) {
        if (!torrentDetailsEl) {
            torrentDetailsEl = document.createElement('div');
            torrentDetailsEl.className = 'torrent-details';
            item.appendChild(torrentDetailsEl);
        }
        
        // Update torrent-specific info
        const peersText = (download.peers !== null && download.peers !== undefined && download.peers > 0) ? `<span class="peers">👥 ${download.peers} peers</span>` : '';
        const uploadText = (download.uploadSpeed && download.uploadSpeed !== '0 B/s' && download.uploadSpeed !== 'NaN undefined/s' && download.uploadSpeed !== 'null') ? `<span class="upload-speed">📤 ${download.uploadSpeed}</span>` : '';
        const ratioText = (download.ratio !== null && download.ratio !== undefined && !isNaN(download.ratio) && download.ratio > 0) ? `<span class="ratio">⚖️ ${download.ratio.toFixed(2)}</span>` : '';
        
        torrentDetailsEl.innerHTML = peersText + uploadText + ratioText;
    } else if (torrentDetailsEl) {
        torrentDetailsEl.remove();
    }
    
    // Update error display
    let errorEl = item.querySelector('.download-error');
    if (download.error && !errorEl) {
        errorEl = document.createElement('div');
        errorEl.className = 'download-error';
        item.appendChild(errorEl);
    }
    if (errorEl) {
        if (download.error) {
            errorEl.textContent = `Error: ${download.error}`;
            errorEl.style.display = 'block';
        } else {
            errorEl.style.display = 'none';
        }
    }
}

// Helper functions for status handling
function getStatusClass(status) {
    switch (status) {
        case 'starting': return 'starting';
        case 'downloading': return 'downloading';
        case 'processing': return 'processing';
        case 'completed': return 'completed';
        case 'failed': return 'failed';
        case 'cancelled': return 'cancelled';
        case 'retrying': return 'retrying';
        default: return 'queued';
    }
}

function getStatusText(download) {
    switch (download.status) {
        case 'starting': return 'Starting...';
        case 'downloading': return 'Downloading';
        case 'processing': return 'Processing...';
        case 'completed': return 'Completed';
        case 'failed': return 'Failed';
        case 'cancelled': return 'Cancelled';
        case 'retrying': return `Retrying (${download.retryCount}/${currentState.maxRetries || 2})`;
        default: return 'Queued';
    }
}

// Create action buttons for download items
function createActionButtons(download, type, queueIndex) {
    let buttons = '';
    
    if (type === 'queue') {
        buttons += `<button class="action-btn cancel-btn" onclick="cancelDownload('${download.id}')">Cancel</button>`;
        
        if (queueIndex > 0) {
            buttons += `<button class="action-btn move-btn" onclick="moveUp(${queueIndex})">↑</button>`;
        }
        if (queueIndex < currentState.queue.filter(d => d.status === 'queued').length - 1) {
            buttons += `<button class="action-btn move-btn" onclick="moveDown(${queueIndex})">↓</button>`;
        }
    } else if (type === 'active') {
        buttons += `<button class="action-btn cancel-btn" onclick="cancelDownload('${download.id}')">Cancel</button>`;
    }
    
    return buttons;
}

// Get progress text for download
function getProgressText(download) {
    const downloadType = download.downloadType || 'video';
    
    if (download.status === 'queued') {
        if (download.hasPartialFile) {
            return 'Ready to resume download...';
        }
        return 'Waiting in queue...';
    } else if (download.status === 'starting') {
        if (download.hasPartialFile) {
            return 'Resuming download...';
        }
        if (downloadType === 'magnet') {
            return 'Connecting to DHT and finding peers...';
        } else if (downloadType === 'torrent') {
            if (download.title && download.title !== 'Torrent Download') {
                return 'Torrent loaded, connecting to peers...';
            } else {
                return 'Downloading .torrent file and loading metadata...';
            }
        }
        return 'Initializing download...';
    } else if (download.status === 'downloading') {
        const progress = download.progress || 0;
        if (downloadType === 'magnet' || downloadType === 'torrent') {
            if (progress === 0) {
                // Check if we have metadata but no connections
                if (download.peers === 0 && download.title && download.title !== 'Magnet Download' && download.title !== 'Torrent Download') {
                    return 'Metadata downloaded, connecting to peers...';
                }
                return 'Finding peers and downloading metadata...';
            } else if (progress < 1) {
                return 'Downloading metadata and connecting to peers...';
            } else {
                return `${progress}% complete`;
            }
        }
        return `${progress}% complete`;
    } else if (download.status === 'processing') {
        return 'Processing and merging files...';
    } else if (download.status === 'retrying') {
        return `Retrying in ${Math.ceil((download.retryDelay || 5000) / 1000)}s...`;
    } else if (download.status === 'failed') {
        return 'Download failed';
    } else if (download.status === 'cancelled') {
        return 'Download cancelled';
    }
    return '';
}

// Update queue controls
function updateQueueControls() {
    let controlsContainer = document.getElementById('queueControls');
    
    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'queueControls';
        controlsContainer.className = 'queue-controls';
        
        const firstH2 = document.querySelector('h2');
        firstH2.parentNode.insertBefore(controlsContainer, firstH2);
    }
    
    const isEnabled = currentState.queueEnabled;
    const hasItems = currentState.stats.queued > 0 || currentState.stats.active > 0;
    
    controlsContainer.innerHTML = `
        <div class="control-group">
            <button class="control-btn ${isEnabled ? 'active' : ''}" onclick="toggleQueue()">
                ${isEnabled ? '⏸️ Pause Queue' : '▶️ Resume Queue'}
            </button>
            <button class="control-btn" onclick="clearCompleted()" ${currentState.completed.length === 0 ? 'disabled' : ''} style="display: none;">
                🗑️ Clear Completed
            </button>
            <button class="control-btn" onclick="retryFailed()" ${currentState.stats.failed === 0 ? 'disabled' : ''} style="display: none;">
                🔄 Retry Failed
            </button>
        </div>
        <div class="queue-info">
            <span>Queue: ${currentState.stats.queued}</span>
            <span>Active: ${currentState.stats.active}/${currentState.maxConcurrent}</span>
            <span>Completed: ${currentState.stats.completed}</span>
            <span>Failed: ${currentState.stats.failed}</span>
        </div>
    `;
}

// Update stats display
function updateStats() {
    // Stats are updated in queue controls
}

// Cancel a download
async function cancelDownload(id) {
    try {
        const response = await fetch(`/api/download/${id}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification('Download cancelled', 'success');
        } else {
            showNotification('Failed to cancel download', 'error');
        }
    } catch (error) {
        console.error('Error cancelling download:', error);
        showNotification('Failed to cancel download', 'error');
    }
}

// Toggle queue enabled/disabled
async function toggleQueue() {
    try {
        const endpoint = currentState.queueEnabled ? '/api/queue/pause' : '/api/queue/resume';
        const response = await fetch(endpoint, { method: 'POST' });
        
        const result = await response.json();
        
        if (result.success) {
            showNotification(result.message, 'success');
        } else {
            showNotification('Failed to toggle queue', 'error');
        }
    } catch (error) {
        console.error('Error toggling queue:', error);
        showNotification('Failed to toggle queue', 'error');
    }
}

// Move download up in queue
async function moveUp(index) {
    await reorderQueue(index, index - 1);
}

// Move download down in queue
async function moveDown(index) {
    await reorderQueue(index, index + 1);
}

// Reorder queue
async function reorderQueue(fromIndex, toIndex) {
    try {
        const response = await fetch('/api/queue/reorder', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fromIndex, toIndex })
        });
        
        const result = await response.json();
        
        if (!result.success) {
            showNotification('Failed to reorder queue', 'error');
        }
    } catch (error) {
        console.error('Error reordering queue:', error);
        showNotification('Failed to reorder queue', 'error');
    }
}

// Clear completed downloads
function clearCompleted() {
    // This would need a new API endpoint
    showNotification('Clear completed not yet implemented', 'info');
}

// Retry failed downloads
function retryFailed() {
    // This would need a new API endpoint
    showNotification('Retry failed not yet implemented', 'info');
}

// Show notification
function showNotification(message, type = 'success') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Show with animation
    setTimeout(() => notification.classList.add('show'), 100);
    
    // Remove after delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Update status bar
function updateStatusBar() {
    let statusBar = document.getElementById('statusBar');
    
    if (!statusBar) {
        statusBar = document.createElement('div');
        statusBar.id = 'statusBar';
        statusBar.className = 'status-bar';
        document.body.appendChild(statusBar);
    }
    
    if (!currentState) return;
    
    const totalDownloads = currentState.stats.active + currentState.stats.queued;
    const downloadSpeed = currentState.totalSpeeds?.download || '0 B/s';
    const uploadSpeed = currentState.totalSpeeds?.upload || '0 B/s';
    
    statusBar.innerHTML = `
        <div class="status-left">
            <span>Active: ${currentState.stats.active}/${currentState.maxConcurrent}</span>
            <span class="status-separator">|</span>
            <span>Queued: ${currentState.stats.queued}</span>
            <span class="status-separator">|</span>
            <span>Completed: ${currentState.stats.completed}</span>
        </div>
        <div class="status-right">
            <div class="speed-indicator">
                <span class="download-speed">⬇ ${downloadSpeed}</span>
            </div>
            <div class="speed-indicator">
                <span class="upload-speed">⬆ ${uploadSpeed}</span>
            </div>
        </div>
    `;
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (eventSource) {
        eventSource.close();
    }
});