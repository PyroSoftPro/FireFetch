// Global status bar functionality for all pages

let statusBarEventSource = null;
let statusBarState = null;
let statusBarReconnectTimer = null;
let statusBarReconnectAttempt = 0;
let FF_STATUS_DEBUG = false;
try {
    FF_STATUS_DEBUG = localStorage.getItem('firefetch-debug') === '1';
} catch {}
const ffStatusLog = (...args) => { if (FF_STATUS_DEBUG) console.log(...args); };

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
        const container = document.querySelector('.container');
        (container || document.body).appendChild(statusBar);
    }

    // Build stable DOM once (so SSE updates only touch text nodes)
    statusBar.innerHTML = `
        <div class="status-left">
            <a class="status-pill status-pill--accent" href="downloads.html" title="Open Queue">
                <i data-lucide="activity"></i>
                <span>Active</span>
                <strong id="ffStatusActive">0</strong><span class="status-sep">/</span><span id="ffStatusMax">3</span>
            </a>
            <span class="status-pill status-pill--info">
                <i data-lucide="inbox"></i>
                <span>Queued</span>
                <strong id="ffStatusQueued">0</strong>
            </span>
            <span class="status-pill status-pill--good">
                <i data-lucide="check-circle-2"></i>
                <span>Done</span>
                <strong id="ffStatusCompleted">0</strong>
            </span>
        </div>
        <div class="status-right">
            <span class="status-pill">
                <i data-lucide="download"></i>
                <span id="ffStatusDown">0 B/s</span>
            </span>
            <span id="ffStatusUpWrap" class="status-pill">
                <i data-lucide="upload"></i>
                <span id="ffStatusUp">0 B/s</span>
            </span>
        </div>
    `;

    const tryCreateIcons = () => {
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
                return true;
            }
        } catch {
            // ignore icon failures
        }
        return false;
    };

    // If lucide isn't ready yet, hook into the loader used by global-components.js
    if (!tryCreateIcons()) {
        const s = document.querySelector('script[data-ff-lucide="1"]');
        if (s) {
            s.addEventListener('load', () => tryCreateIcons(), { once: true });
        }
        // Extra safety retry for cases where the script is already loaded but window.lucide is set later
        setTimeout(() => tryCreateIcons(), 600);
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

    if (statusBarReconnectTimer) {
        clearTimeout(statusBarReconnectTimer);
        statusBarReconnectTimer = null;
    }
    
    statusBarEventSource = new EventSource('/api/download-stream');
    
    statusBarEventSource.onopen = function() {
        statusBarReconnectAttempt = 0;
        ffStatusLog('[STATUS] SSE opened');
    };
    
    statusBarEventSource.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'state' || data.type === 'update') {
                statusBarState = data.data;
                updateStatusBarDisplay(statusBarState);
            }
        } catch (error) {
            if (FF_STATUS_DEBUG) console.error('Error parsing status bar SSE data:', error);
        }
    };
    
    statusBarEventSource.onerror = function(error) {
        if (FF_STATUS_DEBUG) console.error('Status bar SSE connection error:', error);

        // Exponential backoff, single timer
        if (statusBarReconnectTimer) return;
        statusBarReconnectAttempt++;
        const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(5, statusBarReconnectAttempt)));
        statusBarReconnectTimer = setTimeout(() => {
            statusBarReconnectTimer = null;
            connectToStatusStream();
        }, delay);
    };
}

function updateStatusBarDisplay(state) {
    const statusBar = document.getElementById('statusBar');
    if (!statusBar || !state) return;
    
    const downloadSpeed = state.totalSpeeds?.download || '0 B/s';
    const uploadSpeed = state.totalSpeeds?.upload || '0 B/s';
    
    // Only show upload speed if it's greater than 0
    const showUpload = uploadSpeed !== '0 B/s' && uploadSpeed !== '0.0 B/s';

    const activeEl = document.getElementById('ffStatusActive');
    const maxEl = document.getElementById('ffStatusMax');
    const queuedEl = document.getElementById('ffStatusQueued');
    const completedEl = document.getElementById('ffStatusCompleted');
    const downEl = document.getElementById('ffStatusDown');
    const upEl = document.getElementById('ffStatusUp');
    const upWrap = document.getElementById('ffStatusUpWrap');

    if (activeEl) activeEl.textContent = String(state.stats?.active ?? 0);
    if (maxEl) maxEl.textContent = String(state.maxConcurrent ?? state.maxConcurrentDownloads ?? 3);
    if (queuedEl) queuedEl.textContent = String(state.stats?.queued ?? 0);
    if (completedEl) completedEl.textContent = String(state.stats?.completed ?? 0);
    if (downEl) downEl.textContent = String(downloadSpeed);
    if (upEl) upEl.textContent = String(uploadSpeed);
    if (upWrap) upWrap.style.display = showUpload ? '' : 'none';
}

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (statusBarEventSource) {
        statusBarEventSource.close();
    }
});