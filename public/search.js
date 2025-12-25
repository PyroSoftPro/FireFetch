let searchResults = [];
let currentSearchQuery = '';
let currentVideoForDownload = null;
let currentStreamVideo = null;
let streamWarmupTimer = null;
const DEFAULT_STREAM_FORMAT = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
const PREVIEW_MIN_BUFFER_SECONDS = 30;
let currentPrefetchJobId = null;
let prefetchPollTimer = null;

// Debug logging (off by default for performance)
let FF_SEARCH_DEBUG = false;
try {
    FF_SEARCH_DEBUG = localStorage.getItem('firefetch-debug') === '1';
} catch {}
const ffSearchLog = (...args) => { if (FF_SEARCH_DEBUG) console.log(...args); };
const ffSearchWarn = (...args) => { if (FF_SEARCH_DEBUG) console.warn(...args); };
const ffSearchErr = (...args) => { if (FF_SEARCH_DEBUG) console.error(...args); };

// Best-effort: if backend debug is enabled, allow it to turn on search logs too.
fetch('/api/debug', { cache: 'no-store' })
    .then(r => r.ok ? r.json() : null)
    .then(data => {
        if (data && typeof data.debug === 'boolean') FF_SEARCH_DEBUG = FF_SEARCH_DEBUG || data.debug;
    })
    .catch(() => {});

// Error handling functions (reused from other pages)
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
    
    setTimeout(() => {
        if (document.getElementById('fetchErrorMessage')) {
            document.getElementById('fetchErrorMessage').remove();
        }
    }, 10000);
}

// Main search function
async function performSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchButton = document.getElementById('searchButton');
    const searchLoading = document.getElementById('searchLoading');
    const searchResultsContainer = document.getElementById('searchResults');
    const noResults = document.getElementById('noResults');
    const searchResultsHeader = document.getElementById('searchResultsHeader');
    
    const query = searchInput.value.trim();
    if (!query) {
        showFetchError('Please enter a search query');
        return;
    }
    
    currentSearchQuery = query;
    
    // Show loading state
    searchButton.disabled = true;
    searchButton.textContent = 'Searching...';
    searchLoading.style.display = 'block';
    searchResultsContainer.innerHTML = '';
    noResults.style.display = 'none';
    searchResultsHeader.style.display = 'none';
    
    try {
        const response = await fetch('/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ query, limit: 40 })
        });
        
        if (!response.ok) {
            throw new Error('Search failed');
        }
        
        const data = await response.json();
        ffSearchLog('Search response data:', data);
        ffSearchLog('Response status:', response.status);
        
        // Update global variable
        searchResults = data.results || [];
        ffSearchLog('Parsed search results length:', searchResults.length);
        ffSearchLog('First result:', searchResults[0]);
        
        displaySearchResults(searchResults);
        
    } catch (error) {
        ffSearchErr('Search error:', error);
        showFetchError('Search failed. Please try again.');
        noResults.style.display = 'block';
    } finally {
        // Reset UI state
        searchButton.disabled = false;
        searchButton.textContent = 'Search';
        searchLoading.style.display = 'none';
    }
}

// Display search results
function displaySearchResults(results) {
    ffSearchLog('displaySearchResults called with:', results);
    const searchResultsContainer = document.getElementById('searchResults');
    const noResults = document.getElementById('noResults');
    const searchResultsHeader = document.getElementById('searchResultsHeader');
    const resultsCount = document.getElementById('resultsCount');
    
    if (!results || results.length === 0) {
        ffSearchLog('No results to display');
        noResults.style.display = 'block';
        searchResultsHeader.style.display = 'none';
        return;
    }
    
    // Show results header
    searchResultsHeader.style.display = 'flex';
    resultsCount.textContent = `${results.length} results for "${currentSearchQuery}"`;
    noResults.style.display = 'none';
    
    // Generate HTML for results (Fluent card grid)
    ffSearchLog('About to generate HTML for', results.length, 'results');
    const htmlContent = results.map((video, index) => {
        const duration = formatDuration(video.duration);
        const thumbnail = video.thumbnail || '';
        const title = escapeHtml(video.title || 'Untitled');
        const uploader = escapeHtml(video.uploader || 'Unknown');
        
        return `
            <div class="ff-card media-card">
                ${thumbnail
                    ? `<img class="media-thumb" src="${thumbnail}" alt="${title}" loading="lazy" decoding="async" fetchpriority="low">`
                    : `<div class="media-thumb" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg, rgba(107,107,107,0.7) 0%, rgba(255,107,53,0.7) 100%);color:white;">
                           <i data-lucide="play-circle"></i>
                       </div>`
                }
                ${duration ? `<div class="video-duration">${duration}</div>` : ''}
                <div class="media-actions">
                    <button class="icon-btn" type="button" onclick="openDownloadModal(${index})" title="Download">
                        <i data-lucide="download"></i>
                    </button>
                    <button class="icon-btn" type="button" onclick="streamVideo(${index})" title="Stream">
                        <i data-lucide="play"></i>
                    </button>
                </div>
                <div class="media-meta">
                    <div class="media-title">${title}</div>
                    <div class="media-sub">
                        <span>${uploader}</span>
                        ${video.view_count ? `<span>• ${formatViewCount(video.view_count)} views</span>` : ''}
                        ${video.upload_date ? `<span>• ${formatUploadDate(video.upload_date)}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    ffSearchLog('Generated HTML content length:', htmlContent.length);
    ffSearchLog('First HTML snippet:', htmlContent[0]?.substring(0, 200));
    
    searchResultsContainer.innerHTML = htmlContent.join('');

    try {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    } catch {
        // ignore icon failures
    }
}

// Sort search results
function sortSearchResults() {
    const sortBy = document.getElementById('sortResults').value;
    
    switch(sortBy) {
        case 'duration':
            searchResults.sort((a, b) => (b.duration || 0) - (a.duration || 0));
            break;
        case 'title':
            searchResults.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
            break;
        case 'uploader':
            searchResults.sort((a, b) => (a.uploader || '').localeCompare(b.uploader || ''));
            break;
        case 'relevance':
        default:
            // Keep original order (relevance)
            break;
    }
    
    displaySearchResults(searchResults);
}

// Open download modal and fetch video formats
async function openDownloadModal(index) {
    console.log('openDownloadModal called with index:', index); // Debug log
    console.log('searchResults length:', searchResults.length); // Debug log
    const video = searchResults[index];
    console.log('Selected video:', video); // Debug log
    currentVideoForDownload = video;
    console.log('currentVideoForDownload set to:', currentVideoForDownload); // Debug log
    
    const modal = document.getElementById('downloadModal');
    const title = document.getElementById('downloadVideoTitle');
    const uploader = document.getElementById('downloadVideoUploader');
    const qualitySelect = document.getElementById('qualitySelect');
    const startDownloadBtn = document.getElementById('startDownloadBtn');
    
    // Set video info
    title.textContent = video.title || 'Untitled';
    uploader.textContent = `by ${video.uploader || 'Unknown'}`;
    
    // Reset quality selector
    qualitySelect.innerHTML = '<option value="">Loading formats...</option>';
    startDownloadBtn.disabled = true;
    
    // Show modal
    modal.style.display = 'flex';
    
    // Fetch available formats
    try {
        const response = await fetch('/api/video-info', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: video.webpage_url || video.url })
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch video formats');
        }
        
        const data = await response.json();
        
        // Populate quality options with proper formatting
        qualitySelect.innerHTML = '';
        
        if (data.formats && data.formats.length > 0) {
            // Sort and categorize formats like the main script
            const bestFormats = [];
            const videoFormats = [];
            const audioFormats = [];
            const otherFormats = [];
            
            data.formats.forEach(format => {
                if (format.vcodec && format.vcodec !== 'none' && format.acodec && format.acodec !== 'none') {
                    bestFormats.push(format);
                } else if (format.vcodec && format.vcodec !== 'none') {
                    videoFormats.push(format);
                } else if (format.acodec && format.acodec !== 'none') {
                    audioFormats.push(format);
                } else {
                    otherFormats.push(format);
                }
            });
            
            // Add Best Quality group
            if (bestFormats.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'Pre-merged (Video + Audio) - Limited Quality';
                
                bestFormats.forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.format_id;
                    let text = `${format.resolution || format.height + 'p' || 'Unknown'}`;
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
            
            // Add Video Only group
            if (videoFormats.length > 0) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = 'High Quality Video (Will merge with best audio)';
                
                videoFormats.forEach(format => {
                    const option = document.createElement('option');
                    option.value = format.format_id;
                    let text = `${format.resolution || format.height + 'p' || 'Unknown'}`;
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
            
            // Add Audio Only group
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
            
            // Add Other Formats group if needed
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
            
            // Enable download button
            startDownloadBtn.disabled = false;
        } else {
            qualitySelect.innerHTML = '<option value="">No formats available</option>';
        }
        
    } catch (error) {
        console.error('Error fetching formats:', error);
        qualitySelect.innerHTML = '<option value="">Error loading formats</option>';
        showFetchError('Failed to load video formats');
    }
}

// Start download from modal
async function startDownload() {
    console.log('startDownload called'); // Debug log
    console.log('currentVideoForDownload:', currentVideoForDownload); // Debug log
    console.log('currentVideoForDownload keys:', Object.keys(currentVideoForDownload || {})); // Debug log
    console.log('currentVideoForDownload.id:', currentVideoForDownload?.id); // Debug log
    
    if (!currentVideoForDownload) {
        console.error('currentVideoForDownload is null!'); // Debug log
        showFetchError('No video selected for download');
        return;
    }
    
    const qualitySelect = document.getElementById('qualitySelect');
    const selectedFormat = qualitySelect.value;
    
    if (!selectedFormat) {
        showFetchError('Please select a quality first');
        return;
    }
    
    // Store video data before closing modal (which sets currentVideoForDownload to null)
    const videoData = currentVideoForDownload;
    closeDownloadModal();
    
    try {
        // Double-check that video data exists and has required properties
        console.log('Checking video data validity...');
        console.log('videoData exists:', !!videoData);
        console.log('videoData.id exists:', !!videoData?.id);
        console.log('videoData.id value:', videoData?.id);
        
        if (!videoData || !videoData.id) {
            console.error('Video validation failed!');
            throw new Error('No video data available for download');
        }
        
        // Construct the video URL from available data
        let videoUrl = videoData.webpage_url || 
                      videoData.url || 
                      `https://www.youtube.com/watch?v=${videoData.id}`;
        
        console.log('Video object:', videoData); // Debug log
        console.log('Constructed video URL:', videoUrl); // Debug log
        
        const downloadRequest = { 
            url: videoUrl,
            format: selectedFormat,
            title: videoData.title
        };
        
        console.log('Sending download request:', downloadRequest); // Debug log
        
        const response = await fetch('/api/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(downloadRequest)
        });
        
        console.log('Download response status:', response.status); // Debug log
        
        if (response.ok) {
            const result = await response.json();
            console.log('Download response:', result); // Debug log
            
            if (result.success) {
                // Redirect to downloads page to monitor progress
                window.location.href = 'downloads.html';
            } else {
                throw new Error(result.error || 'Download failed to start');
            }
        } else {
            const errorText = await response.text();
            console.error('Download failed with status:', response.status, errorText); // Debug log
            throw new Error(`Download failed: ${response.status} ${errorText}`);
        }
        
    } catch (error) {
        console.error('Download error:', error);
        showFetchError(`Failed to start download: ${error.message}`);
    }
}

// Stream video directly
async function streamVideo(index) {
    const video = searchResults[index];
    
    try {
        const url = video.webpage_url || video.url;
        if (!url) throw new Error('No video URL available');

        currentStreamVideo = video;
        openStreamPlayer(video.title || 'Untitled');

        // Start stream immediately (1080p default) and warm-buffer so the user can hit play once ready.
        startStreamPlayback(url, DEFAULT_STREAM_FORMAT, video.title);

        // Populate player quality options in the background.
        populateStreamQualityOptions(url).catch(() => {
            // Non-fatal: keep Auto streaming.
        });
        
    } catch (error) {
        console.error('Stream error:', error);
        showFetchError('Failed to stream video. Try downloading instead.');
    }
}

function openStreamPlayer(title) {
    const player = document.getElementById('videoPlayer');
    const titleEl = document.getElementById('playerTitle');
    const statusEl = document.getElementById('playerBufferStatus');
    const qualitySelect = document.getElementById('playerQualitySelect');

    if (titleEl) titleEl.textContent = title || 'Untitled';
    if (statusEl) statusEl.textContent = 'Buffering…';
    if (qualitySelect) {
        qualitySelect.disabled = true;
        qualitySelect.innerHTML = '<option value="">Auto (recommended)</option>';
    }

    player.style.display = 'flex';
}

function buildStreamEndpoint(url, formatSelector) {
    const params = new URLSearchParams();
    params.set('url', url);
    if (formatSelector) params.set('format', formatSelector);
    return `/api/stream?${params.toString()}`;
}

function formatBytes(bytes) {
    const n = Number(bytes || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const value = n / Math.pow(1024, i);
    return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function updatePlayerBufferStatus(text) {
    const statusEl = document.getElementById('playerBufferStatus');
    if (statusEl) statusEl.textContent = text;
}

function attachPlayerStatusHandlers(playerVideo) {
    if (!playerVideo || playerVideo.dataset.ffPlayerStatusHandlers) return;
    playerVideo.dataset.ffPlayerStatusHandlers = '1';

    const getBufferedAheadSeconds = () => {
        try {
            if (!playerVideo.buffered || playerVideo.buffered.length === 0) return 0;
            const t = Number(playerVideo.currentTime || 0);
            // Prefer the buffered range that contains currentTime.
            for (let i = 0; i < playerVideo.buffered.length; i++) {
                const start = playerVideo.buffered.start(i);
                const end = playerVideo.buffered.end(i);
                if (start <= t && end >= t) {
                    return Math.max(0, end - t);
                }
            }
            // Fallback to the last range.
            return Math.max(0, playerVideo.buffered.end(playerVideo.buffered.length - 1) - t);
        } catch {
            return 0;
        }
    };

    const getRequiredBufferSeconds = () => {
        const t = Number(playerVideo.currentTime || 0);
        const dur = Number(playerVideo.duration);
        // For short clips, don't require more than what's left.
        if (Number.isFinite(dur) && dur > 0) {
            return Math.max(0, Math.min(PREVIEW_MIN_BUFFER_SECONDS, dur - t));
        }
        return PREVIEW_MIN_BUFFER_SECONDS;
    };

    let gateInterval = null;
    const clearBufferGate = () => {
        if (gateInterval) {
            clearInterval(gateInterval);
            gateInterval = null;
        }
        delete playerVideo.dataset.ffGatePendingPlay;
        delete playerVideo.dataset.ffGatePausing;
        delete playerVideo.dataset.ffGateBypassOnce;
    };

    const tickBufferGate = () => {
        // Stop if the source is being torn down.
        if (playerVideo.dataset.ffClosing === '1') {
            clearBufferGate();
            return;
        }
        if (playerVideo.dataset.ffGatePendingPlay !== '1') return;

        const required = getRequiredBufferSeconds();
        const ahead = getBufferedAheadSeconds();
        const pct = required > 0 ? Math.min(100, Math.round((ahead / required) * 100)) : 100;

        if (ahead >= required && required > 0) {
            clearBufferGate();
            // Avoid immediately re-triggering the gate on our own play().
            playerVideo.dataset.ffGateBypassOnce = '1';
            playerVideo.play().catch(() => {
                // If autoplay is blocked, the user can press play again.
            });
            return;
        }

        // Keep status helpful while waiting.
        updatePlayerBufferStatus(`Buffering… ${Math.floor(ahead)}s / ${Math.ceil(required)}s (${pct}%)`);
    };

    playerVideo.addEventListener('waiting', () => updatePlayerBufferStatus('Buffering…'));
    playerVideo.addEventListener('stalled', () => updatePlayerBufferStatus('Buffering…'));
    playerVideo.addEventListener('loadstart', () => updatePlayerBufferStatus('Starting stream…'));
    playerVideo.addEventListener('canplay', () => {
        const secs = Math.floor(getBufferedAheadSeconds());
        updatePlayerBufferStatus(secs > 0 ? `Ready (buffered ~${secs}s). Click play.` : 'Ready. Click play.');
    });
    playerVideo.addEventListener('playing', () => updatePlayerBufferStatus('Playing'));
    playerVideo.addEventListener('pause', () => {
        if (playerVideo.dataset.ffClosing === '1') return;
        const secs = Math.floor(getBufferedAheadSeconds());
        updatePlayerBufferStatus(secs > 0 ? `Paused (buffered ~${secs}s)` : 'Paused');
    });
    playerVideo.addEventListener('progress', () => {
        if (playerVideo.readyState < 2) return;
        const secs = Math.floor(getBufferedAheadSeconds());
        if (secs > 0 && playerVideo.paused) {
            updatePlayerBufferStatus(`Ready (buffered ~${secs}s). Click play.`);
        }
    });

    // Buffer gate: when the user presses play, wait until ~30s are buffered ahead, then start playback.
    playerVideo.addEventListener('play', () => {
        // Don't interfere with teardown / warm-buffer / internal retries.
        if (playerVideo.dataset.ffClosing === '1') return;
        if (playerVideo.dataset.ffBypassBufferGate === '1') return;
        if (playerVideo.dataset.ffGateBypassOnce === '1') {
            delete playerVideo.dataset.ffGateBypassOnce;
            return;
        }

        const required = getRequiredBufferSeconds();
        if (required <= 0) return;

        const ahead = getBufferedAheadSeconds();
        if (ahead >= required) return;

        playerVideo.dataset.ffGatePendingPlay = '1';
        playerVideo.dataset.ffGatePausing = '1';
        try { playerVideo.pause(); } catch {}
        delete playerVideo.dataset.ffGatePausing;

        // Start (or keep) the polling loop until we have enough buffered.
        if (!gateInterval) {
            gateInterval = setInterval(tickBufferGate, 250);
        }
        tickBufferGate();
    });

    // Cleanup gate state when media is unloaded.
    playerVideo.addEventListener('emptied', clearBufferGate);
    playerVideo.addEventListener('ended', clearBufferGate);
}

function warmBufferStream(playerVideo) {
    if (!playerVideo) return;

    // Cancel any pending warmup
    if (streamWarmupTimer) {
        clearTimeout(streamWarmupTimer);
        streamWarmupTimer = null;
    }

    // Warm-buffer by attempting muted autoplay (allowed in Chromium) then pause.
    playerVideo.muted = true;
    // Bypass the 30s buffer gate during warmup (we only want to establish a connection + a small buffer).
    playerVideo.dataset.ffBypassBufferGate = '1';
    const playPromise = playerVideo.play();

    const stopWarmup = () => {
        try { playerVideo.pause(); } catch {}
        // Reset to start so user hits play from 0
        try { playerVideo.currentTime = 0; } catch {}
        playerVideo.muted = false;
        delete playerVideo.dataset.ffBypassBufferGate;
        playerVideo.removeEventListener('canplay', stopWarmup);
    };

    playerVideo.addEventListener('canplay', stopWarmup, { once: true });

    // Failsafe: stop warmup after a short window so we don't keep the stream running forever.
    streamWarmupTimer = setTimeout(() => {
        streamWarmupTimer = null;
        stopWarmup();
    }, 30000);

    if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {
            // Autoplay blocked; we still keep preload=auto + load(). Status handlers will indicate readiness when possible.
            playerVideo.removeEventListener('canplay', stopWarmup);
            if (streamWarmupTimer) {
                clearTimeout(streamWarmupTimer);
                streamWarmupTimer = null;
            }
            try { playerVideo.muted = false; } catch {}
            delete playerVideo.dataset.ffBypassBufferGate;
        });
    }
}

async function cancelPrefetchJob() {
    if (!currentPrefetchJobId) return;
    const id = currentPrefetchJobId;
    currentPrefetchJobId = null;
    if (prefetchPollTimer) {
        clearInterval(prefetchPollTimer);
        prefetchPollTimer = null;
    }
    try {
        await fetch(`/api/prefetch-stream/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
    } catch {
        // ignore
    }
}

async function startPrefetchAndLoadPlayer(url, formatSelector) {
    const playerVideo = document.getElementById('playerVideo');
    if (!playerVideo) return;

    await cancelPrefetchJob();

    // Tear down current <video> source to avoid keeping the old stream alive.
    playerVideo.dataset.ffClosing = '1';
    try { playerVideo.pause(); } catch {}
    playerVideo.src = '';
    try { playerVideo.load(); } catch {}
    setTimeout(() => { delete playerVideo.dataset.ffClosing; }, 200);

    updatePlayerBufferStatus('Buffering full video…');

    const resp = await fetch('/api/prefetch-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format: formatSelector || null })
    });

    if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        throw new Error(txt || `Prefetch failed (HTTP ${resp.status})`);
    }

    const data = await resp.json();
    const id = data?.id;
    if (!id) throw new Error('Prefetch did not return an id');
    currentPrefetchJobId = id;

    const pollOnce = async () => {
        if (!currentPrefetchJobId || currentPrefetchJobId !== id) return;
        const sResp = await fetch(`/api/prefetch-stream/${encodeURIComponent(id)}/status`, { cache: 'no-store' });
        if (!sResp.ok) throw new Error(`Prefetch status failed (HTTP ${sResp.status})`);
        const st = await sResp.json();

        if (st.status === 'failed') {
            throw new Error(st.error || 'Prefetch failed');
        }
        if (st.status === 'cancelled') {
            return;
        }

        const bytes = Number(st.bytesWritten || st.fileSize || 0);
        updatePlayerBufferStatus(`Buffering full video… ${formatBytes(bytes)}`);

        if (st.status === 'complete') {
            if (prefetchPollTimer) {
                clearInterval(prefetchPollTimer);
                prefetchPollTimer = null;
            }
            // Switch player to the fully buffered local file endpoint.
            playerVideo.preload = 'auto';
            playerVideo.src = `/api/prefetch-stream/${encodeURIComponent(id)}/file`;
            playerVideo.load();
            updatePlayerBufferStatus('Fully buffered. Click play.');
        }
    };

    // Poll until complete (or close/cancel).
    await pollOnce();
    prefetchPollTimer = setInterval(() => {
        pollOnce().catch((err) => {
            if (prefetchPollTimer) {
                clearInterval(prefetchPollTimer);
                prefetchPollTimer = null;
            }
            showFetchError(`Prefetch failed: ${err?.message || err}`);
        });
    }, 1000);
}

async function populateStreamQualityOptions(url) {
    const qualitySelect = document.getElementById('playerQualitySelect');
    if (!qualitySelect) return;

    qualitySelect.disabled = true;
    qualitySelect.innerHTML = '<option value="">Loading…</option>';

    const response = await fetch('/api/video-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
    });
    if (!response.ok) throw new Error(`video-info HTTP ${response.status}`);
    const data = await response.json();

    const heights = (data.formats || [])
        .map(f => Number(f?.height))
        .filter(n => Number.isFinite(n) && n > 0);
    const maxHeight = heights.length ? Math.max(...heights) : 1080;

    const presets = [2160, 1440, 1080, 720, 480, 360, 240].filter(h => h <= maxHeight);

    qualitySelect.innerHTML = '';
    const optAuto = document.createElement('option');
    optAuto.value = '';
    optAuto.textContent = 'Auto (recommended)';
    qualitySelect.appendChild(optAuto);

    presets.forEach((h) => {
        const opt = document.createElement('option');
        opt.value = `bestvideo[height<=${h}]+bestaudio/best[height<=${h}]`;
        opt.textContent = `${h}p`;
        qualitySelect.appendChild(opt);
    });

    const optAudio = document.createElement('option');
    optAudio.value = 'bestaudio/best';
    optAudio.textContent = 'Audio only';
    qualitySelect.appendChild(optAudio);

    qualitySelect.disabled = false;

    // Default selection: prefer 1080p; otherwise prefer the highest available preset; otherwise Auto.
    const has1080 = presets.includes(1080);
    if (has1080) {
        qualitySelect.value = `bestvideo[height<=1080]+bestaudio/best[height<=1080]`;
    } else if (presets.length > 0) {
        const highest = presets[0];
        qualitySelect.value = `bestvideo[height<=${highest}]+bestaudio/best[height<=${highest}]`;
    } else {
        qualitySelect.value = '';
    }

    qualitySelect.onchange = () => {
        if (!currentStreamVideo) return;
        const selected = qualitySelect.value || null;
        const streamUrl = currentStreamVideo.webpage_url || currentStreamVideo.url;
        startStreamPlayback(streamUrl, selected, currentStreamVideo.title);
    };
}

function startStreamPlayback(url, formatSelector, title) {
    const playerVideo = document.getElementById('playerVideo');
    if (!playerVideo) return;

    // Stream immediately so playback can begin once a small buffer is ready.
    // We gate actual playback to ~30s buffered via attachPlayerStatusHandlers().
    cancelPrefetchJob().catch(() => {});

    playerVideo.pause();
    playerVideo.preload = 'auto';
    playerVideo.src = buildStreamEndpoint(url, formatSelector);
    playerVideo.load();

    // Warm-buffer so the user can hit play once ready (or autoplay if enabled).
    warmBufferStream(playerVideo);
}

// Play video in modal player
function playVideoStream(streamUrl, title, options = {}) {
    const player = document.getElementById('videoPlayer');
    const playerVideo = document.getElementById('playerVideo');
    const titleEl = document.getElementById('playerTitle');
    
    // Defensive: yt-dlp can sometimes return multiple URLs separated by newlines.
    const cleanedUrl = String(streamUrl || '')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)[0] || '';

    if (titleEl) titleEl.textContent = title || 'Untitled';
    updatePlayerBufferStatus('Buffering…');
    attachPlayerStatusHandlers(playerVideo);
    
    // Attach one-time error diagnostics so a blank player becomes actionable.
    if (!playerVideo.dataset.ffStreamHandlers) {
        playerVideo.dataset.ffStreamHandlers = '1';
        
        playerVideo.addEventListener('error', () => {
            // Ignore errors triggered by deliberate teardown (close button / overlay click)
            if (playerVideo.dataset.ffClosing === '1') return;
            if (player.style.display === 'none') return;
            if (!playerVideo.src && !playerVideo.currentSrc) return;
            
            const mediaErr = playerVideo.error;
            const code = mediaErr?.code;
            const codeText = ({
                1: 'MEDIA_ERR_ABORTED',
                2: 'MEDIA_ERR_NETWORK',
                3: 'MEDIA_ERR_DECODE',
                4: 'MEDIA_ERR_SRC_NOT_SUPPORTED'
            })[code] || 'UNKNOWN';
            
            console.error('[STREAM] <video> error:', {
                code,
                codeText,
                src: playerVideo.currentSrc || playerVideo.src,
                networkState: playerVideo.networkState,
                readyState: playerVideo.readyState
            });
            
            // Browsers can emit transient errors during source changes, range probing, or retry logic.
            // Only surface an error toast if the stream still isn't playable shortly after the event.
            if (code === 1) return; // aborted
            
            const srcAtError = playerVideo.currentSrc || playerVideo.src;
            setTimeout(() => {
                const srcNow = playerVideo.currentSrc || playerVideo.src;
                if (srcNow !== srcAtError) return; // source changed; ignore this error
                
                const hasBuffered = (() => {
                    try {
                        return playerVideo.buffered && playerVideo.buffered.length > 0 && playerVideo.buffered.end(0) > 0;
                    } catch {
                        return false;
                    }
                })();
                
                // If we have data or playback has started, suppress the toast.
                if (playerVideo.readyState >= 2 || hasBuffered || playerVideo.currentTime > 0) return;
                
                showFetchError(`Stream failed to load (${codeText}). Try downloading instead.`);
            }, 800);
        });
    }
    
    playerVideo.pause();
    playerVideo.preload = 'auto';
    playerVideo.src = cleanedUrl;
    playerVideo.load();
    player.style.display = 'flex';
    
    // Check autoplay setting
    const savedSettings = localStorage.getItem('firefetch-settings');
    if (savedSettings) {
        let settings;
        try {
            settings = JSON.parse(savedSettings);
        } catch (err) {
            console.warn('[SETTINGS] Invalid settings in localStorage. Resetting to defaults.', err.message);
            localStorage.removeItem('firefetch-settings');
            settings = null;
        }
        if (settings?.autoPlay) {
            playerVideo.play().catch((err) => {
                console.warn('[STREAM] Autoplay failed:', err?.message || err);
            });
        } else if (options?.warmBuffer) {
            warmBufferStream(playerVideo);
        }
    } else if (options?.warmBuffer) {
        warmBufferStream(playerVideo);
    }
}

// Close video player
function closePlayer() {
    const player = document.getElementById('videoPlayer');
    const playerVideo = document.getElementById('playerVideo');
    const qualitySelect = document.getElementById('playerQualitySelect');
    
    if (streamWarmupTimer) {
        clearTimeout(streamWarmupTimer);
        streamWarmupTimer = null;
    }
    cancelPrefetchJob();

    // Mark closing so the <video> error handler doesn't show a toast while we tear down.
    playerVideo.dataset.ffClosing = '1';
    playerVideo.pause();
    playerVideo.src = '';
    try {
        // Reset the element state (helps avoid late error events)
        playerVideo.load();
    } catch {
        // ignore
    }
    player.style.display = 'none';
    currentStreamVideo = null;
    if (qualitySelect) {
        qualitySelect.disabled = true;
        qualitySelect.innerHTML = '<option value="">Auto (recommended)</option>';
    }
    setTimeout(() => {
        delete playerVideo.dataset.ffClosing;
    }, 500);
}

// Close download modal
function closeDownloadModal() {
    const modal = document.getElementById('downloadModal');
    modal.style.display = 'none';
    currentVideoForDownload = null;
}

// Utility functions
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return '';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
}

function formatViewCount(count) {
    if (!count) return '';
    
    if (count >= 1000000) {
        return (count / 1000000).toFixed(1) + 'M';
    } else if (count >= 1000) {
        return (count / 1000).toFixed(1) + 'K';
    } else {
        return count.toString();
    }
}

function formatUploadDate(dateString) {
    if (!dateString) return '';
    
    try {
        // yt-dlp returns dates in YYYYMMDD format
        const year = dateString.substr(0, 4);
        const month = dateString.substr(4, 2);
        const day = dateString.substr(6, 2);
        
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString();
    } catch (error) {
        return dateString;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFilesize(bytes) {
    if (!bytes) return '';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// Event listeners
document.addEventListener('DOMContentLoaded', function() {
    // Enter key to search
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });
    
    // Close modals when clicking outside
    document.getElementById('videoPlayer').addEventListener('click', function(e) {
        if (e.target === this) {
            closePlayer();
        }
    });
    
    document.getElementById('downloadModal').addEventListener('click', function(e) {
        if (e.target === this) {
            closeDownloadModal();
        }
    });
    
    // Close video player on Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closePlayer();
            closeDownloadModal();
        }
    });
    
    // Enable quality selection to enable download button
    document.getElementById('qualitySelect').addEventListener('change', function() {
        const startDownloadBtn = document.getElementById('startDownloadBtn');
        startDownloadBtn.disabled = !this.value;
    });
});