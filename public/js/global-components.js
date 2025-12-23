// Global header and footer component loader
class GlobalComponents {
    static async loadHeader() {
        const userDisplay = `<div class="user-info">
            <span class="user-name">Free</span>
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

    static async loadFooter() {
        const footerHtml = `
            <div class="global-footer">
                <div class="footer-content">
                    <p>&copy; 2025 FireFetch - High-Speed Video Downloader</p>
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
    }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    GlobalComponents.init();
});