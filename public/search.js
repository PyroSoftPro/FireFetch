let searchResults = [];
let currentSearchQuery = '';
let currentVideoForDownload = null;

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
        console.log('Search response data:', data); // Debug log
        console.log('Response status:', response.status); // Debug log
        
        // Update global variable
        searchResults = data.results || [];
        console.log('Parsed search results length:', searchResults.length); // Debug log
        console.log('First result:', searchResults[0]); // Debug log
        
        displaySearchResults(searchResults);
        
    } catch (error) {
        console.error('Search error:', error);
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
    console.log('displaySearchResults called with:', results); // Debug log
    const searchResultsContainer = document.getElementById('searchResults');
    const noResults = document.getElementById('noResults');
    const searchResultsHeader = document.getElementById('searchResultsHeader');
    const resultsCount = document.getElementById('resultsCount');
    
    if (!results || results.length === 0) {
        console.log('No results to display'); // Debug log
        noResults.style.display = 'block';
        searchResultsHeader.style.display = 'none';
        return;
    }
    
    // Show results header
    searchResultsHeader.style.display = 'flex';
    resultsCount.textContent = `${results.length} results for "${currentSearchQuery}"`;
    noResults.style.display = 'none';
    
    // Generate HTML for results (Fluent card grid)
    console.log('About to generate HTML for', results.length, 'results'); // Debug log
    const htmlContent = results.map((video, index) => {
        const duration = formatDuration(video.duration);
        const thumbnail = video.thumbnail || '';
        const title = escapeHtml(video.title || 'Untitled');
        const uploader = escapeHtml(video.uploader || 'Unknown');
        const description = escapeHtml(video.description || '');
        
        return `
            <div class="ff-card media-card">
                ${thumbnail
                    ? `<img class="media-thumb" src="${thumbnail}" alt="${title}" loading="lazy">`
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
    
    console.log('Generated HTML content length:', htmlContent.length); // Debug log
    console.log('First HTML snippet:', htmlContent[0]?.substring(0, 200)); // Debug log
    
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
    modal.style.display = 'block';
    
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
        const response = await fetch('/api/stream-url', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ url: video.webpage_url || video.url })
        });
        
        if (!response.ok) {
            throw new Error('Failed to get stream URL');
        }
        
        const data = await response.json();
        
        if (data.streamUrl) {
            playVideoStream(data.streamUrl, video.title);
        } else {
            throw new Error('No stream URL available');
        }
        
    } catch (error) {
        console.error('Stream error:', error);
        showFetchError('Failed to stream video. Try downloading instead.');
    }
}

// Play video in modal player
function playVideoStream(streamUrl, title) {
    const player = document.getElementById('videoPlayer');
    const playerVideo = document.getElementById('playerVideo');
    
    playerVideo.src = streamUrl;
    player.style.display = 'block';
    
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
            playerVideo.play();
        }
    }
}

// Close video player
function closePlayer() {
    const player = document.getElementById('videoPlayer');
    const playerVideo = document.getElementById('playerVideo');
    
    playerVideo.pause();
    playerVideo.src = '';
    player.style.display = 'none';
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