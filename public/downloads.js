// Downloads page functionality with unified list
let FF_DEBUG = false;
try {
    FF_DEBUG = localStorage.getItem('firefetch-debug') === '1';
} catch {}
const ffLog = (...args) => { if (FF_DEBUG) console.log(...args); };
const ffWarn = (...args) => { if (FF_DEBUG) console.warn(...args); };
const ffErr = (...args) => { if (FF_DEBUG) console.error(...args); };

ffLog('[DOWNLOADS] Script loading...');

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
let eventSource = null;
let currentState = null;
let allDownloads = [];
let filteredDownloads = [];
let reconnectTimer = null;
let reconnectAttempt = 0;
let updateQueued = false;
ffLog('[DOWNLOADS] Variables initialized');

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    // Check for pending download from URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const downloadUrl = urlParams.get('url');
    const downloadFormat = urlParams.get('format');
    
    ffLog('[DOWNLOADS] Page loaded with URL params:', { downloadUrl, downloadFormat });
    
    if (downloadUrl && downloadFormat) {
        ffLog('[DOWNLOADS] Processing download from URL params');
        processDownloadWithResolution(downloadUrl, downloadFormat);
    }
    
    // Setup filter event listeners
    document.getElementById('statusFilter').addEventListener('change', filterDownloads);
    document.getElementById('sortBy').addEventListener('change', sortDownloads);

    // Fluent pill filters (drive the hidden <select> so existing logic keeps working)
    const pillBar = document.getElementById('queueStatusPills');
    if (pillBar) {
        pillBar.addEventListener('click', (e) => {
            const btn = e.target?.closest?.('button[data-status]');
            if (!btn) return;
            const status = btn.getAttribute('data-status') ?? '';
            const sel = document.getElementById('statusFilter');
            if (sel) {
                sel.value = status;
                filterDownloads();
            }
            pillBar.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
        });
    }
    
    // Try to learn debug flag from backend (doesn't exist in static file context)
    // This keeps console spam OFF by default but allows you to enable by setting localStorage firefetch-debug=1.
    fetch('/api/debug', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (data && typeof data.debug === 'boolean') {
                FF_DEBUG = FF_DEBUG || data.debug; // localStorage can override to enable; backend can enable too
            }
        })
        .catch(() => {});

    // Connect to download stream
    ffLog('[DOWNLOADS] Connecting to download stream');
    connectToDownloadStream();
    
    // Load initial state
    ffLog('[DOWNLOADS] Loading initial queue state');
    loadQueueState();
});

// Connect to Server-Sent Events stream
function connectToDownloadStream() {
    if (eventSource) {
        eventSource.close();
    }
    
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    ffLog('[DOWNLOADS] Creating SSE connection to /api/download-stream');
    eventSource = new EventSource('/api/download-stream');
    
    eventSource.onopen = function(event) {
        reconnectAttempt = 0;
        ffLog('[DOWNLOADS] SSE connection opened');
    };
    
    eventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            ffLog('[DOWNLOADS] Received SSE message:', data);
            
            if (data.type === 'state' || data.type === 'update') {
                currentState = data.data;
                // Coalesce bursts of SSE updates into a single render per frame.
                if (!updateQueued) {
                    updateQueued = true;
                    requestAnimationFrame(() => {
                        updateQueued = false;
                        updateAllDownloads();
                    });
                }
            }
        } catch (error) {
            ffErr('Error parsing SSE data:', error);
        }
    };
    
    eventSource.onerror = function(error) {
        ffErr('SSE connection error:', error);

        // Exponential backoff, single timer
        if (reconnectTimer) return;
        reconnectAttempt++;
        const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, reconnectAttempt)));
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            ffLog('[DOWNLOADS] Reconnecting SSE...');
            connectToDownloadStream();
        }, delay);
    };
}

// Process download with URL resolution
async function processDownloadWithResolution(url, format, title = null) {
    ffLog('[DOWNLOADS] Starting URL resolution for:', url);
    
    // Show resolution progress
    showResolutionProgress('Resolving URL...');
    
    try {
        // Call URL resolution API
        const response = await fetch('/api/resolve-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const resolution = await response.json();
        ffLog('[DOWNLOADS] URL resolution result:', resolution);
        
        if (!resolution.success) {
            throw new Error(resolution.error || 'URL resolution failed');
        }
        
        // Update progress with resolved method
        const methodName = resolution.method === 'yt-dlp' ? 'yt-dlp' : 'aria2c';
        showResolutionProgress(`URL Resolved. Using ${methodName} to download.`);
        
        // Wait a moment to show the resolution result
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Hide resolution progress
        hideResolutionProgress();
        
        // Use the resolved URL and proceed with download
        const finalUrl = resolution.resolvedUrl || url;
        const finalTitle = title || resolution.title || 'Download';
        
        ffLog('[DOWNLOADS] Proceeding with download:', {
            originalUrl: url,
            resolvedUrl: finalUrl,
            method: resolution.method,
            type: resolution.type,
            reason: resolution.reason
        });
        
        // Add download to queue with resolved information
        addDownloadToQueue(finalUrl, format, finalTitle, resolution.method, resolution.type);
        
    } catch (error) {
        ffErr('[DOWNLOADS] URL resolution failed:', error);
        hideResolutionProgress();
        
        // Show error but still attempt download with original URL as fallback
        showNotification(`URL resolution failed: ${error.message}. Attempting download with original URL...`, 'warning');
        
        // Fallback to original download method
        setTimeout(() => {
            addDownloadToQueue(url, format, title);
        }, 2000);
    }
}

// Show URL resolution progress
function showResolutionProgress(message) {
    // Remove any existing resolution progress
    hideResolutionProgress();
    
    const progressDiv = document.createElement('div');
    progressDiv.id = 'resolutionProgress';
    progressDiv.className = 'resolution-progress';
    progressDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #1a1a1a;
        border: 2px solid #ff6a00;
        border-radius: 8px;
        padding: 20px 30px;
        z-index: 1000;
        color: #e0e0e0;
        font-family: Arial, sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        min-width: 300px;
        text-align: center;
    `;
    
    progressDiv.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: center; gap: 15px;">
            <div class="spinner" style="
                width: 20px;
                height: 20px;
                border: 3px solid #333;
                border-top: 3px solid #ff6a00;
                border-radius: 50%;
                animation: spin 1s linear infinite;
            "></div>
            <span style="color: #ff6a00; font-weight: 600;">${message}</span>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    
    document.body.appendChild(progressDiv);
}

// Hide URL resolution progress
function hideResolutionProgress() {
    const existing = document.getElementById('resolutionProgress');
    if (existing) {
        existing.remove();
    }
}

// Add download to queue
async function addDownloadToQueue(url, format, title = null, resolvedMethod = null, resolvedType = null) {
    ffLog('[DOWNLOADS] Adding download to queue:', { url, format, title });
    try {
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url, format, title, resolvedMethod, resolvedType })
        });
        
        ffLog('[DOWNLOADS] Response status:', response.status);
        
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
        
        ffLog('[DOWNLOADS] Response result:', result);
        
        if (result.success) {
            ffLog('[DOWNLOADS] Download successfully added to queue');
            showNotification('Download added to queue', 'success');
        } else {
            ffErr('[DOWNLOADS] Failed to add download:', result.error);
            const errorMsg = result.error || '';
            // Check if this is a DRM-related error
            if (errorMsg.toLowerCase().includes('drm') || 
                errorMsg.toLowerCase().includes('protected')) {
                showDRMError();
            } else {
                showNotification(`Failed to add download: ${errorMsg}`, 'error');
            }
        }
    } catch (error) {
        ffErr('Error adding download to queue:', error);
        
        // Provide more specific error messages
        let errorMessage = 'Failed to add download to queue';
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = "Unable to connect to the server. Please check if the application is running.";
        } else if (error.message.includes('HTTP 500')) {
            errorMessage = "Server error occurred while adding the download. Check the server logs.";
        } else if (error.message.includes('HTTP 400')) {
            errorMessage = "Invalid request. Please check the URL.";
        } else if (error.message.includes('Invalid JSON')) {
            errorMessage = "Server returned invalid response. Check server logs.";
        } else if (error.message) {
            errorMessage = `Error: ${error.message}`;
        }
        
        // Check if this is a DRM-related error
        if (errorMessage.toLowerCase().includes('drm') || 
            errorMessage.toLowerCase().includes('protected')) {
            showDRMError();
        } else {
            showNotification(errorMessage, 'error');
        }
    }
}

// Load current queue state
async function loadQueueState() {
    ffLog('[DOWNLOADS] Loading queue state...');
    try {
        const response = await fetch('/api/queue');
        ffLog('[DOWNLOADS] Queue response status:', response.status);
        const state = await response.json();
        ffLog('[DOWNLOADS] Queue state received:', state);
        currentState = state;
        updateAllDownloads();
    } catch (error) {
        ffErr('Error loading queue state:', error);
    }
}

// Update all downloads (unified from queue, active, and completed)
function updateAllDownloads() {
    ffLog('[DOWNLOADS] updateAllDownloads called');
    if (!currentState) return;
    
    // Combine all downloads from different states
    allDownloads = [
        ...currentState.queue,
        ...currentState.active,
        ...currentState.completed
    ];
    
    ffLog('[DOWNLOADS] Combined downloads:', allDownloads.length, 'total');
    
    // Remove duplicates (in case a download exists in multiple arrays)
    const uniqueDownloads = [];
    const seenIds = new Set();
    
    for (const download of allDownloads) {
        if (!seenIds.has(download.id)) {
            seenIds.add(download.id);
            uniqueDownloads.push(download);
        }
    }
    
    allDownloads = uniqueDownloads;
    ffLog('[DOWNLOADS] After deduplication:', allDownloads.length, 'downloads');
    
    // Apply current filters
    filterDownloads();
    
    // Update queue controls
    updateQueueControls();
}

// Filter downloads based on status
function filterDownloads() {
    const statusFilter = document.getElementById('statusFilter').value;
    ffLog('[DOWNLOADS] filterDownloads called, statusFilter:', statusFilter, 'allDownloads:', allDownloads.length);
    
    if (statusFilter === '') {
        filteredDownloads = [...allDownloads];
    } else {
        // Map status filter values to actual download statuses
        const statusMap = {
            'downloading': ['downloading', 'starting', 'processing'],
            'queued': ['queued', 'retrying'],
            'completed': ['completed'],
            'failed': ['failed'],
            'cancelled': ['cancelled']
        };
        
        const targetStatuses = statusMap[statusFilter] || [statusFilter];
        filteredDownloads = allDownloads.filter(download => 
            targetStatuses.includes(download.status)
        );
    }
    
    ffLog('[DOWNLOADS] After filtering:', filteredDownloads.length, 'downloads');
    sortDownloads();
}

// Sort downloads
function sortDownloads() {
    const sortBy = document.getElementById('sortBy').value;
    
    filteredDownloads.sort((a, b) => {
        switch (sortBy) {
            case 'status':
                const statusOrder = ['downloading', 'starting', 'processing', 'queued', 'retrying', 'completed', 'failed', 'cancelled'];
                const statusA = statusOrder.indexOf(a.status);
                const statusB = statusOrder.indexOf(b.status);
                if (statusA !== statusB) return statusA - statusB;
                // If same status, sort by date (newest first)
                return new Date(b.addedAt) - new Date(a.addedAt);
                
            case 'title':
                return (a.title || a.url).localeCompare(b.title || b.url);
                
            case 'type':
                const typeA = a.downloadType || 'video';
                const typeB = b.downloadType || 'video';
                if (typeA !== typeB) return typeA.localeCompare(typeB);
                // If same type, sort by date
                return new Date(b.addedAt) - new Date(a.addedAt);
                
            case 'date':
            default:
                return new Date(b.addedAt) - new Date(a.addedAt);
        }
    });
    
    displayDownloads();
}

// Display downloads in the unified list
function displayDownloads() {
    ffLog('[DOWNLOADS] displayDownloads called, filteredDownloads:', filteredDownloads.length);
    const downloadsContainer = document.getElementById('allDownloads');
    const noDownloads = document.getElementById('noDownloads');
    
    if (filteredDownloads.length === 0) {
        ffLog('[DOWNLOADS] No filtered downloads, showing no downloads message');
        downloadsContainer.style.display = 'none';
        noDownloads.style.display = 'block';
        return;
    }
    
    ffLog('[DOWNLOADS] Showing downloads container, hiding no downloads message');
    downloadsContainer.style.display = 'block';
    noDownloads.style.display = 'none';

    // Kanban lane containers
    const laneQueued = document.getElementById('kanbanQueued');
    const laneActive = document.getElementById('kanbanActive');
    const laneCompleted = document.getElementById('kanbanCompleted');
    const laneIssues = document.getElementById('kanbanIssues');

    if (!laneQueued || !laneActive || !laneCompleted || !laneIssues) {
        ffWarn('[DOWNLOADS] Kanban lanes missing; falling back to linear render');
        downloadsContainer.innerHTML = '';
        filteredDownloads.forEach(d => downloadsContainer.appendChild(createDownloadItem(d)));
        return;
    }

    const laneForStatus = (status) => {
        switch (status) {
            case 'starting':
            case 'downloading':
            case 'processing':
                return laneActive;
            case 'completed':
                return laneCompleted;
            case 'failed':
            case 'cancelled':
                return laneIssues;
            case 'retrying':
            case 'queued':
            default:
                return laneQueued;
        }
    };

    // Snapshot existing items across all lanes for in-place progress updates
    const existingItems = downloadsContainer.querySelectorAll('.download-item');
    const itemById = new Map();
    existingItems.forEach((el) => {
        const id = el.getAttribute('data-id') || el.dataset?.id;
        if (id) itemById.set(id, el);
    });

    // Update/create/move items
    filteredDownloads.forEach((download, index) => {
        ffLog(`[DOWNLOADS] Processing download ${index}: ${download.id} - ${download.status}`);
        const targetLane = laneForStatus(download.status);
        const existingItem = itemById.get(download.id) || null;

        if (existingItem && (download.status === 'downloading' || download.status === 'starting' || download.status === 'processing')) {
            updateDownloadItemInPlace(existingItem, download);
            if (existingItem.parentElement !== targetLane) {
                targetLane.appendChild(existingItem);
            }
        } else {
            const newItem = createDownloadItem(download);
            if (existingItem) {
                existingItem.replaceWith(newItem);
                targetLane.appendChild(newItem);
            } else {
                targetLane.appendChild(newItem);
            }
        }
    });

    // Remove items that are no longer in filtered list
    existingItems.forEach(item => {
        const id = item.getAttribute('data-id');
        if (!filteredDownloads.find(d => d.id === id)) {
            item.remove();
        }
    });

    // Reorder items within each lane to match sorted order
    const reorderLane = (laneEl, predicate) => {
        const laneItems = filteredDownloads
            .filter(predicate)
            .map(d => downloadsContainer.querySelector(`[data-id="${d.id}"]`))
            .filter(Boolean);
        laneItems.forEach(item => laneEl.appendChild(item));
    };

    reorderLane(laneQueued, d => d.status === 'queued' || d.status === 'retrying' || !d.status);
    reorderLane(laneActive, d => ['starting', 'downloading', 'processing'].includes(d.status));
    reorderLane(laneCompleted, d => d.status === 'completed');
    reorderLane(laneIssues, d => d.status === 'failed' || d.status === 'cancelled');

    // Update lane counts
    const setCount = (id, count) => {
        const el = document.getElementById(id);
        if (el) el.textContent = String(count);
    };

    setCount('kanbanCountQueued', filteredDownloads.filter(d => d.status === 'queued' || d.status === 'retrying' || !d.status).length);
    setCount('kanbanCountActive', filteredDownloads.filter(d => ['starting', 'downloading', 'processing'].includes(d.status)).length);
    setCount('kanbanCountCompleted', filteredDownloads.filter(d => d.status === 'completed').length);
    setCount('kanbanCountIssues', filteredDownloads.filter(d => d.status === 'failed' || d.status === 'cancelled').length);
}

// Create download item element (unified for all statuses)
function createDownloadItem(download) {
    const item = document.createElement('div');
    const downloadType = download.downloadType || 'video';
    item.className = `download-item ${download.status} ${downloadType}`;
    item.setAttribute('data-id', download.id);
    
    const statusText = getStatusText(download);
    const statusClass = getStatusClass(download.status);
    
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
    
    // Show progress bar for non-completed downloads
    const showProgress = !['completed', 'failed', 'cancelled'].includes(download.status);
    
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
            </div>
            <div class="download-status ${statusClass}">${statusText}</div>
            <div class="download-actions">
                ${createActionButtons(download)}
            </div>
        </div>
        ${showProgress ? `
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
function updateDownloadItemInPlace(item, download) {
    // Update title if it has changed
    const titleEl = item.querySelector('.download-url');
    if (titleEl) {
        const currentTitle = titleEl.textContent.replace(/\s*(torrent|magnet|video)\s*$/i, '').trim();
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
        speedEl.style.display = download.speed ? 'inline' : 'none';
    }
    if (etaEl) {
        etaEl.textContent = download.eta ? `⏰ ${download.eta}` : '';
        etaEl.style.display = download.eta ? 'inline' : 'none';
    }
    if (sizeEl) {
        sizeEl.textContent = download.size ? `💾 ${download.size}` : '';
        sizeEl.style.display = download.size ? 'inline' : 'none';
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
    
    // Update item class to reflect current status
    item.className = `download-item ${download.status} ${downloadType}`;
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
        case 'retrying': return `Retrying (${download.retryCount}/${currentState?.maxRetries || 2})`;
        default: return 'Queued';
    }
}

// Create action buttons for download items
function createActionButtons(download) {
    let buttons = '';
    
    if (download.status === 'queued' || download.status === 'retrying') {
        buttons += `<button class="action-btn cancel-btn" onclick="cancelDownload('${download.id}')">Cancel</button>`;
        
        // Add move up/down buttons for queued items
        const queuedDownloads = allDownloads.filter(d => d.status === 'queued' || d.status === 'retrying');
        const queueIndex = queuedDownloads.findIndex(d => d.id === download.id);
        
        if (queueIndex > 0) {
            buttons += `<button class="action-btn move-btn" onclick="moveUp(${queueIndex})">↑</button>`;
        }
        if (queueIndex < queuedDownloads.length - 1) {
            buttons += `<button class="action-btn move-btn" onclick="moveDown(${queueIndex})">↓</button>`;
        }
    } else if (download.status === 'downloading' || download.status === 'starting' || download.status === 'processing') {
        buttons += `<button class="action-btn cancel-btn" onclick="cancelDownload('${download.id}')">Cancel</button>`;
    } else if (download.status === 'failed') {
        buttons += `<button class="action-btn retry-btn" onclick="retryDownload('${download.id}')">Retry</button>`;
        buttons += `<button class="action-btn cancel-btn" onclick="removeDownload('${download.id}')">Remove</button>`;
    } else if (download.status === 'completed') {
        buttons += `<button class="action-btn remove-btn" onclick="removeDownload('${download.id}')">Remove</button>`;
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
    
    if (!currentState) return;
    
    const isEnabled = currentState.queueEnabled;
    const hasItems = currentState.stats.queued > 0 || currentState.stats.active > 0;
    
    controlsContainer.innerHTML = `
        <div class="control-group">
            <button class="control-btn ${isEnabled ? 'active' : ''}" onclick="toggleQueue()">
                ${isEnabled ? '⏸️ Pause Queue' : '▶️ Resume Queue'}
            </button>
            <button class="control-btn" onclick="clearCompleted()" style="display: none;">
                🗑️ Clear Completed
            </button>
            <button class="control-btn" onclick="retryFailed()" ${currentState.stats.failed === 0 ? 'disabled' : ''} style="display: none;">
                🔄 Retry Failed
            </button>
        </div>
        <div class="queue-info">
            <span>Queue: ${currentState.stats.queued}</span>
            <span>Active: ${currentState.stats.active}/${currentState.maxConcurrentDownloads || 3}</span>
            <span>Completed: ${currentState.stats.completed}</span>
            <span>Failed: ${currentState.stats.failed}</span>
        </div>
    `;
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

// Remove a download from the list
async function removeDownload(id) {
    try {
        const response = await fetch(`/api/download/${id}/remove`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('Download removed', 'success');
        } else {
            showNotification('Failed to remove download', 'error');
        }
    } catch (error) {
        console.error('Error removing download:', error);
        showNotification('Failed to remove download', 'error');
    }
}

// Retry a failed download
async function retryDownload(id) {
    try {
        const response = await fetch(`/api/download/${id}/retry`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showNotification('Download retried', 'success');
        } else {
            showNotification('Failed to retry download', 'error');
        }
    } catch (error) {
        console.error('Error retrying download:', error);
        showNotification('Failed to retry download', 'error');
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
async function clearCompleted() {
    try {
        const response = await fetch('/api/downloads/clear-completed', {
            method: 'POST'
        });
        
        if (response.ok) {
            showNotification('Completed downloads cleared', 'success');
        } else {
            showNotification('Failed to clear completed downloads', 'error');
        }
    } catch (error) {
        console.error('Error clearing completed downloads:', error);
        showNotification('Failed to clear completed downloads', 'error');
    }
}

// Retry all failed downloads
async function retryFailed() {
    try {
        const response = await fetch('/api/downloads/retry-failed', {
            method: 'POST'
        });
        
        if (response.ok) {
            showNotification('Failed downloads retried', 'success');
        } else {
            showNotification('Failed to retry downloads', 'error');
        }
    } catch (error) {
        console.error('Error retrying failed downloads:', error);
        showNotification('Failed to retry downloads', 'error');
    }
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => notification.classList.add('show'), 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                document.body.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (eventSource) {
        eventSource.close();
    }
});