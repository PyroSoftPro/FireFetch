let videosData = [];
let filteredVideos = [];

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

const siteFriendlyNames = {
    'youtube': 'YouTube',
    'Youtube': 'YouTube',
    'vimeo': 'Vimeo',
    'facebook': 'Facebook',
    'twitter': 'Twitter',
    'twitch': 'Twitch',
    'instagram': 'Instagram',
    'tiktok': 'TikTok',
    'reddit': 'Reddit',
    'dailymotion': 'Dailymotion',
    'soundcloud': 'SoundCloud',
    'mixcloud': 'Mixcloud'
};

function getSiteFriendlyName(site) {
    return siteFriendlyNames[site] || site || 'Unknown';
}

async function loadVideos() {
    try {
        const response = await fetch('/api/videos');
        if (!response.ok) {
            throw new Error('Failed to load videos');
        }
        
        const allData = await response.json();
        // Filter for only video files, exclude torrents and other file types
        videosData = allData.filter(file => file.fileType === 'video');
        filteredVideos = [...videosData];
        populateSiteFilter();
        displayVideos(filteredVideos);
    } catch (error) {
        console.error('Error loading videos:', error);
        showFetchError('Failed to load videos');
    }
}

function populateSiteFilter() {
    const siteFilter = document.getElementById('siteFilter');
    const uniqueSites = [...new Set(videosData.map(v => v.site || ''))].filter(s => s);
    
    // Clear existing options except "All Sites"
    siteFilter.innerHTML = '<option value="">All Sites</option>';
    
    // Add unique sites
    uniqueSites.sort().forEach(site => {
        const option = document.createElement('option');
        option.value = site;
        option.textContent = getSiteFriendlyName(site);
        siteFilter.appendChild(option);
    });
}

function filterVideos() {
    const siteFilter = document.getElementById('siteFilter').value;
    
    if (siteFilter === '') {
        filteredVideos = [...videosData];
    } else {
        filteredVideos = videosData.filter(video => video.site === siteFilter);
    }
    
    sortVideos();
}

function sortVideos() {
    const sortBy = document.getElementById('sortBy').value;
    
    switch(sortBy) {
        case 'title':
            filteredVideos.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'site':
            filteredVideos.sort((a, b) => {
                const siteA = getSiteFriendlyName(a.site);
                const siteB = getSiteFriendlyName(b.site);
                return siteA.localeCompare(siteB);
            });
            break;
        case 'duration':
            filteredVideos.sort((a, b) => {
                const durA = parseDuration(a.duration);
                const durB = parseDuration(b.duration);
                return durB - durA;
            });
            break;
        case 'date':
        default:
            // Keep original order (by date)
            filteredVideos = [...filteredVideos];
            break;
    }
    
    displayVideos(filteredVideos);
}

function parseDuration(duration) {
    if (!duration) return 0;
    const parts = duration.split(':').reverse();
    let seconds = 0;
    parts.forEach((part, index) => {
        seconds += parseInt(part) * Math.pow(60, index);
    });
    return seconds;
}

function displayVideos(videos) {
    const grid = document.getElementById('videoGrid');
    const noVideos = document.getElementById('noVideos');
    
    if (videos.length === 0) {
        grid.style.display = 'none';
        noVideos.style.display = 'block';
        return;
    }
    
    grid.style.display = 'grid';
    noVideos.style.display = 'none';
    
    grid.innerHTML = videos.map((video, index) => {
        const originalIndex = videosData.indexOf(video);
        return `
        <div class="video-card">
            <div class="thumbnail-container" onclick="playVideo(${originalIndex})">
                ${video.thumbnail ? 
                    `<img src="${video.thumbnail}" alt="${video.title}" class="video-thumbnail">` :
                    `<div class="video-thumbnail default-thumbnail" style="background: linear-gradient(135deg, #6b6b6b 0%, #ff6b35 100%); display: flex; align-items: center; justify-content: center; color: white;">
                        <svg width="60" height="60" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </div>`
                }
                ${video.duration ? `<div class="video-duration">${video.duration}</div>` : ''}
                <div class="video-card-actions">
                    <button class="card-action-button" onclick="event.stopPropagation(); showVideoInfo(${originalIndex})" title="Video Info">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                        </svg>
                    </button>
                    <button class="card-action-button" onclick="event.stopPropagation(); playVideo(${originalIndex})" title="Play">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                    <button class="card-action-button delete-button" onclick="event.stopPropagation(); deleteVideo(${originalIndex})" title="Delete">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="video-info">
                <div class="video-title">${video.title}</div>
                <div class="video-meta">
                    ${video.site ? `<span class="video-site" style="background: #ff6b6b; color: white; padding: 2px 8px; border-radius: 12px; font-size: 12px; margin-right: 8px; display: inline-block;">${getSiteFriendlyName(video.site)}</span>` : ''}
                    ${video.uploader ? `<span class="video-uploader">${video.uploader}</span>` : ''}
                    ${video.description ? `<div class="video-description" style="color: #999; font-size: 13px; margin-top: 5px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;">${video.description}</div>` : ''}
                </div>
            </div>
        </div>
        `;
    }).join('');
}

function playVideo(index) {
    const video = videosData[index];
    const player = document.getElementById('videoPlayer');
    const playerVideo = document.getElementById('playerVideo');
    
    playerVideo.src = `/videos/${encodeURIComponent(video.filename)}`;
    player.style.display = 'block';
    
    // Check autoplay setting
    const savedSettings = localStorage.getItem('firefetch-settings');
    if (savedSettings) {
        const settings = JSON.parse(savedSettings);
        if (settings.autoPlay) {
            playerVideo.play();
        }
    }
}

function closePlayer() {
    const player = document.getElementById('videoPlayer');
    const playerVideo = document.getElementById('playerVideo');
    
    playerVideo.pause();
    playerVideo.src = '';
    player.style.display = 'none';
}

// Close player when clicking outside the video
document.getElementById('videoPlayer').addEventListener('click', function(e) {
    if (e.target === this) {
        closePlayer();
    }
});

// Close player on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        closePlayer();
    }
});

let currentVideoIndex = null;

function showVideoInfo(index) {
    currentVideoIndex = index;
    const video = videosData[index];
    const modal = document.getElementById('videoModal');
    
    // Set modal content
    const modalThumbnail = document.getElementById('modalThumbnail');
    const modalThumbnailContainer = modalThumbnail.parentElement;
    
    if (video.thumbnail) {
        modalThumbnail.src = video.thumbnail;
        modalThumbnail.style.display = 'block';
        modalThumbnailContainer.style.background = '';
        modalThumbnailContainer.classList.remove('default-thumbnail-modal');
    } else {
        modalThumbnail.style.display = 'none';
        modalThumbnailContainer.style.background = 'linear-gradient(135deg, #6b6b6b 0%, #ff6b35 100%)';
        modalThumbnailContainer.classList.add('default-thumbnail-modal');
    }
    
    document.getElementById('modalTitle').textContent = video.title;
    document.getElementById('modalSite').textContent = getSiteFriendlyName(video.site);
    document.getElementById('modalUploader').textContent = video.uploader || 'Unknown';
    document.getElementById('modalDuration').textContent = video.duration || 'Unknown';
    document.getElementById('modalFilename').textContent = video.filename;
    document.getElementById('modalDescription').textContent = video.description || 'No description available.';
    
    // Hide full metadata initially
    document.getElementById('fullMetadata').style.display = 'none';
    
    // Show modal
    modal.style.display = 'block';
}

function closeModal() {
    document.getElementById('videoModal').style.display = 'none';
    currentVideoIndex = null;
}

function playFromModal() {
    if (currentVideoIndex !== null) {
        closeModal();
        playVideo(currentVideoIndex);
    }
}

async function showFullMetadata() {
    if (currentVideoIndex === null) return;
    
    const video = videosData[currentVideoIndex];
    const metadataDiv = document.getElementById('fullMetadata');
    const metadataContent = document.getElementById('metadataContent');
    
    metadataContent.textContent = 'Loading metadata...';
    metadataDiv.style.display = 'block';
    
    try {
        // Fetch full metadata from server
        const response = await fetch(`/api/video-metadata/${encodeURIComponent(video.filename)}`);
        
        // Check if response is JSON before parsing
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Server returned non-JSON response');
        }
        
        const data = await response.json();
        
        if (response.ok) {
            metadataContent.textContent = JSON.stringify(data, null, 2);
        } else {
            metadataContent.textContent = data.error || 'Metadata not found';
            if (data.details) {
                metadataContent.textContent += '\n\nDetails: ' + data.details;
            }
            // Add info about missing metadata file
            if (data.error === 'Metadata file not found') {
                metadataContent.textContent += '\n\nNote: The metadata file (.info.json) may not exist for this video. ' +
                    'This can happen if the video was downloaded without the "Save metadata" option enabled.';
            }
        }
    } catch (error) {
        console.error('Error loading metadata:', error);
        metadataContent.textContent = 'Error loading metadata: ' + error.message + 
            '\n\nThis might happen if the metadata file does not exist for this video.';
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(e) {
    const modal = document.getElementById('videoModal');
    if (e.target === modal) {
        closeModal();
    }
});

// Delete video function
async function deleteVideo(index) {
    const video = videosData[index];
    const confirmDelete = confirm(`Are you sure you want to delete "${video.title}"?`);
    
    if (!confirmDelete) return;
    
    try {
        const response = await fetch(`/api/delete-video/${encodeURIComponent(video.filename)}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            // Reload videos
            await loadVideos();
        } else {
            const error = await response.json();
            alert('Failed to delete video: ' + (error.error || 'Unknown error'));
        }
    } catch (error) {
        console.error('Error deleting video:', error);
        alert('Failed to delete video: ' + error.message);
    }
}

// Load videos when page loads
window.addEventListener('DOMContentLoaded', loadVideos);