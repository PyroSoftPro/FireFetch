// Global header and footer component loader
class GlobalComponents {
    static async loadHeader() {
        const userDisplay = `<div class="user-info">
            <span id="app-version-badge" class="user-name">v…</span>
        </div>`;
        
        const headerHtml = `
            <div class="header-nav">
                <div class="logo">
                    <div class="logo-icon">🔥</div>
                    <h1 class="fire-accent">FireFetch</h1>
                </div>
                <div class="nav-links">
                    <a href="index.html">Home</a>
                    <a href="search.html">Search</a>
                    <a href="downloads.html">Queue</a>
                    <a href="browse.html">Videos</a>
                    <a href="files.html">Files</a>
                    <a href="config.html">Settings</a>
                </div>
                ${userDisplay}
            </div>
        `;
        
        const headerContainer = document.getElementById('global-header');
        if (headerContainer) {
            headerContainer.innerHTML = headerHtml;
            this.setActiveNavItem();
        }
    }

    static async loadAppVersionBadge() {
        const badge = document.getElementById('app-version-badge');
        if (!badge) return;

        try {
            const response = await fetch('/api/app-version', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            const version = String(data?.version || '').trim();
            badge.textContent = version ? `v${version}` : 'v?';
        } catch {
            badge.textContent = 'v?';
        }
    }

    static async loadFooter() {
        const footerHtml = `
            <div class="global-footer">
                <div class="footer-content footer-content--split">
                    <div id="version-footer-slot" class="version-footer-slot"></div>
                    <div class="footer-right">
                        <p>&copy; 2025 FireFetch - High-Speed Video Downloader</p>
                    </div>
                </div>
            </div>
        `;
        
        const footerContainer = document.getElementById('global-footer');
        if (footerContainer) {
            footerContainer.innerHTML = footerHtml;
        }
    }

    static setActiveNavItem() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const navLinks = document.querySelectorAll('.nav-links a');
        
        navLinks.forEach(link => {
            const href = link.getAttribute('href');
            if (href === currentPage || (currentPage === '' && href === 'index.html')) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
    }

    static async init() {
        await this.loadHeader();
        await this.loadFooter();
        await this.loadAppVersionBadge();
    }
}

// Version banner (checks official repo manifest on every page load; only renders on Home page)
class VersionBanner {
    static isHomePage() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        return currentPage === 'index.html' || currentPage === '';
    }

    static parseVersion(version) {
        if (typeof version !== 'string') return null;
        const parts = version.trim().split('.').map(p => Number.parseInt(p, 10));
        if (parts.some(n => Number.isNaN(n))) return null;
        return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    }

    static compareVersions(a, b) {
        // returns -1 if a < b, 0 if equal, 1 if a > b
        for (let i = 0; i < 3; i++) {
            const av = a[i] || 0;
            const bv = b[i] || 0;
            if (av < bv) return -1;
            if (av > bv) return 1;
        }
        return 0;
    }

    static async fetchJson(url) {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        return await response.json();
    }

    static renderError(message) {
        if (!this.isHomePage()) return;

        const slot = this.getOrCreateSlot();
        if (!slot) return;
        slot.innerHTML = '';

        const msg = document.createElement('span');
        msg.className = 'version-footer-message version-footer-message--error';
        msg.textContent = message;
        slot.appendChild(msg);
    }

    static getOrCreateSlot() {
        // Slot is provided by the global footer (left side).
        return document.getElementById('version-footer-slot');
    }

    static render(banner, { currentVersion, latestVersion, status }) {
        if (!this.isHomePage()) return;

        const slot = this.getOrCreateSlot();
        if (!slot) return;
        slot.innerHTML = '';

        const msg = document.createElement('span');
        msg.className = `version-footer-message version-footer-message--${status}`;
        msg.textContent = banner?.text || '';
        slot.appendChild(msg);

        if (banner?.updateUrl && status === 'outOfDate') {
            const sep = document.createElement('span');
            sep.className = 'version-footer-sep';
            sep.textContent = ' • ';
            slot.appendChild(sep);

            const a = document.createElement('a');
            a.className = 'version-footer-link';
            a.href = banner.updateUrl;
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = 'Update';
            slot.appendChild(a);
        }
    }

    static async init() {
        try {
            let manifest;
            try {
                manifest = await this.fetchJson('/api/version-manifest');
            } catch (err) {
                this.renderError("Oops! We couldn't reach PyroSoft!");
                return;
            }

            let appInfo = null;
            try {
                appInfo = await this.fetchJson('/api/app-version');
            } catch (err) {
                // If version fetch fails, we can still show the banner using "unknown" current version.
                appInfo = { version: 'unknown' };
            }

            const currentVersion = String(appInfo?.version || '').trim();
            const latestVersion = String(manifest?.app?.latest || '').trim();

            const parsedCurrent = this.parseVersion(currentVersion);
            const parsedLatest = this.parseVersion(latestVersion);

            let status = 'unknown';
            if (parsedCurrent && parsedLatest) {
                const cmp = this.compareVersions(parsedCurrent, parsedLatest);
                status = cmp >= 0 ? 'upToDate' : 'outOfDate';
            }

            const messages = manifest?.messages || {};
            const updateUrl = String(manifest?.links?.updateUrl || '').trim();

            const template =
                (status === 'upToDate' ? messages.upToDate :
                status === 'outOfDate' ? messages.outOfDate :
                messages.unknown) || 'FireFetch v{current}.';

            const text = String(template)
                .replaceAll('{current}', currentVersion || 'unknown')
                .replaceAll('{latest}', latestVersion || 'unknown');

            this.render({ text, updateUrl }, { currentVersion: currentVersion || 'unknown', latestVersion: latestVersion || 'unknown', status });
        } catch (err) {
            this.renderError("Oops! We couldn't reach PyroSoft!");
        }
    }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    await GlobalComponents.init();
    await VersionBanner.init();
});