const { ipcRenderer, shell } = require('electron');

/**
 * Global State
 */
let tabs = [];
let activeTabId = null;
let tabCounter = 0;
let tabManager = null;
let history = JSON.parse(localStorage.getItem('browserHistory') || '[]');
let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');
let recentlyClosedTabs = []; // Track recently closed tabs for Cmd/Ctrl+Shift+T

// Settings
const settings = {
    homePage: localStorage.getItem('homePage') || 'https://google.com',
    searchEngine: localStorage.getItem('searchEngine') || 'https://google.com/?q=',
    theme: localStorage.getItem('theme') || 'light',
    showBookmarksBar: localStorage.getItem('showBookmarksBar') !== 'false'
};

/**
 * Tab Manager Class
 */
class TabManager {
    createTab(url = settings.homePage) {
        tabCounter++;
        const tabId = tabCounter;

        // First, deactivate ALL existing webviews and tabs
        tabs.forEach(t => {
            t.webview.classList.remove('active');
            t.tabElement.classList.remove('active');
        });

        // Create Webview
        const webview = document.createElement('webview');
        webview.src = url;
        webview.setAttribute('allowpopups', '');
        webview.classList.add('active');

        // Webview Event Listeners
        webview.addEventListener('did-start-loading', () => {
            if (activeTabId === tabId) {
                document.getElementById('url-input').value = "Loading...";
                document.getElementById('loading-bar').classList.add('loading');
                document.getElementById('loading-bar').classList.remove('complete');
            }
            // Update tab to show loading spinner
            const favicon = document.querySelector(`#tab-${tabId} .tab-favicon`);
            if (favicon) {
                favicon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            }
        });

        webview.addEventListener('did-finish-load', () => {
            const title = webview.getTitle() || 'New Tab';
            const tabTitleEl = document.querySelector(`#tab-${tabId} .tab-title`);
            if (tabTitleEl) tabTitleEl.innerText = title;

            if (activeTabId === tabId) {
                document.getElementById('url-input').value = webview.getURL();
                document.getElementById('loading-bar').classList.remove('loading');
                document.getElementById('loading-bar').classList.add('complete');
                setTimeout(() => {
                    document.getElementById('loading-bar').classList.remove('complete');
                    document.getElementById('loading-bar').style.width = '0';
                }, 300);

                this.updateSecurityIcon(webview.getURL());
                this.updateBookmarkButton(webview.getURL());
            }

            // Update favicon
            const favicon = document.querySelector(`#tab-${tabId} .tab-favicon`);
            if (favicon) {
                favicon.innerHTML = '<i class="fas fa-globe"></i>';
            }

            // Add to history
            this.addToHistory(webview.getURL(), title);
        });

        webview.addEventListener('did-fail-load', () => {
            document.getElementById('loading-bar').classList.remove('loading');
        });

        webview.addEventListener('page-title-updated', (e) => {
            const tabTitleEl = document.querySelector(`#tab-${tabId} .tab-title`);
            if (tabTitleEl) tabTitleEl.innerText = e.title;
        });

        webview.addEventListener('new-window', (e) => {
            this.createTab(e.url);
        });

        document.getElementById('webview-container').appendChild(webview);

        // Create Tab UI
        const tabElement = document.createElement('div');
        tabElement.className = 'tab active';
        tabElement.id = `tab-${tabId}`;
        tabElement.innerHTML = `
            <span class="tab-favicon"><i class="fas fa-globe"></i></span>
            <span class="tab-title">New Tab</span>
            <span class="tab-close"><i class="fas fa-times"></i></span>
        `;

        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.switchTab(tabId);
            }
        });

        const closeBtn = tabElement.querySelector('.tab-close');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });

        document.getElementById('tabs-container').appendChild(tabElement);

        // Store tab data
        const tabData = { id: tabId, webview, tabElement };
        tabs.push(tabData);

        // Set as active
        activeTabId = tabId;

        // Update URL bar
        try {
            document.getElementById('url-input').value = webview.getURL() || url;
        } catch (e) {
            document.getElementById('url-input').value = url;
        }

        return tabId;
    }

    switchTab(tabId) {
        if (activeTabId === tabId) return;

        activeTabId = tabId;

        tabs.forEach(t => {
            if (t.id === tabId) {
                t.webview.classList.add('active');
                t.tabElement.classList.add('active');
                try {
                    const url = t.webview.getURL() || '';
                    document.getElementById('url-input').value = url;
                    this.updateSecurityIcon(url);
                    this.updateBookmarkButton(url);
                } catch (e) {
                    document.getElementById('url-input').value = '';
                }
            } else {
                t.webview.classList.remove('active');
                t.tabElement.classList.remove('active');
            }
        });
    }

    closeTab(tabId) {
        const index = tabs.findIndex(t => t.id === tabId);
        if (index === -1) return;

        const tabToDelete = tabs[index];
        
        // Track the closed tab URL for Cmd/Ctrl+Shift+T
        try {
            const closedUrl = tabToDelete.webview.getURL();
            if (closedUrl && closedUrl !== 'about:blank') {
                recentlyClosedTabs.push({ url: closedUrl, timestamp: Date.now() });
                // Keep only last 10 closed tabs
                if (recentlyClosedTabs.length > 10) {
                    recentlyClosedTabs.shift();
                }
            }
        } catch (e) {
            // Ignore errors when getting URL
        }

        tabToDelete.webview.remove();
        tabToDelete.tabElement.remove();
        tabs.splice(index, 1);

        if (activeTabId === tabId && tabs.length > 0) {
            // Switch to the tab before or after
            const newIndex = Math.min(index, tabs.length - 1);
            this.switchTab(tabs[newIndex].id);
        } else if (tabs.length === 0) {
            this.createTab();
        }
    }

    getActiveWebview() {
        return tabs.find(t => t.id === activeTabId)?.webview;
    }

    updateSecurityIcon(url) {
        const icon = document.getElementById('security-icon');
        if (url.startsWith('https://')) {
            icon.className = 'fas fa-lock secure';
        } else if (url.startsWith('http://')) {
            icon.className = 'fas fa-unlock';
        } else {
            icon.className = 'fas fa-info-circle';
        }
    }

    updateBookmarkButton(url) {
        const btn = document.getElementById('bookmark-btn');
        const isBookmarked = bookmarks.some(b => b.url === url);
        if (isBookmarked) {
            btn.classList.add('bookmarked');
            btn.innerHTML = '<i class="fas fa-star"></i>';
        } else {
            btn.classList.remove('bookmarked');
            btn.innerHTML = '<i class="far fa-star"></i>';
        }
    }

    addToHistory(url, title) {
        if (!url || url === 'about:blank') return;

        const entry = {
            url,
            title: title || url,
            timestamp: Date.now()
        };

        // Remove duplicate if exists
        history = history.filter(h => h.url !== url);
        history.unshift(entry);

        // Keep only last 100 entries
        if (history.length > 100) history = history.slice(0, 100);

        localStorage.setItem('browserHistory', JSON.stringify(history));
    }
}

/**
 * Initialize when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    tabManager = new TabManager();
    window.tabManager = tabManager;

    // Apply theme
    applyTheme(settings.theme);

    // Apply bookmarks bar visibility
    document.getElementById('bookmarks-bar').style.display = settings.showBookmarksBar ? 'flex' : 'none';

    // Create first tab
    tabManager.createTab();

    // Navigation Controls
    document.getElementById('back-btn').addEventListener('click', () => {
        const wv = tabManager.getActiveWebview();
        if (wv && wv.canGoBack()) wv.goBack();
    });

    document.getElementById('forward-btn').addEventListener('click', () => {
        const wv = tabManager.getActiveWebview();
        if (wv && wv.canGoForward()) wv.goForward();
    });

    document.getElementById('refresh-btn').addEventListener('click', () => {
        tabManager.getActiveWebview()?.reload();
    });

    document.getElementById('home-btn').addEventListener('click', () => {
        tabManager.getActiveWebview()?.loadURL(settings.homePage);
    });

    document.getElementById('new-tab-btn').addEventListener('click', () => {
        tabManager.createTab(settings.homePage);
    });

    // URL Bar
    document.getElementById('url-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            let input = e.target.value.trim();
            const wv = tabManager.getActiveWebview();
            if (!wv) return;

            const isUrl = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(input) ||
                          input.startsWith('localhost') ||
                          /^(\d{1,3}\.){3}\d{1,3}/.test(input);

            if (isUrl) {
                if (!input.startsWith('http')) input = 'https://' + input;
                wv.loadURL(input);
            } else {
                wv.loadURL(settings.searchEngine + encodeURIComponent(input));
            }
        }
    });

    // URL input focus - select all text
    document.getElementById('url-input').addEventListener('focus', (e) => {
        e.target.select();
    });

    // Bookmark current page
    document.getElementById('bookmark-btn').addEventListener('click', () => {
        const wv = tabManager.getActiveWebview();
        if (!wv) return;

        const url = wv.getURL();
        const title = wv.getTitle();

        const existingIndex = bookmarks.findIndex(b => b.url === url);
        if (existingIndex >= 0) {
            bookmarks.splice(existingIndex, 1);
        } else {
            bookmarks.push({ url, title, timestamp: Date.now() });
        }

        localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
        tabManager.updateBookmarkButton(url);
        renderBookmarks();
    });

    // Bookmarks bar items
    document.querySelectorAll('.bookmark-item').forEach(item => {
        item.addEventListener('click', () => {
            const url = item.dataset.url;
            tabManager.getActiveWebview()?.loadURL(url);
        });
    });

    // Panel toggles
    setupPanelToggle('downloads-btn', 'downloads-panel', 'close-downloads');
    setupPanelToggle('history-btn', 'history-panel', 'close-history');
    setupPanelToggle('bookmarks-btn', 'bookmarks-panel', 'close-bookmarks');

    // Settings
    document.getElementById('settings-btn').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('hidden');
        document.getElementById('pref-homepage').value = settings.homePage;
        document.getElementById('pref-search').value = settings.searchEngine;
        document.getElementById('pref-theme').value = settings.theme;
        document.getElementById('pref-bookmarks-bar').checked = settings.showBookmarksBar;
    });

    document.getElementById('close-settings').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.add('hidden');
    });

    document.getElementById('save-settings-btn').addEventListener('click', () => {
        settings.homePage = document.getElementById('pref-homepage').value;
        settings.searchEngine = document.getElementById('pref-search').value;
        settings.theme = document.getElementById('pref-theme').value;
        settings.showBookmarksBar = document.getElementById('pref-bookmarks-bar').checked;

        localStorage.setItem('homePage', settings.homePage);
        localStorage.setItem('searchEngine', settings.searchEngine);
        localStorage.setItem('theme', settings.theme);
        localStorage.setItem('showBookmarksBar', settings.showBookmarksBar);

        applyTheme(settings.theme);
        document.getElementById('bookmarks-bar').style.display = settings.showBookmarksBar ? 'flex' : 'none';

        document.getElementById('settings-modal').classList.add('hidden');
    });

    // Clear history
    document.getElementById('clear-history-btn').addEventListener('click', () => {
        history = [];
        localStorage.setItem('browserHistory', '[]');
        renderHistory();
    });

    // Clear all data (settings, history, bookmarks)
    document.getElementById('clear-data-btn').addEventListener('click', () => {
        if (confirm('Are you sure you want to clear ALL data? This will reset your settings to defaults and remove all history and bookmarks. This cannot be undone!')) {
            localStorage.clear();
            alert('All data has been cleared. The browser will now restart.');
            location.reload();
        }
    });

    // Clear service worker data
    document.getElementById('clear-service-workers-btn')?.addEventListener('click', async () => {
        const confirmed = confirm('This will clear all service worker data, IndexedDB databases, and cache storage. This may fix issues with websites that use service workers. Continue?');
        if (confirmed) {
            ipcRenderer.send('clear-service-worker-data');
        }
    });

    // Listen for service worker data cleared response
    ipcRenderer.on('service-worker-data-cleared', (event, data) => {
        if (data.success) {
            alert('Service worker data has been cleared successfully. Some websites may need to be reloaded.');
        } else {
            alert('Failed to clear service worker data: ' + (data.error || 'Unknown error'));
        }
    });

    // Listen for service worker info response
    ipcRenderer.on('service-worker-info', (event, data) => {
        const swCount = document.getElementById('service-worker-count');
        if (swCount) {
            swCount.textContent = data.count > 0 ? `${data.count} active` : 'None';
        }
    });

    // Window controls (for frameless window)
    document.getElementById('minimize-btn')?.addEventListener('click', () => {
        ipcRenderer.send('window-minimize');
    });

    document.getElementById('maximize-btn')?.addEventListener('click', () => {
        ipcRenderer.send('window-maximize');
    });

    document.getElementById('close-window-btn')?.addEventListener('click', () => {
        ipcRenderer.send('window-close');
    });

    // Find in page (Ctrl+F)
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
            e.preventDefault();
            document.getElementById('find-bar').classList.remove('hidden');
            document.getElementById('find-input').focus();
        }
    });

    // ========================================
    // Keyboard Shortcuts
    // ========================================
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const cmdOrCtrl = e.metaKey || e.ctrlKey;

        // Cmd/Ctrl + N - New Window
        if (cmdOrCtrl && e.key === 'n') {
            e.preventDefault();
            ipcRenderer.send('create-new-window');
        }

        // Cmd/Ctrl + T - New Tab
        if (cmdOrCtrl && e.key === 't') {
            e.preventDefault();
            tabManager.createTab(settings.homePage);
        }

        // Cmd/Ctrl + W - Close Tab
        if (cmdOrCtrl && e.key === 'w') {
            e.preventDefault();
            if (activeTabId !== null) {
                tabManager.closeTab(activeTabId);
            }
        }

        // Cmd/Ctrl + Shift + T - Reopen Last Closed Tab
        if (cmdOrCtrl && e.shiftKey && e.key === 't') {
            e.preventDefault();
            if (recentlyClosedTabs.length > 0) {
                const lastClosed = recentlyClosedTabs.pop();
                tabManager.createTab(lastClosed.url);
            }
        }

        // Cmd/Ctrl + R - Refresh Page
        if (cmdOrCtrl && e.key === 'r' && !e.shiftKey) {
            e.preventDefault();
            tabManager.getActiveWebview()?.reload();
        }

        // Cmd/Ctrl + Shift + R - Hard Refresh
        if (cmdOrCtrl && e.shiftKey && e.key === 'r') {
            e.preventDefault();
            tabManager.getActiveWebview()?.reloadIgnoringCache();
        }

        // Cmd/Ctrl + L - Focus URL Bar
        if (cmdOrCtrl && e.key === 'l') {
            e.preventDefault();
            const urlInput = document.getElementById('url-input');
            urlInput.focus();
            urlInput.select();
        }

        // Cmd/Ctrl + D - Bookmark Current Page
        if (cmdOrCtrl && e.key === 'd') {
            e.preventDefault();
            const wv = tabManager.getActiveWebview();
            if (wv) {
                const url = wv.getURL();
                const title = wv.getTitle();

                const existingIndex = bookmarks.findIndex(b => b.url === url);
                if (existingIndex >= 0) {
                    bookmarks.splice(existingIndex, 1);
                } else {
                    bookmarks.push({ url, title, timestamp: Date.now() });
                }

                localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
                tabManager.updateBookmarkButton(url);
                renderBookmarks();
            }
        }

        // Cmd/Ctrl + Tab - Next Tab
        if (cmdOrCtrl && !e.shiftKey && e.key === 'Tab') {
            e.preventDefault();
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            const nextIndex = (currentIndex + 1) % tabs.length;
            if (tabs[nextIndex]) {
                tabManager.switchTab(tabs[nextIndex].id);
            }
        }

        // Cmd/Ctrl + Shift + Tab - Previous Tab
        if (cmdOrCtrl && e.shiftKey && e.key === 'Tab') {
            e.preventDefault();
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
            if (tabs[prevIndex]) {
                tabManager.switchTab(tabs[prevIndex].id);
            }
        }

        // Cmd/Ctrl + 1-9 - Switch to Tab 1-9
        if (cmdOrCtrl && e.key >= '1' && e.key <= '9') {
            e.preventDefault();
            const tabIndex = parseInt(e.key) - 1;
            if (tabs[tabIndex]) {
                tabManager.switchTab(tabs[tabIndex].id);
            }
        }

        // Cmd/Ctrl + 0 - Switch to Last Tab (or switch to tab 10)
        if (cmdOrCtrl && e.key === '0') {
            e.preventDefault();
            const lastTab = tabs[tabs.length - 1];
            if (lastTab) {
                tabManager.switchTab(lastTab.id);
            }
        }

        // Escape - Stop Loading or Close Find Bar
        if (e.key === 'Escape') {
            const findBar = document.getElementById('find-bar');
            if (!findBar.classList.contains('hidden')) {
                findBar.classList.add('hidden');
                tabManager.getActiveWebview()?.stopFindInPage('clearSelection');
            } else {
                const wv = tabManager.getActiveWebview();
                if (wv) {
                    wv.stop();
                }
            }
        }

        // Cmd/Ctrl + + - Zoom In
        if (cmdOrCtrl && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            const wv = tabManager.getActiveWebview();
            if (wv) {
                const currentZoom = wv.getZoomFactor();
                wv.setZoomFactor(Math.min(currentZoom * 1.2, 5));
            }
        }

        // Cmd/Ctrl + - - Zoom Out
        if (cmdOrCtrl && e.key === '-') {
            e.preventDefault();
            const wv = tabManager.getActiveWebview();
            if (wv) {
                const currentZoom = wv.getZoomFactor();
                wv.setZoomFactor(Math.max(currentZoom / 1.2, 0.25));
            }
        }

        // Cmd/Ctrl + 0 - Reset Zoom
        if (cmdOrCtrl && e.key === '0') {
            const wv = tabManager.getActiveWebview();
            if (wv) {
                wv.setZoomFactor(1);
            }
        }
    });

    document.getElementById('find-input').addEventListener('input', (e) => {
        const wv = tabManager.getActiveWebview();
        if (wv && e.target.value) {
            wv.findInPage(e.target.value);
        }
    });

    document.getElementById('find-next').addEventListener('click', () => {
        const wv = tabManager.getActiveWebview();
        const query = document.getElementById('find-input').value;
        if (wv && query) wv.findInPage(query, { forward: true, findNext: true });
    });

    document.getElementById('find-prev').addEventListener('click', () => {
        const wv = tabManager.getActiveWebview();
        const query = document.getElementById('find-input').value;
        if (wv && query) wv.findInPage(query, { forward: false, findNext: true });
    });

    document.getElementById('find-close').addEventListener('click', () => {
        document.getElementById('find-bar').classList.add('hidden');
        tabManager.getActiveWebview()?.stopFindInPage('clearSelection');
    });

    // Screen capture overlay
    const captureOverlay = document.getElementById('capture-overlay');
    const captureTitle = document.getElementById('capture-overlay-title');
    const captureSubtitle = document.getElementById('capture-overlay-subtitle');
    const captureImage = document.getElementById('capture-overlay-image');
    const captureClose = document.getElementById('capture-overlay-close');
    let captureHideTimer = null;

    function hideCaptureOverlay() {
        captureOverlay?.classList.add('hidden');
        if (captureHideTimer) {
            clearTimeout(captureHideTimer);
            captureHideTimer = null;
        }
    }

    captureClose?.addEventListener('click', hideCaptureOverlay);

    ipcRenderer.on('system-capture-detected', (_event, payload) => {
        if (!captureOverlay) return;
        const isRecording = payload?.kind === 'recording';
        captureTitle.textContent = isRecording ? 'Screen recording detected' : 'Screenshot detected';
        captureSubtitle.textContent = payload?.filePath ? `Saved to: ${payload.filePath}` : 'The system captured the screen.';
        captureImage.src = isRecording ? 'alert-image.svg' : 'alert-image.svg';
        captureOverlay.classList.remove('hidden');

        if (captureHideTimer) clearTimeout(captureHideTimer);
        captureHideTimer = setTimeout(() => captureOverlay.classList.add('hidden'), 5500);
    });

    // Download listeners
    const downloadList = document.getElementById('download-list');
    const downloadsPanel = document.getElementById('downloads-panel');

    ipcRenderer.on('download-start', (event, data) => {
        const item = document.createElement('div');
        item.className = 'download-item';
        item.id = `dl-${data.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`;
        item.innerHTML = `
            <div class="download-item-icon"><i class="fas fa-file-download"></i></div>
            <div class="download-item-info">
                <div class="download-item-name">${data.fileName}</div>
                <div class="download-item-status">Starting...</div>
                <div class="download-progress"><div class="download-progress-bar" style="width: 0%"></div></div>
            </div>
        `;
        downloadList.prepend(item);
        downloadsPanel.classList.remove('hidden');
    });

    ipcRenderer.on('download-progress', (event, data) => {
        const item = document.getElementById(`dl-${data.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`);
        if (item) {
            const percent = Math.round(data.progress * 100);
            item.querySelector('.download-item-status').textContent = `${percent}% downloaded`;
            item.querySelector('.download-progress-bar').style.width = `${percent}%`;
        }
    });

    ipcRenderer.on('download-complete', (event, data) => {
        const item = document.getElementById(`dl-${data.fileName.replace(/[^a-zA-Z0-9]/g, '_')}`);
        if (item) {
            item.querySelector('.download-item-status').innerHTML = '<span style="color: var(--success-color)">Complete</span>';
            item.querySelector('.download-progress').remove();
            item.style.cursor = 'pointer';
            item.addEventListener('click', () => shell.showItemInFolder(data.path));
        }
    });

    // Render initial data
    renderHistory();
    renderBookmarks();
});

/**
 * Helper Functions
 */
function setupPanelToggle(btnId, panelId, closeId) {
    const btn = document.getElementById(btnId);
    const panel = document.getElementById(panelId);
    const closeBtn = document.getElementById(closeId);

    btn.addEventListener('click', () => {
        // Close other panels
        document.querySelectorAll('.panel').forEach(p => {
            if (p.id !== panelId) p.classList.add('hidden');
        });
        panel.classList.toggle('hidden');

        // Render content when opening
        if (!panel.classList.contains('hidden')) {
            if (panelId === 'history-panel') renderHistory();
            if (panelId === 'bookmarks-panel') renderBookmarks();
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.add('hidden');
    });
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
    }
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (history.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No history yet</p></div>';
        return;
    }

    list.innerHTML = history.slice(0, 50).map(item => `
        <div class="history-item" data-url="${item.url}">
            <div class="history-item-icon"><i class="fas fa-globe"></i></div>
            <div class="history-item-info">
                <div class="history-item-title">${item.title || 'Untitled'}</div>
                <div class="history-item-url">${item.url}</div>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            tabManager.getActiveWebview()?.loadURL(item.dataset.url);
            document.getElementById('history-panel').classList.add('hidden');
        });
    });
}

function renderBookmarks() {
    const list = document.getElementById('bookmarks-list');
    if (bookmarks.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-bookmark"></i><p>No bookmarks yet</p></div>';
        return;
    }

    list.innerHTML = bookmarks.map(item => `
        <div class="bookmark-list-item" data-url="${item.url}">
            <div class="history-item-icon"><i class="fas fa-bookmark"></i></div>
            <div class="history-item-info">
                <div class="history-item-title">${item.title || 'Untitled'}</div>
                <div class="history-item-url">${item.url}</div>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('.bookmark-list-item').forEach(item => {
        item.addEventListener('click', () => {
            tabManager.getActiveWebview()?.loadURL(item.dataset.url);
            document.getElementById('bookmarks-panel').classList.add('hidden');
        });
    });
}
