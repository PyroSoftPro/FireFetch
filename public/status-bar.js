// Global status bar functionality for all pages

let statusBarEventSource = null;
let statusBarState = null;

// Initialize status bar on all pages
document.addEventListener('DOMContentLoaded', function() {
    initializeStatusBar();
});

function initializeStatusBar() {
    // Create status bar
    createStatusBar();
    
    // Connect to download stream for status updates
    connectToStatusStream();
}

function createStatusBar() {
    let statusBar = document.getElementById('statusBar');
    
    if (!statusBar) {
        statusBar = document.createElement('div');
        statusBar.id = 'statusBar';
        statusBar.className = 'status-bar';
        document.body.appendChild(statusBar);
    }
    
    // Initial empty state
    updateStatusBarDisplay({
        stats: { active: 0, queued: 0, completed: 0 },
        maxConcurrent: 3,
        totalSpeeds: { download: '0 B/s', upload: '0 B/s' }
    });
}

function connectToStatusStream() {
    if (statusBarEventSource) {
        statusBarEventSource.close();
    }
    
    statusBarEventSource = new EventSource('/api/download-stream');
    
    statusBarEventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'state' || data.type === 'update') {
                statusBarState = data.data;
                updateStatusBarDisplay(statusBarState);
            }
        } catch (error) {
            console.error('Error parsing status bar SSE data:', error);
        }
    };
    
    statusBarEventSource.onerror = function(error) {
        console.error('Status bar SSE connection error:', error);
        // Reconnect after delay
        setTimeout(() => {
            connectToStatusStream();
        }, 5000);
    };
}

function updateStatusBarDisplay(state) {
    const statusBar = document.getElementById('statusBar');
    if (!statusBar || !state) return;
    
    const downloadSpeed = state.totalSpeeds?.download || '0 B/s';
    const uploadSpeed = state.totalSpeeds?.upload || '0 B/s';
    
    // Only show upload speed if it's greater than 0
    const showUpload = uploadSpeed !== '0 B/s' && uploadSpeed !== '0.0 B/s';
    
    statusBar.innerHTML = `
        <div class="status-left">
            <span>Active: ${state.stats.active}/${state.maxConcurrent}</span>
            <span class="status-separator">|</span>
            <span>Queued: ${state.stats.queued}</span>
            <span class="status-separator">|</span>
            <span>Completed: ${state.stats.completed}</span>
        </div>
        <div class="status-right">
            <div class="speed-indicator">
                <span class="download-speed">⬇ ${downloadSpeed}</span>
            </div>
            ${showUpload ? `
                <div class="speed-indicator">
                    <span class="upload-speed">⬆ ${uploadSpeed}</span>
                </div>
            ` : ''}
        </div>
    `;
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (statusBarEventSource) {
        statusBarEventSource.close();
    }
});