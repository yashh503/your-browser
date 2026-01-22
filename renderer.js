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
    homePage: localStorage.getItem('homePage') || `file://${__dirname}/homepage.html`,
    searchEngine: localStorage.getItem('searchEngine') || 'https://www.google.com/search?q=',
    theme: localStorage.getItem('theme') || 'dark',
    colorTheme: localStorage.getItem('colorTheme') || 'purple',
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

        // Create Webview with proper browser-like configuration
        const webview = document.createElement('webview');
        webview.src = url;
        webview.setAttribute('allowpopups', '');
        webview.setAttribute('plugins', '');
        webview.setAttribute('webpreferences', 'contextIsolation=no, nodeIntegration=no, javascript=yes, webSecurity=yes, allowRunningInsecureContent=no');
        // Use Chrome User-Agent for website compatibility
        webview.setAttribute('useragent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        webview.classList.add('active');

        // Webview Event Listeners
        webview.addEventListener('did-start-loading', () => {
            const tabElement = document.getElementById(`tab-${tabId}`);
            if (activeTabId === tabId) {
                document.getElementById('loading-bar').classList.add('loading');
                document.getElementById('loading-bar').classList.remove('complete');
            }
            // Add loading class for subtle visual feedback
            if (tabElement) {
                tabElement.classList.add('loading');
            }
        });

        webview.addEventListener('did-finish-load', () => {
            const title = webview.getTitle() || 'New Tab';
            const tabElement = document.getElementById(`tab-${tabId}`);
            const tabTitleEl = document.querySelector(`#tab-${tabId} .tab-title`);
            if (tabTitleEl) tabTitleEl.innerText = title;

            // Remove loading state immediately
            if (tabElement) {
                tabElement.classList.remove('loading');
            }

            if (activeTabId === tabId) {
                const currentUrl = webview.getURL();
                const urlInput = document.getElementById('url-input');

                // Show placeholder instead of URL when on homepage
                const isCustomHomepage = currentUrl.includes('homepage.html');
                const normalizeUrl = (url) => url.replace(/^https?:\/\//, '').replace(/^file:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
                const isHomepage = isCustomHomepage || normalizeUrl(currentUrl) === normalizeUrl(settings.homePage);

                urlInput.value = isHomepage ? '' : currentUrl;

                // Fast loading bar completion
                const loadingBar = document.getElementById('loading-bar');
                loadingBar.classList.remove('loading');
                loadingBar.classList.add('complete');
                setTimeout(() => {
                    loadingBar.classList.remove('complete');
                    loadingBar.style.width = '0';
                }, 150);

                this.updateSecurityIcon(currentUrl);
                this.updateBookmarkButton(currentUrl);
                this.updateNavigationButtons(webview);
            }

            // Update favicon
            const favicon = document.querySelector(`#tab-${tabId} .tab-favicon`);
            if (favicon) {
                favicon.innerHTML = '<span class="tab-favicon"><img src="icon.svg" alt="Capture alert"/></span>';
            }

            // Add to history
            this.addToHistory(webview.getURL(), title);

            // Inject ad blocker content script
            this.injectAdBlocker(webview, tabId);
        });

        // Also inject on dom-ready for faster blocking
        webview.addEventListener('dom-ready', () => {
            this.injectAdBlocker(webview, tabId);
        });

        webview.addEventListener('did-fail-load', (e) => {
            const tabElement = document.getElementById(`tab-${tabId}`);
            document.getElementById('loading-bar').classList.remove('loading');
            document.getElementById('loading-bar').style.width = '0';

            // Remove loading state
            if (tabElement) {
                tabElement.classList.remove('loading');
            }

            // Only show error for main frame failures, not subframes
            if (e.isMainFrame && e.errorCode !== -3) { // -3 is aborted, ignore it
                console.log(`Page failed to load: ${e.errorDescription} (${e.errorCode})`);
                const tabTitleEl = document.querySelector(`#tab-${tabId} .tab-title`);
                if (tabTitleEl) {
                    tabTitleEl.innerText = 'Failed to load';
                }
            }
        });

        webview.addEventListener('page-title-updated', (e) => {
            const tabTitleEl = document.querySelector(`#tab-${tabId} .tab-title`);
            if (tabTitleEl) tabTitleEl.innerText = e.title;
        });

        document.getElementById('webview-container').appendChild(webview);

        // Setup webview listeners for homepage communication
        if (window.setupWebviewListeners) {
            window.setupWebviewListeners(webview);
        }

        // Create Tab UI
        const tabElement = document.createElement('div');
        tabElement.className = 'tab active';
        tabElement.id = `tab-${tabId}`;
        tabElement.innerHTML = `
            <span class="tab-favicon"><img
        src="icon.svg"
        alt="Capture alert"
      /></span>
            <span class="tab-title">Yarvix Browser</span>
            <span class="tab-close" title="Close Tab"><i class="fas fa-xmark"></i></span>
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

        // Update URL bar and focus it for new tabs
        const urlInput = document.getElementById('url-input');

        // Check if loading homepage - show empty URL bar for homepage
        const isHomepage = url.includes('homepage.html') || url === settings.homePage;
        try {
            urlInput.value = isHomepage ? '' : (webview.getURL() || url);
        } catch (e) {
            urlInput.value = isHomepage ? '' : url;
        }

        // Focus the URL input and select all text for immediate typing
        // Use setTimeout to ensure the DOM is ready and webview doesn't steal focus
        setTimeout(() => {
            urlInput.focus();
            urlInput.select();
        }, 100);

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
                    const urlInput = document.getElementById('url-input');

                    // Show placeholder instead of URL when on homepage
                    // Check if on custom homepage or normalized homepage match
                    const isCustomHomepage = url.includes('homepage.html');
                    const normalizeUrl = (u) => u.replace(/^https?:\/\//, '').replace(/^file:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
                    const isHomepage = isCustomHomepage || normalizeUrl(url) === normalizeUrl(settings.homePage);

                    urlInput.value = isHomepage ? '' : url;
                    this.updateSecurityIcon(url);
                    this.updateBookmarkButton(url);
                    this.updateNavigationButtons(t.webview);
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
            if (closedUrl && closedUrl !== 'about:blank' && !closedUrl.includes('homepage.html')) {            
                recentlyClosedTabs.push({ url: closedUrl, timestamp: Date.now() });
                // Keep only last 10 closed tabs
                if (recentlyClosedTabs.length > 10) {
                    recentlyClosedTabs.shift();
                }
            }
        } catch (e) {
             ipcRenderer.send("log", `${e} "e"`);
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
            ipcRenderer.send('close-app')
            // this.createTab();
        }
    }

    getActiveWebview() {
        return tabs.find(t => t.id === activeTabId)?.webview;
    }

    updateSecurityIcon(url) {
        const icon = document.getElementById('security-icon');
        if (url.startsWith('https://')) {
            icon.className = 'fas fa-shield-halved secure';
        } else if (url.startsWith('http://')) {
            icon.className = 'fas fa-triangle-exclamation';
        } else {
            icon.className = 'fas fa-circle-info';
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

        // Don't store app's static pages in history (homepage and other local files)
        if (url.startsWith('file://')) {
            return;
        }

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

    updateNavigationButtons(webview) {
        const backBtn = document.getElementById('back-btn');
        const forwardBtn = document.getElementById('forward-btn');

        if (webview) {
            backBtn.disabled = !webview.canGoBack();
            forwardBtn.disabled = !webview.canGoForward();
        } else {
            backBtn.disabled = true;
            forwardBtn.disabled = true;
        }
    }

    /**
     * Update the shield count badge for a specific tab
     * @param {string} tabId - The tab ID
     * @param {number} count - Number of blocked ads
     */
    // updateTabShieldCount(tabId, count) {
    //     const tabElement = document.getElementById(`tab-${tabId}`);
    //     if (!tabElement) return;

    //     let badge = tabElement.querySelector('.tab-shield-badge');
        
    //     if (count > 0) {
    //         if (!badge) {
    //             badge = document.createElement('span');
    //             badge.className = 'tab-shield-badge';
    //             tabElement.appendChild(badge);
    //         }
    //         badge.textContent = count;
    //         badge.style.display = 'flex';
    //     } else if (badge) {
    //         badge.style.display = 'none';
    //     }

    //     // Update shield button count if this is the active tab
    //     if (tabId === activeTabId) {
    //         updateShieldButtonCount(count);
    //     }
    // }

    /**
     * Reset shield count for a tab (called on navigation)
     * @param {string} tabId - The tab ID
     */
    // resetTabShieldCount(tabId) {
    //     this.updateTabShieldCount(tabId, 0);
    // }

    /**
     * Get the current tab's shield count
     * @returns {number}
     */
    getCurrentTabShieldCount() {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) {
            const badge = tab.tabElement.querySelector('.tab-shield-badge');
            return badge ? parseInt(badge.textContent) || 0 : 0;
        }
        return 0;
    }

    /**
     * Inject ad blocker content script into webview
     * @param {HTMLElement} webview - The webview element
     * @param {number} tabId - The tab ID
     */
    injectAdBlocker(webview, tabId) {
        try {
            const currentUrl = webview.getURL();

            // Skip injection for local files and homepage
            if (!currentUrl || currentUrl.startsWith('file://') || currentUrl === 'about:blank') {
                return;
            }

            // Inject the YouTube ad blocker script
            const youtubeAdBlockScript = `
                (function() {
                    // Skip if already injected
                    if (window.__yarvixAdBlockerInjected) return;
                    window.__yarvixAdBlockerInjected = true;

                    const isYouTube = window.location.hostname.includes('youtube.com');

                    if (isYouTube) {
                        console.log('[YarvixBrowser] YouTube Ad Blocker Active');

                        // CSS to hide ad overlays ONLY (not the video player itself!)
                        const style = document.createElement('style');
                        style.textContent = \`
                            /* Hide ad overlays and banners - BUT NOT the video player */
                            .ytp-ad-overlay-container,
                            .ytp-ad-text-overlay,
                            .ytp-ad-overlay-slot,
                            .ytp-ad-overlay-image,
                            .ytp-ad-image-overlay,
                            .ytp-ad-preview-container,
                            .ytp-ad-preview-slot,
                            .ytp-ad-message-container,
                            #player-ads,
                            #masthead-ad,
                            ytd-ad-slot-renderer,
                            ytd-banner-promo-renderer,
                            ytd-video-masthead-ad-v3-renderer,
                            ytd-in-feed-ad-layout-renderer,
                            ytd-display-ad-renderer,
                            ytd-companion-slot-renderer,
                            ytd-promoted-sparkles-web-renderer,
                            ytd-promoted-video-renderer,
                            ytd-search-pyv-renderer,
                            .ytd-mealbar-promo-renderer,
                            .ytd-statement-banner-renderer,
                            #merch-shelf,
                            ytd-merch-shelf-renderer,
                            .ytp-suggested-action,
                            .ytp-suggested-action-badge,
                            .ytp-cards-teaser,
                            .iv-branding,
                            .annotation,
                            ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"],
                            yt-mealbar-promo-renderer,
                            #related ytd-promoted-sparkles-web-renderer,
                            #related ytd-display-ad-renderer,
                            ytd-search ytd-ad-slot-renderer,
                            ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
                            ytd-rich-section-renderer:has(ytd-ad-slot-renderer)
                            { display: none !important; }
                        \`;
                        document.head.appendChild(style);

                        // Track state for ad skipping
                        let adState = {
                            wasAdPlaying: false,
                            originalMuted: false,
                            originalVolume: 1,
                            skipAttempts: 0
                        };

                        // Function to check if ad is playing
                        const isAdPlaying = () => {
                            const player = document.querySelector('.html5-video-player');
                            return player && player.classList.contains('ad-showing');
                        };

                        // Function to skip/handle ads
                        const handleAd = () => {
                            const video = document.querySelector('video');
                            const player = document.querySelector('.html5-video-player');

                            if (!video || !player) return;

                            const adPlaying = isAdPlaying();

                            if (adPlaying) {
                                // Ad is playing
                                if (!adState.wasAdPlaying) {
                                    // Just started - save original state
                                    adState.wasAdPlaying = true;
                                    adState.originalMuted = video.muted;
                                    adState.originalVolume = video.volume;
                                    adState.skipAttempts = 0;
                                    console.log('[YarvixBrowser] Ad detected, attempting to skip...');
                                }

                                // Method 1: Click skip button (best method)
                                const skipBtn = document.querySelector(
                                    '.ytp-ad-skip-button, ' +
                                    '.ytp-ad-skip-button-modern, ' +
                                    '.ytp-skip-ad-button, ' +
                                    '.ytp-ad-skip-button-slot button, ' +
                                    'button[class*="skip"]'
                                );
                                if (skipBtn && skipBtn.offsetParent !== null) {
                                    skipBtn.click();
                                    console.log('[YarvixBrowser] Clicked skip button');
                                    return;
                                }

                                // Method 2: Mute and speed up the ad (let it play fast)
                                video.muted = true;
                                video.playbackRate = 16;

                                // Method 3: If video has duration, skip near end
                                // BUT don't skip to exact end to avoid "ended" state
                                adState.skipAttempts++;
                                if (adState.skipAttempts > 5 && video.duration && isFinite(video.duration) && video.duration > 1) {
                                    // Skip to 0.5 seconds before end to trigger natural transition
                                    const targetTime = Math.max(0, video.duration - 0.5);
                                    if (video.currentTime < targetTime) {
                                        video.currentTime = targetTime;
                                        console.log('[YarvixBrowser] Fast-forwarding ad');
                                    }
                                }

                            } else if (adState.wasAdPlaying) {
                                // Ad just ended - restore normal playback
                                console.log('[YarvixBrowser] Ad ended, restoring playback');
                                adState.wasAdPlaying = false;

                                // Restore video settings
                                video.playbackRate = 1;
                                video.muted = adState.originalMuted;
                                video.volume = adState.originalVolume;

                                // Make sure video plays
                                setTimeout(() => {
                                    const v = document.querySelector('video');
                                    if (v) {
                                        v.playbackRate = 1;
                                        v.muted = adState.originalMuted;
                                        if (v.paused) {
                                            v.play().catch(() => {
                                                // Click play button as fallback
                                                const playBtn = document.querySelector('.ytp-play-button');
                                                if (playBtn) playBtn.click();
                                            });
                                        }
                                    }
                                }, 100);

                            } else {
                                // No ad - ensure normal playback
                                if (video.playbackRate > 1) {
                                    video.playbackRate = 1;
                                }
                            }

                            // Remove overlay ads
                            document.querySelectorAll(
                                '.ytp-ad-overlay-container, .ytp-ad-text-overlay'
                            ).forEach(el => el.remove());
                        };

                        // Run ad handler frequently
                        setInterval(handleAd, 250);

                        // Also run on mutations
                        const adObserver = new MutationObserver(() => {
                            handleAd();
                        });
                        adObserver.observe(document.body, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            attributeFilter: ['class']
                        });

                        // Override YouTube's ad data on page load
                        const blockAdData = () => {
                            try {
                                if (window.ytInitialPlayerResponse) {
                                    if (window.ytInitialPlayerResponse.adPlacements) {
                                        window.ytInitialPlayerResponse.adPlacements = [];
                                    }
                                    if (window.ytInitialPlayerResponse.playerAds) {
                                        window.ytInitialPlayerResponse.playerAds = [];
                                    }
                                    if (window.ytInitialPlayerResponse.adSlots) {
                                        window.ytInitialPlayerResponse.adSlots = [];
                                    }
                                }
                            } catch(e) {}
                        };

                        blockAdData();

                        // Re-run on SPA navigation
                        let lastUrl = location.href;
                        setInterval(() => {
                            if (location.href !== lastUrl) {
                                lastUrl = location.href;
                                blockAdData();
                                // Reset ad state on navigation
                                adState.wasAdPlaying = false;
                            }
                        }, 1000);

                    } else {
                        // Generic ad blocking for other sites
                        const style = document.createElement('style');
                        style.textContent = \`
                            [id*="google_ads"], [id*="doubleclick"], [class*="ad-container"],
                            [class*="ad-wrapper"], [class*="ad-banner"], [class*="ad-slot"],
                            [class*="advertisement"], [data-ad], [data-ad-slot],
                            .adsbygoogle, .ad-placement, .sponsored, .promoted,
                            iframe[src*="doubleclick"], iframe[src*="googlesyndication"],
                            iframe[src*="adservice"]
                            { display: none !important; }
                        \`;
                        document.head.appendChild(style);

                        // Remove ad elements
                        const removeAds = () => {
                            document.querySelectorAll(
                                '[id*="google_ads"], [class*="ad-container"], [class*="ad-banner"], ' +
                                '.adsbygoogle, [data-ad], iframe[src*="doubleclick"]'
                            ).forEach(el => el.remove());
                        };

                        removeAds();

                        const observer = new MutationObserver(removeAds);
                        observer.observe(document.body, { childList: true, subtree: true });
                    }

                    // Block popup windows
                    const origOpen = window.open;
                    window.open = function(url) {
                        if (url && (url.includes('ad') || url.includes('popup') || url.includes('sponsor'))) {
                            console.log('[YarvixBrowser] Blocked popup:', url);
                            return null;
                        }
                        return origOpen.apply(window, arguments);
                    };

                    console.log('[YarvixBrowser] Ad Blocker Injection Complete');
                })();
            `;

            webview.executeJavaScript(youtubeAdBlockScript).catch(err => {
                // Silently fail - some pages may block script execution
            });

        } catch (err) {
            console.error('Failed to inject ad blocker:', err);
        }
    }
}

/**
 * Initialize when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    tabManager = new TabManager();
    window.tabManager = tabManager;

    // Apply theme and color theme
    applyTheme(settings.theme, settings.colorTheme);

    // Apply bookmarks bar visibility
    document.getElementById('bookmarks-bar').style.display = settings.showBookmarksBar ? 'flex' : 'none';

    // Initialize color palette selector
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.dataset.color === settings.colorTheme);
        swatch.addEventListener('click', () => {
            applyColorTheme(swatch.dataset.color);
        });
    });

    // Initialize Ad Blocker UI and listeners
    setupShieldButton();
    setupShieldsPanelListeners();
    setupAdBlockerListeners();

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

            // Hide suggestions
            hideUrlSuggestions();

            const isUrl = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(\/.*)?$/.test(input) ||
                          input.startsWith('localhost') ||
                          /^(\d{1,3}\.){3}\d{1,3}/.test(input);

            if (isUrl) {
                if (!input.startsWith('http')) input = 'https://' + input;
                wv.loadURL(input);
            } else {
                wv.loadURL(settings.searchEngine + encodeURIComponent(input));
            }

            // Blur the input after navigation
            e.target.blur();
        }
    });

    // URL input focus - select all text
    document.getElementById('url-input').addEventListener('focus', (e) => {
        e.target.select();
        // Show suggestions if there's input
        if (e.target.value.trim()) {
            showUrlSuggestions(e.target.value);
        }
    });

    // URL suggestions functionality
    setupUrlSuggestions();

    // Bookmark current page
    document.getElementById('bookmark-btn').addEventListener('click', () => {
        const wv = tabManager.getActiveWebview();
        if (!wv) return;

        const url = wv.getURL();
        const title = wv.getTitle();
        const btn = document.getElementById('bookmark-btn');

        const existingIndex = bookmarks.findIndex(b => b.url === url);
        if (existingIndex >= 0) {
            bookmarks.splice(existingIndex, 1);
        } else {
            bookmarks.push({ url, title, timestamp: Date.now() });
            // Add pulse animation when adding bookmark
            btn.classList.add('just-bookmarked');
            setTimeout(() => btn.classList.remove('just-bookmarked'), 400);
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

    // Clear history
    document.getElementById('clear-history-btn').addEventListener('click', () => {
        history = [];
        localStorage.setItem('browserHistory', '[]');
        renderHistory();
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

    // Listen for requests to create a new tab with URL (from Cmd+click handling in main process)
    ipcRenderer.on('create-tab-with-url', (_event, url) => {
        tabManager.createTab(url);
    });

    // Listen for keyboard shortcuts from main process (works even when webview has focus)
    ipcRenderer.on('browser-shortcut', (_event, { key, cmdOrCtrl, shift }) => {
        // Cmd/Ctrl + T - New Tab
        if (cmdOrCtrl && key === 't' && !shift) {
            tabManager.createTab(settings.homePage);
        }

        // Cmd/Ctrl + W - Close Tab
        if (cmdOrCtrl && key === 'w') {
            if (activeTabId !== null) {
                tabManager.closeTab(activeTabId);
            }
        }

        // Cmd/Ctrl + Shift + T - Reopen Last Closed Tab
        if (cmdOrCtrl && shift && key === 't') {
            if (recentlyClosedTabs.length > 0) {
                const lastClosed = recentlyClosedTabs.pop();
                tabManager.createTab(lastClosed.url);
            }
        }

        // Cmd/Ctrl + R - Refresh Page
        if (cmdOrCtrl && key === 'r' && !shift) {
            tabManager.getActiveWebview()?.reload();
        }

        // Cmd/Ctrl + L - Focus URL Bar
        if (cmdOrCtrl && key === 'l') {
            const urlInput = document.getElementById('url-input');
            urlInput.focus();
            urlInput.select();
        }

        // Cmd/Ctrl + N - New Window
        if (cmdOrCtrl && key === 'n') {
            ipcRenderer.send('create-new-window');
        }

        // Cmd/Ctrl + D - Bookmark
        if (cmdOrCtrl && key === 'd') {
            document.getElementById('bookmark-btn').click();
        }

        // Cmd/Ctrl + F - Find in page
        if (cmdOrCtrl && key === 'f') {
            document.getElementById('find-bar').classList.remove('hidden');
            document.getElementById('find-input').focus();
        }

        // Cmd/Ctrl + Tab - Next Tab
        if (cmdOrCtrl && key === 'tab' && !shift) {
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            const nextIndex = (currentIndex + 1) % tabs.length;
            if (tabs[nextIndex]) {
                tabManager.switchTab(tabs[nextIndex].id);
            }
        }

        // Cmd/Ctrl + Shift + Tab - Previous Tab
        if (cmdOrCtrl && shift && key === 'tab') {
            const currentIndex = tabs.findIndex(t => t.id === activeTabId);
            const prevIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
            if (tabs[prevIndex]) {
                tabManager.switchTab(tabs[prevIndex].id);
            }
        }

        // Cmd/Ctrl + 1-9 - Switch to Tab
        if (cmdOrCtrl && key >= '1' && key <= '9') {
            const tabIndex = parseInt(key) - 1;
            if (tabs[tabIndex]) {
                tabManager.switchTab(tabs[tabIndex].id);
            }
        }
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
        // Hide empty state when download starts
        const emptyState = document.getElementById('downloads-empty');
        if (emptyState) emptyState.style.display = 'none';

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

    // Listen for settings changes from homepage webview
    // Webviews use console-message event to communicate
    tabs.forEach(tab => {
        if (tab.webview) {
            setupWebviewListeners(tab.webview);
        }
    });

    function setupWebviewListeners(webview) {
        // Listen for IPC messages from webview
        webview.addEventListener('ipc-message', (event) => {
            if (event.channel === 'setting-changed') {
                handleSettingChange(event.args[0]);
            }
        });

        // Also listen for console messages as fallback for postMessage
        webview.addEventListener('console-message', (event) => {
            try {
                if (event.message.includes('homepage-action')) {
                    const data = JSON.parse(event.message);
                    if (data.action === 'setting-changed') {
                        handleSettingChange(data.data);
                    } else if (data.action === 'clear-all-data') {
                        handleClearAllData(data.data);
                    } else if (data.action === 'change-password') {
                        handlePasswordChange(data.data);
                    }
                }
            } catch (e) {
                // Ignore non-JSON messages
            }
        });

        // Keyboard shortcuts are now handled globally by main.js via web-contents-created
        // This ensures shortcuts work even when focus is inside a webview
    }

    function handleSettingChange(data) {
        const { key, value } = data;

        if (key === 'theme') {
            settings.theme = value;
            localStorage.setItem('theme', value);
            applyTheme(value, settings.colorTheme);
        } else if (key === 'colorTheme') {
            settings.colorTheme = value;
            localStorage.setItem('colorTheme', value);
            applyColorTheme(value);
        } else if (key === 'searchEngine') {
            settings.searchEngine = value;
            localStorage.setItem('searchEngine', value);
        } else if (key === 'showBookmarksBar') {
            settings.showBookmarksBar = value;
            localStorage.setItem('showBookmarksBar', value);
            document.getElementById('bookmarks-bar').style.display = value ? 'flex' : 'none';
        }
    }

    function handleClearAllData(data) {
        const { clearSiteData } = data;

        // Clear browser data from localStorage
        localStorage.removeItem('browserHistory');
        localStorage.removeItem('bookmarks');
        localStorage.removeItem('theme');
        localStorage.removeItem('colorTheme');
        localStorage.removeItem('searchEngine');
        localStorage.removeItem('showBookmarksBar');
        localStorage.removeItem('homePage');

        // Reset in-memory state
        history = [];
        bookmarks = [];
        settings.theme = 'dark';
        settings.colorTheme = 'purple';
        settings.searchEngine = 'https://www.google.com/search?q=';
        settings.showBookmarksBar = true;

        // Update UI
        applyTheme('dark', 'purple');
        document.getElementById('bookmarks-bar').style.display = 'flex';
        renderHistory();
        renderBookmarks();

        // If clearSiteData is true, also clear site data (cookies, sessions, etc.)
        if (clearSiteData) {
            ipcRenderer.send('clear-site-data');
        }

        console.log('[YarvixBrowser] All browser data cleared' + (clearSiteData ? ' including site data' : ''));
    }

    function handlePasswordChange(data) {
        const { currentPassword, newPassword } = data;
        ipcRenderer.send('password-change', { currentPassword, newPassword });
    }

    // Listen for password change result from main process
    ipcRenderer.on('password-change-result', (event, result) => {
        // Forward result to the homepage webview
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab && activeTab.webview) {
            activeTab.webview.executeJavaScript(`
                window.postMessage({
                    type: 'password-change-result',
                    success: ${result.success},
                    error: ${result.error ? `'${result.error}'` : 'null'}
                }, '*');
            `);
        }
    });

    // Make setupWebviewListeners available globally for new tabs
    window.setupWebviewListeners = setupWebviewListeners;

    // Click outside to close panels
    document.addEventListener('click', (e) => {
        // Close panels when clicking outside
        const panels = document.querySelectorAll('.panel:not(.hidden)');
        panels.forEach(panel => {
            if (!panel.contains(e.target) && !e.target.closest('#toolbar-buttons')) {
                panel.classList.add('hidden');
            }
        });
    });
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
            if (panelId === 'shields-panel') refreshShieldsPanel();
        }
    });

    closeBtn.addEventListener('click', () => {
        panel.classList.add('hidden');
    });
}

/**
 * Shield button click handler - toggle shields panel
 */
function setupShieldButton() {
    const shieldBtn = document.getElementById('shield-btn');
    const closeBtn = document.getElementById('close-shields');

    shieldBtn.addEventListener('click', () => {
        // Close other panels
        document.querySelectorAll('.panel').forEach(p => {
            if (p.id !== 'shields-panel') p.classList.add('hidden');
        });
        document.getElementById('shields-panel').classList.toggle('hidden');
        
        // Refresh shields panel when opening
        if (!document.getElementById('shields-panel').classList.contains('hidden')) {
            refreshShieldsPanel();
        }
    });

    closeBtn.addEventListener('click', () => {
        document.getElementById('shields-panel').classList.add('hidden');
    });
}

/**
 * Refresh the shields panel with current data
 */
function refreshShieldsPanel() {
    // Request current stats from main process
    ipcRenderer.send('adblock-get-stats');
    ipcRenderer.send('adblock-get-whitelist');
    
    // Update current site display
    const activeWebview = tabManager.getActiveWebview();
    if (activeWebview) {
        try {
            const url = activeWebview.getURL();
            if (url && url !== 'about:blank') {
                try {
                    const hostname = new URL(url).hostname;
                    document.getElementById('shields-current-site').textContent = hostname;
                } catch {
                    document.getElementById('shields-current-site').textContent = 'All sites';
                }
            } else {
                document.getElementById('shields-current-site').textContent = 'New Tab';
            }
        } catch {
            document.getElementById('shields-current-site').textContent = 'All sites';
        }
    }
}

/**
 * Update shield button UI based on state
 * @param {boolean} enabled - Whether ad blocker is enabled
 * @param {number} count - Number of blocked ads in current tab
 */
function updateShieldUI(enabled, count = 0) {
    const shieldBtn = document.getElementById('shield-btn');
    const shieldToggle = document.getElementById('shields-toggle');
    const shieldStatus = document.getElementById('shields-status');
    
    // Update button style
    if (enabled) {
        shieldBtn.classList.remove('shield-disabled');
        shieldBtn.classList.add('shield-active');
    } else {
        shieldBtn.classList.remove('shield-active');
        shieldBtn.classList.add('shield-disabled');
    }
    
    // Update toggle switch
    if (shieldToggle) {
        shieldToggle.checked = enabled;
    }
    
    // Update status text
    if (shieldStatus) {
        if (enabled) {
            shieldStatus.innerHTML = '<i class="fas fa-check-circle"></i> Protection active';
            shieldStatus.classList.remove('disabled');
        } else {
            shieldStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Protection disabled';
            shieldStatus.classList.add('disabled');
        }
    }
    
    // Update shield count
    updateShieldButtonCount(count);
}

/**
 * Update shield button count badge
 * @param {number} count - Number of blocked ads
 */
function updateShieldButtonCount(count) {
    const shieldCount = document.getElementById('shield-count');
    if (shieldCount) {
        shieldCount.textContent = count > 0 ? count : '0';
        shieldCount.classList.toggle('visible', count > 0);
    }
}

/**
 * Render whitelist in shields panel
 * @param {Array} whitelist - List of whitelisted domains
 */
function renderWhitelist(whitelist) {
    const container = document.getElementById('shields-whitelist-list');
    const countEl = document.getElementById('shields-whitelist-count');
    
    if (!container) return;
    
    // Update count
    if (countEl) {
        countEl.textContent = `${whitelist.length} site${whitelist.length !== 1 ? 's' : ''}`;
    }
    
    if (whitelist.length === 0) {
        container.innerHTML = '<div class="shields-whitelist-empty">No whitelisted sites</div>';
        return;
    }
    
    container.innerHTML = whitelist.map(domain => `
        <div class="shields-whitelist-item" data-domain="${domain}">
            <span class="shields-whitelist-domain">
                <i class="fas fa-globe"></i>
                ${domain}
            </span>
            <button class="shields-whitelist-remove" title="Remove from whitelist">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
    
    // Add remove handlers
    container.querySelectorAll('.shields-whitelist-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const domain = btn.closest('.shields-whitelist-item').dataset.domain;
            ipcRenderer.send('adblock-whitelist-remove', domain);
        });
    });
}

/**
 * Add current site to whitelist
 */
function whitelistCurrentSite() {
    const activeWebview = tabManager.getActiveWebview();
    if (!activeWebview) return;
    
    try {
        const url = activeWebview.getURL();
        if (!url || url === 'about:blank' || url.includes('homepage.html')) {
            alert('Cannot whitelist this page');
            return;
        }
        
        const hostname = new URL(url).hostname;
        ipcRenderer.send('adblock-whitelist-add', hostname);
        
        // Update UI
        const btn = document.getElementById('shields-whitelist-site');
        if (btn) {
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-check"></i> Added!';
            btn.disabled = true;
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
            }, 1500);
        }
    } catch (err) {
        console.error('Failed to whitelist site:', err);
    }
}

/**
 * Update shields stats display
 * @param {Object} stats - Ad blocker stats
 */
function updateShieldsStats(stats) {
    // Update shields panel stats
    const blockedCount = document.getElementById('shields-blocked-count');
    const totalBlocked = document.getElementById('shields-total-blocked');
    
    if (blockedCount) {
        blockedCount.textContent = stats.sessionBlocked || 0;
    }
    
    if (totalBlocked) {
        totalBlocked.textContent = stats.totalBlocked || 0;
    }
    
    // Update shield button count with current tab's stats
    const currentCount = tabManager.getCurrentTabShieldCount();
    updateShieldButtonCount(currentCount);
}

/**
 * Pulse animation when ad is blocked
 */
function pulseShieldCount() {
    const shieldCount = document.getElementById('shield-count');
    if (shieldCount) {
        shieldCount.classList.add('pulse');
        setTimeout(() => shieldCount.classList.remove('pulse'), 300);
    }
}

/**
 * Setup shield panel event listeners
 */
function setupShieldsPanelListeners() {
    // Toggle switch handler
    const shieldsToggle = document.getElementById('shields-toggle');
    if (shieldsToggle) {
        shieldsToggle.addEventListener('change', () => {
            ipcRenderer.send('adblock-toggle');
        });
    }
    
    // Whitelist current site button
    const whitelistBtn = document.getElementById('shields-whitelist-site');
    if (whitelistBtn) {
        whitelistBtn.addEventListener('click', whitelistCurrentSite);
    }
}

/**
 * Setup IPC listeners for ad blocker events
 */
function setupAdBlockerListeners() {
    // Listen for blocked ad notifications
    ipcRenderer.on('ad-blocked', (event, data) => {
        // Update per-tab stats
        const tabId = data.webContentsId?.toString() || activeTabId?.toString();
        if (tabId) {
            // Get current count and increment
            // const tab = tabs.find(t => t.id?.toString() === tabId);
            // if (tab) {
            //     let badge = tab.tabElement.querySelector('.tab-shield-badge');
            //     const currentCount = badge ? parseInt(badge.textContent) || 0 : 0;
            //     tabManager.updateTabShieldCount(tabId, currentCount + 1);
            // }
        }
        
        // Pulse animation on shield button
        pulseShieldCount();
        
        // Refresh shields panel if open
        const shieldsPanel = document.getElementById('shields-panel');
        if (shieldsPanel && !shieldsPanel.classList.contains('hidden')) {
            ipcRenderer.send('adblock-get-stats');
        }
    });
    
    // Listen for state changes
    ipcRenderer.on('adblock-state-changed', (event, data) => {
        updateShieldUI(data.enabled);
        updateShieldsStats(data.stats);
    });
    
    // Listen for stats updates
    ipcRenderer.on('adblock-stats', (event, stats) => {
        updateShieldsStats(stats);
    });
    
    // Listen for whitelist data
    ipcRenderer.on('adblock-whitelist', (event, data) => {
        renderWhitelist(data.whitelist || []);
    });
    
    // Listen for whitelist updates
    ipcRenderer.on('adblock-whitelist-updated', (event, data) => {
        renderWhitelist(data.whitelist || []);
    });
    
    // Request initial stats
    ipcRenderer.send('adblock-get-stats');
    ipcRenderer.send('adblock-get-whitelist');
}

function applyTheme(theme, colorTheme = null) {
    if (theme === 'light') {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    }

    // Apply color theme
    if (colorTheme) {
        document.body.setAttribute('data-color-theme', colorTheme);
    }
}

function applyColorTheme(colorTheme) {
    document.body.setAttribute('data-color-theme', colorTheme);
    settings.colorTheme = colorTheme;
    localStorage.setItem('colorTheme', colorTheme);

    // Update color palette selector UI
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.dataset.color === colorTheme);
    });
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (history.length === 0) {
        list.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>No history yet</p></div>';
        return;
    }

    list.innerHTML = history.slice(0, 50).map(item => `
        <div class="history-item" data-url="${item.url}">
            <div class="history-item-icon"><span class="tab-favicon"><img src="icon.svg" alt="Capture alert"/></span></div>
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

// ========================================
// URL SUGGESTIONS
// ========================================

/**
 * URL Suggestions State
 */
const suggestionState = {
    selectedIndex: -1,
    suggestions: [],
    isVisible: false
};

/**
 * Saved Credentials for suggestions
 */
let savedCredentials = [];

/**
 * Setup URL suggestions functionality
 */
function setupUrlSuggestions() {
    const urlInput = document.getElementById('url-input');
    const suggestionsContainer = document.getElementById('url-suggestions');

    // Input event - show suggestions as user types
    urlInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query.length > 0) {
            showUrlSuggestions(query);
        } else {
            hideUrlSuggestions();
        }
    });

    // Keyboard navigation for suggestions
    urlInput.addEventListener('keydown', (e) => {
        if (!suggestionState.isVisible) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                navigateSuggestion(1);
                break;
            case 'ArrowUp':
                e.preventDefault();
                navigateSuggestion(-1);
                break;
            case 'Enter':
                if (suggestionState.selectedIndex >= 0) {
                    e.preventDefault();
                    selectSuggestion(suggestionState.selectedIndex);
                }
                break;
            case 'Escape':
                e.preventDefault();
                hideUrlSuggestions();
                break;
            case 'Tab':
                if (suggestionState.selectedIndex >= 0) {
                    e.preventDefault();
                    selectSuggestion(suggestionState.selectedIndex);
                }
                break;
        }
    });

    // Hide suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#url-bar-wrapper')) {
            hideUrlSuggestions();
        }
    });

    // Blur event - hide suggestions (with delay for click handling)
    urlInput.addEventListener('blur', () => {
        setTimeout(() => {
            if (!document.activeElement?.closest('#url-suggestions')) {
                hideUrlSuggestions();
            }
        }, 150);
    });
}

/**
 * Show URL suggestions based on query
 */
function showUrlSuggestions(query) {
    const suggestionsContainer = document.getElementById('url-suggestions');
    const suggestionsList = document.getElementById('url-suggestions-list');

    if (!suggestionsContainer || !suggestionsList) return;

    const lowerQuery = query.toLowerCase();

    // Get suggestions from history, bookmarks, and credentials
    const suggestions = [];

    // Add matching history items
    history.forEach(item => {
        const urlMatch = item.url.toLowerCase().includes(lowerQuery);
        const titleMatch = (item.title || '').toLowerCase().includes(lowerQuery);

        if (urlMatch || titleMatch) {
            suggestions.push({
                type: 'history',
                url: item.url,
                title: item.title || item.url,
                timestamp: item.timestamp,
                matchScore: urlMatch && titleMatch ? 3 : (urlMatch ? 2 : 1)
            });
        }
    });

    // Add matching bookmarks
    bookmarks.forEach(item => {
        const urlMatch = item.url.toLowerCase().includes(lowerQuery);
        const titleMatch = (item.title || '').toLowerCase().includes(lowerQuery);

        if (urlMatch || titleMatch) {
            // Check if already in suggestions (from history)
            const existingIndex = suggestions.findIndex(s => s.url === item.url);
            if (existingIndex >= 0) {
                // Upgrade to bookmark type (higher priority)
                suggestions[existingIndex].type = 'bookmark';
                suggestions[existingIndex].matchScore += 2;
            } else {
                suggestions.push({
                    type: 'bookmark',
                    url: item.url,
                    title: item.title || item.url,
                    timestamp: item.timestamp,
                    matchScore: (urlMatch && titleMatch ? 3 : (urlMatch ? 2 : 1)) + 2
                });
            }
        }
    });

    // Add matching credential sites (from Password Manager)
    savedCredentials.forEach(cred => {
        const hostname = (cred.hostname || '').toLowerCase();
        const origin = (cred.origin || '').toLowerCase();
        const username = (cred.username || '').toLowerCase();

        const hostnameMatch = hostname.includes(lowerQuery);
        const originMatch = origin.includes(lowerQuery);
        const usernameMatch = username.includes(lowerQuery);

        if (hostnameMatch || originMatch || usernameMatch) {
            // Use the origin URL for navigation
            const navUrl = cred.origin;

            // Check if already in suggestions (from history/bookmarks)
            const existingIndex = suggestions.findIndex(s => s.url === navUrl);
            if (existingIndex >= 0) {
                // Upgrade to credential type (highest priority)
                suggestions[existingIndex].type = 'credential';
                suggestions[existingIndex].matchScore += 3;
            } else {
                suggestions.push({
                    type: 'credential',
                    url: navUrl,
                    title: cred.hostname || cred.origin,
                    subtitle: cred.username ? `Saved for ${cred.username}` : 'Saved password',
                    timestamp: cred.timestamp || Date.now(),
                    matchScore: (hostnameMatch ? 3 : (originMatch ? 2 : 1)) + 3
                });
            }
        }
    });

    // Sort by match score (higher is better), then by recency
    suggestions.sort((a, b) => {
        if (b.matchScore !== a.matchScore) {
            return b.matchScore - a.matchScore;
        }
        return (b.timestamp || 0) - (a.timestamp || 0);
    });

    // Limit to top 8 suggestions
    const topSuggestions = suggestions.slice(0, 8);

    // Add search suggestion at the end if query doesn't look like a URL
    const isUrl = /^(https?:\/\/)?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/.test(query) ||
                  query.startsWith('localhost') ||
                  /^(\d{1,3}\.){3}\d{1,3}/.test(query);

    if (!isUrl && query.length > 0) {
        topSuggestions.push({
            type: 'search',
            url: settings.searchEngine + encodeURIComponent(query),
            title: `Search for "${query}"`,
            searchQuery: query
        });
    }

    // Store suggestions in state
    suggestionState.suggestions = topSuggestions;
    suggestionState.selectedIndex = -1;

    if (topSuggestions.length === 0) {
        hideUrlSuggestions();
        return;
    }

    // Render suggestions
    suggestionsList.innerHTML = topSuggestions.map((suggestion, index) => {
        const iconHtml = getSuggestionIcon(suggestion);
        const titleHtml = highlightMatch(suggestion.title, query);
        const urlHtml = suggestion.type !== 'search' ? highlightMatch(suggestion.url, query) : '';
        const typeLabel = getSuggestionTypeLabel(suggestion.type);

        return `
            <div class="url-suggestion-item ${suggestion.type === 'search' ? 'search-suggestion' : ''}"
                 data-index="${index}"
                 data-url="${escapeHtml(suggestion.url)}">
                <div class="url-suggestion-icon">${iconHtml}</div>
                <div class="url-suggestion-content">
                    <div class="url-suggestion-title">${titleHtml}</div>
                    ${urlHtml ? `<div class="url-suggestion-url">${urlHtml}</div>` : ''}
                </div>
                <span class="url-suggestion-type">${typeLabel}</span>
            </div>
        `;
    }).join('');

    // Add click handlers
    suggestionsList.querySelectorAll('.url-suggestion-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const index = parseInt(item.dataset.index);
            selectSuggestion(index);
        });

        item.addEventListener('mouseenter', () => {
            updateSelectedSuggestion(parseInt(item.dataset.index));
        });
    });

    // Show the suggestions container
    suggestionsContainer.classList.remove('hidden');
    suggestionState.isVisible = true;
}

/**
 * Hide URL suggestions
 */
function hideUrlSuggestions() {
    const suggestionsContainer = document.getElementById('url-suggestions');
    if (suggestionsContainer) {
        suggestionsContainer.classList.add('hidden');
    }
    suggestionState.isVisible = false;
    suggestionState.selectedIndex = -1;
    suggestionState.suggestions = [];
}

/**
 * Navigate through suggestions with arrow keys
 */
function navigateSuggestion(direction) {
    const newIndex = suggestionState.selectedIndex + direction;
    const maxIndex = suggestionState.suggestions.length - 1;

    if (newIndex < -1) {
        updateSelectedSuggestion(maxIndex);
    } else if (newIndex > maxIndex) {
        updateSelectedSuggestion(-1);
    } else {
        updateSelectedSuggestion(newIndex);
    }

    // Update URL input with selected suggestion's URL
    if (suggestionState.selectedIndex >= 0) {
        const suggestion = suggestionState.suggestions[suggestionState.selectedIndex];
        const urlInput = document.getElementById('url-input');
        if (suggestion.type === 'search') {
            // Don't change input for search suggestions
        } else {
            urlInput.value = suggestion.url;
        }
    }
}

/**
 * Update which suggestion is selected
 */
function updateSelectedSuggestion(index) {
    suggestionState.selectedIndex = index;

    const items = document.querySelectorAll('.url-suggestion-item');
    items.forEach((item, i) => {
        item.classList.toggle('selected', i === index);
    });
}

/**
 * Select a suggestion and navigate to it
 */
function selectSuggestion(index) {
    const suggestion = suggestionState.suggestions[index];
    if (!suggestion) return;

    const urlInput = document.getElementById('url-input');
    const wv = tabManager.getActiveWebview();

    if (!wv) return;

    // Update input and navigate
    urlInput.value = suggestion.type === 'search' ? suggestion.searchQuery || '' : suggestion.url;
    hideUrlSuggestions();

    wv.loadURL(suggestion.url);
    urlInput.blur();
}

/**
 * Get icon HTML for suggestion type
 */
function getSuggestionIcon(suggestion) {
    switch (suggestion.type) {
        case 'bookmark':
            return '<i class="fas fa-star" style="color: var(--accent-color);"></i>';
        case 'history':
            return '<i class="fas fa-clock-rotate-left"></i>';
        case 'credential':
            return '<i class="fas fa-key" style="color: var(--warning-color);"></i>';
        case 'search':
            return '<i class="fas fa-magnifying-glass"></i>';
        default:
            return '<i class="fas fa-globe"></i>';
    }
}

/**
 * Get label for suggestion type
 */
function getSuggestionTypeLabel(type) {
    switch (type) {
        case 'bookmark':
            return 'Bookmark';
        case 'history':
            return 'History';
        case 'credential':
            return 'Password';
        case 'search':
            return 'Search';
        default:
            return '';
    }
}

/**
 * Highlight matching text in string
 */
function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');

    const escapedText = escapeHtml(text);
    const escapedQuery = escapeHtml(query);
    const lowerText = escapedText.toLowerCase();
    const lowerQuery = escapedQuery.toLowerCase();

    const index = lowerText.indexOf(lowerQuery);
    if (index === -1) return escapedText;

    const before = escapedText.substring(0, index);
    const match = escapedText.substring(index, index + escapedQuery.length);
    const after = escapedText.substring(index + escapedQuery.length);

    return `${before}<span class="url-suggestion-match">${match}</span>${after}`;
}

/**
 * Escape HTML characters
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========================================
// CREDENTIAL MANAGER
// ========================================

/**
 * Credential Manager State
 */
const credentialState = {
    pendingCredential: null,    // Credential awaiting save/update
    credentialScript: null,     // Form detection script
    allCredentials: [],         // All saved credentials
    neverSaveSites: [],         // Sites marked as "never save"
    autofillCredentials: [],    // Credentials for current page autofill
    promptTimeout: null,        // Auto-dismiss timeout
    promptAutoHideDelay: 15000, // 15 seconds
    // Autofill dropdown state
    pendingAutofillPosition: null,  // Position from webview focus event
    pendingAutofillWebview: null,   // Webview that triggered focus
    pendingAutofillUrl: null,       // URL for autofill
    dropdownClicked: false          // Track if dropdown was clicked
};

/**
 * Initialize Credential Manager
 */
function initCredentialManager() {
    // Get the form detection script
    ipcRenderer.send('credential-get-script');

    // Request credentials for URL suggestions
    ipcRenderer.send('credential-get-for-suggestions');

    // Setup panel toggle for credentials panel
    setupCredentialsPanelToggle();

    // Setup credential prompt listeners
    setupCredentialPromptListeners();

    // Setup IPC listeners
    setupCredentialIPCListeners();
}

/**
 * Setup Credentials Panel Toggle
 */
function setupCredentialsPanelToggle() {
    const btn = document.getElementById('credentials-btn');
    const panel = document.getElementById('credentials-panel');
    const closeBtn = document.getElementById('close-credentials');

    btn?.addEventListener('click', () => {
        // Close other panels
        document.querySelectorAll('.panel').forEach(p => {
            if (p.id !== 'credentials-panel') p.classList.add('hidden');
        });
        panel.classList.toggle('hidden');

        // Refresh credentials when opening
        if (!panel.classList.contains('hidden')) {
            refreshCredentialsPanel();
        }
    });

    closeBtn?.addEventListener('click', () => {
        panel.classList.add('hidden');
    });

    // Never save toggle
    const neverSaveToggle = document.getElementById('never-save-toggle');
    neverSaveToggle?.addEventListener('click', () => {
        neverSaveToggle.classList.toggle('expanded');
        document.getElementById('never-save-list').classList.toggle('hidden');
    });

    // Search functionality
    const searchInput = document.getElementById('credentials-search-input');
    searchInput?.addEventListener('input', (e) => {
        filterCredentialsList(e.target.value);
    });

    // Clear all button
    const clearAllBtn = document.getElementById('credentials-clear-all-btn');
    clearAllBtn?.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete ALL saved passwords? This cannot be undone.')) {
            ipcRenderer.send('credential-clear-all');
        }
    });
}

/**
 * Refresh Credentials Panel
 */
function refreshCredentialsPanel() {
    ipcRenderer.send('credential-get-all');
}

/**
 * Render Credentials List - Grouped by Site
 */
function renderCredentialsList(credentials) {
    const list = document.getElementById('credentials-list');
    const countEl = document.getElementById('credentials-count');
    const emptyState = document.getElementById('credentials-empty');

    credentialState.allCredentials = credentials;

    if (countEl) {
        countEl.textContent = credentials.length;
    }

    if (credentials.length === 0) {
        list.innerHTML = '';
        if (emptyState) {
            emptyState.style.display = 'flex';
            list.appendChild(emptyState);
        }
        return;
    }

    if (emptyState) {
        emptyState.style.display = 'none';
    }

    // Group credentials by origin/site
    const groupedCredentials = {};
    credentials.forEach((cred, index) => {
        const hostname = getHostnameFromOrigin(cred.origin);
        if (!groupedCredentials[hostname]) {
            groupedCredentials[hostname] = {
                origin: cred.origin,
                hostname: hostname,
                credentials: []
            };
        }
        groupedCredentials[hostname].credentials.push({ ...cred, index });
    });

    // Sort sites alphabetically
    const sortedSites = Object.keys(groupedCredentials).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    // Render grouped list
    list.innerHTML = sortedSites.map(hostname => {
        const group = groupedCredentials[hostname];
        const credCount = group.credentials.length;
        const isMultiple = credCount > 1;

        return `
            <div class="credential-site-group" data-hostname="${hostname}">
                <div class="credential-site-header ${isMultiple ? 'expandable' : ''}" data-origin="${group.origin}">
                    <div class="credential-site-icon">
                        <img src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32"
                             onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
                             alt="${hostname}">
                        <i class="fas fa-globe fallback-icon" style="display:none;"></i>
                    </div>
                    <div class="credential-site-info">
                        <div class="credential-site-name">${hostname}</div>
                        <div class="credential-site-count">${credCount} password${credCount > 1 ? 's' : ''}</div>
                    </div>
                    ${isMultiple ? `
                        <div class="credential-site-chevron">
                            <i class="fas fa-chevron-down"></i>
                        </div>
                    ` : `
                        <div class="credential-site-actions">
                            <button class="credential-action-btn copy-password-btn"
                                    data-origin="${group.origin}"
                                    data-username="${group.credentials[0].username}"
                                    title="Copy Password">
                                <i class="fas fa-copy"></i>
                            </button>
                            <button class="credential-action-btn danger delete-credential-btn"
                                    data-origin="${group.origin}"
                                    data-username="${group.credentials[0].username}"
                                    title="Delete">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    `}
                </div>
                ${isMultiple ? `
                    <div class="credential-site-credentials hidden">
                        ${group.credentials.map(cred => `
                            <div class="credential-sub-item" data-origin="${cred.origin}" data-username="${cred.username}">
                                <div class="credential-sub-icon">
                                    <i class="fas fa-user"></i>
                                </div>
                                <div class="credential-sub-info">
                                    <div class="credential-sub-username">${cred.username}</div>
                                </div>
                                <div class="credential-sub-actions">
                                    <button class="credential-action-btn copy-password-btn" title="Copy Password">
                                        <i class="fas fa-copy"></i>
                                    </button>
                                    <button class="credential-action-btn danger delete-credential-btn" title="Delete">
                                        <i class="fas fa-trash"></i>
                                    </button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Add event listeners for expandable headers
    list.querySelectorAll('.credential-site-header.expandable').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.credential-action-btn')) return;

            const group = header.closest('.credential-site-group');
            const credList = group.querySelector('.credential-site-credentials');
            const chevron = header.querySelector('.credential-site-chevron');

            header.classList.toggle('expanded');
            credList.classList.toggle('hidden');
            chevron?.classList.toggle('rotated');
        });
    });

    // Add event listeners for single-credential sites
    list.querySelectorAll('.credential-site-header:not(.expandable)').forEach(header => {
        const copyBtn = header.querySelector('.copy-password-btn');
        const deleteBtn = header.querySelector('.delete-credential-btn');

        copyBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            copyCredentialPassword(copyBtn.dataset.origin, copyBtn.dataset.username);
        });

        deleteBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            const hostname = header.closest('.credential-site-group').dataset.hostname;
            if (confirm(`Delete password for ${deleteBtn.dataset.username} at ${hostname}?`)) {
                ipcRenderer.send('credential-delete', { url: deleteBtn.dataset.origin, username: deleteBtn.dataset.username });
            }
        });
    });

    // Add event listeners for sub-items (multiple credentials per site)
    list.querySelectorAll('.credential-sub-item').forEach(item => {
        const origin = item.dataset.origin;
        const username = item.dataset.username;
        const hostname = item.closest('.credential-site-group').dataset.hostname;

        item.querySelector('.copy-password-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            copyCredentialPassword(origin, username);
        });

        item.querySelector('.delete-credential-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Delete password for ${username} at ${hostname}?`)) {
                ipcRenderer.send('credential-delete', { url: origin, username });
            }
        });
    });
}

/**
 * Copy credential password to clipboard (requires system auth)
 */
async function copyCredentialPassword(origin, username) {
    try {
        // Use system auth to get password securely
        const result = await ipcRenderer.invoke('credential-autofill-with-auth', {
            url: origin,
            username
        });

        if (!result.success) {
            if (result.cancelled) {
                console.log('[CredentialManager] Auth cancelled by user');
            } else {
                showToast('Authentication failed');
            }
            return;
        }

        // Copy password to clipboard
        await navigator.clipboard.writeText(result.password);
        showToast('Password copied to clipboard');
    } catch (err) {
        console.error('Failed to copy password:', err);
        showToast('Failed to copy password');
    }
}

/**
 * Show a brief toast notification
 */
function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'credential-toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 24px;
        background: var(--success-color);
        color: white;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        display: flex;
        align-items: center;
        gap: 8px;
        animation: toastIn 0.3s ease;
    `;

    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

/**
 * Filter credentials list by search query (works with grouped structure)
 */
function filterCredentialsList(query) {
    const groups = document.querySelectorAll('.credential-site-group');
    const lowerQuery = query.toLowerCase();

    groups.forEach(group => {
        const hostname = group.dataset.hostname?.toLowerCase() || '';
        const subItems = group.querySelectorAll('.credential-sub-item');
        const header = group.querySelector('.credential-site-header');

        // Check if hostname matches
        if (hostname.includes(lowerQuery)) {
            group.style.display = 'block';
            subItems.forEach(item => item.style.display = 'flex');
            return;
        }

        // Check sub-items for username matches
        let hasMatch = false;
        subItems.forEach(item => {
            const username = item.dataset.username?.toLowerCase() || '';
            if (username.includes(lowerQuery)) {
                item.style.display = 'flex';
                hasMatch = true;
            } else {
                item.style.display = 'none';
            }
        });

        // For single-credential sites, check username in header
        if (subItems.length === 0) {
            const username = header?.querySelector('.copy-password-btn')?.dataset.username?.toLowerCase() || '';
            hasMatch = username.includes(lowerQuery);
        }

        group.style.display = hasMatch ? 'block' : 'none';

        // If searching and has matches, expand the group
        if (hasMatch && query && subItems.length > 0) {
            header?.classList.add('expanded');
            group.querySelector('.credential-site-credentials')?.classList.remove('hidden');
            group.querySelector('.credential-site-chevron')?.classList.add('rotated');
        }
    });
}

/**
 * Render Never Save Sites
 */
function renderNeverSaveSites(sites) {
    const list = document.getElementById('never-save-list');
    const countEl = document.getElementById('never-save-count');

    credentialState.neverSaveSites = sites;

    if (countEl) {
        countEl.textContent = sites.length;
    }

    if (sites.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding: 16px;"><p style="font-size: 13px; color: var(--text-secondary);">No sites blocked</p></div>';
        return;
    }

    list.innerHTML = sites.map(site => `
        <div class="never-save-item" data-site="${site}">
            <span class="never-save-domain">
                <i class="fas fa-globe"></i>
                ${getHostnameFromOrigin(site)}
            </span>
            <button class="never-save-remove" title="Allow saving for this site">
                <i class="fas fa-check"></i>
            </button>
        </div>
    `).join('');

    // Add event listeners
    list.querySelectorAll('.never-save-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const site = btn.closest('.never-save-item').dataset.site;
            ipcRenderer.send('credential-enable-save', { url: site });
        });
    });
}

/**
 * Get hostname from origin URL
 */
function getHostnameFromOrigin(origin) {
    try {
        return new URL(origin).hostname;
    } catch {
        return origin;
    }
}

/**
 * Setup Credential Prompt Listeners
 */
function setupCredentialPromptListeners() {
    // Save button
    document.getElementById('credential-save-btn')?.addEventListener('click', () => {
        if (credentialState.pendingCredential) {
            const { url, username, password } = credentialState.pendingCredential;
            ipcRenderer.send('credential-save', { url, username, password });
            hideCredentialPrompt();
        }
    });

    // Never button
    document.getElementById('credential-never-btn')?.addEventListener('click', () => {
        if (credentialState.pendingCredential) {
            ipcRenderer.send('credential-never-save', { url: credentialState.pendingCredential.url });
            hideCredentialPrompt();
        }
    });

    // Dismiss button
    document.getElementById('credential-dismiss-btn')?.addEventListener('click', () => {
        hideCredentialPrompt();
    });

    // Update button
    document.getElementById('credential-update-btn')?.addEventListener('click', () => {
        if (credentialState.pendingCredential) {
            const { url, username, password } = credentialState.pendingCredential;
            ipcRenderer.send('credential-save', { url, username, password });
            hideCredentialUpdatePrompt();
        }
    });

    // Update dismiss button
    document.getElementById('credential-update-dismiss-btn')?.addEventListener('click', () => {
        hideCredentialUpdatePrompt();
    });
}

/**
 * Show Credential Save Prompt
 */
function showCredentialSavePrompt(url, username) {
    const prompt = document.getElementById('credential-prompt');
    const usernameEl = document.getElementById('credential-prompt-username');
    const siteEl = document.getElementById('credential-prompt-site');

    if (!prompt) return;

    usernameEl.textContent = username;
    siteEl.textContent = getHostnameFromOrigin(url);

    prompt.classList.remove('hidden');

    // Auto-hide after delay
    clearTimeout(credentialState.promptTimeout);
    credentialState.promptTimeout = setTimeout(() => {
        hideCredentialPrompt();
    }, credentialState.promptAutoHideDelay);
}

/**
 * Hide Credential Save Prompt
 */
function hideCredentialPrompt() {
    const prompt = document.getElementById('credential-prompt');
    if (prompt) {
        prompt.classList.add('hidden');
    }
    clearTimeout(credentialState.promptTimeout);
    credentialState.pendingCredential = null;
}

/**
 * Show Credential Update Prompt
 */
function showCredentialUpdatePrompt(url, username) {
    const prompt = document.getElementById('credential-update-prompt');
    const usernameEl = document.getElementById('credential-update-username');
    const siteEl = document.getElementById('credential-update-site');

    if (!prompt) return;

    usernameEl.textContent = username;
    siteEl.textContent = getHostnameFromOrigin(url);

    prompt.classList.remove('hidden');

    // Auto-hide after delay
    clearTimeout(credentialState.promptTimeout);
    credentialState.promptTimeout = setTimeout(() => {
        hideCredentialUpdatePrompt();
    }, credentialState.promptAutoHideDelay);
}

/**
 * Hide Credential Update Prompt
 */
function hideCredentialUpdatePrompt() {
    const prompt = document.getElementById('credential-update-prompt');
    if (prompt) {
        prompt.classList.add('hidden');
    }
    clearTimeout(credentialState.promptTimeout);
    credentialState.pendingCredential = null;
}

/**
 * Show Autofill Dropdown at specific position
 */
function showAutofillDropdownAt(credentials, x, y, minWidth) {
    const dropdown = document.getElementById('autofill-dropdown');
    const list = document.getElementById('autofill-list');

    if (!dropdown || credentials.length === 0) {
        hideAutofillDropdown();
        return;
    }

    credentialState.autofillCredentials = credentials;

    list.innerHTML = credentials.map((cred, index) => `
        <div class="autofill-item" data-index="${index}">
            <div class="autofill-item-icon">
                <i class="fas fa-user"></i>
            </div>
            <div class="autofill-item-info">
                <div class="autofill-item-username">${cred.username}</div>
                <div class="autofill-item-password">********</div>
            </div>
        </div>
    `).join('');

    // Position dropdown
    dropdown.style.left = `${x}px`;
    dropdown.style.top = `${y}px`;
    if (minWidth) {
        dropdown.style.minWidth = `${Math.max(minWidth, 250)}px`;
    }
    dropdown.classList.remove('hidden');

    // Add click handlers
    list.querySelectorAll('.autofill-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            credentialState.dropdownClicked = true;

            const index = parseInt(item.dataset.index);
            const cred = credentialState.autofillCredentials[index];
            if (cred) {
                // Hide dropdown FIRST for immediate visual feedback
                hideAutofillDropdown();
                // Then perform autofill with system auth (username + origin URL, password fetched after auth)
                performAutofill(cred.username, cred.origin);
            }
        });
    });

    // Prevent dropdown clicks from triggering blur
    dropdown.addEventListener('mousedown', (e) => {
        e.preventDefault();
        credentialState.dropdownClicked = true;
    });
}

/**
 * Show Autofill Dropdown (legacy, used for manual positioning)
 */
function showAutofillDropdown(credentials, x, y) {
    showAutofillDropdownAt(credentials, x, y, null);
}

/**
 * Hide Autofill Dropdown
 */
function hideAutofillDropdown() {
    const dropdown = document.getElementById('autofill-dropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
    }
    // Clear pending state
    credentialState.pendingAutofillPosition = null;
    credentialState.pendingAutofillWebview = null;
    credentialState.pendingAutofillUrl = null;
}

/**
 * Perform autofill in active webview with system authentication
 * This mimics Chrome/Brave behavior - requires Touch ID/Password before filling
 */
async function performAutofill(username, url) {
    const webview = tabManager.getActiveWebview();
    if (!webview) return;

    try {
        // Request password with system authentication (Touch ID/Password)
        const result = await ipcRenderer.invoke('credential-autofill-with-auth', {
            url: url || credentialState.pendingAutofillUrl,
            username
        });

        if (!result.success) {
            if (result.cancelled) {
                // User cancelled auth - just close dropdown silently
                console.log('[CredentialManager] Auth cancelled by user');
            } else {
                console.error('[CredentialManager] Auth failed:', result.error);
                // Show specific error message
                if (result.error === 'Credential not found') {
                    showToast('Password not found for this site');
                } else {
                    showToast('Could not fill password: ' + result.error);
                }
            }
            return;
        }

        // Now fill the form with the authenticated credentials
        const script = `
            (function() {
                if (window.__yarvixAutofill) {
                    window.__yarvixAutofill(${JSON.stringify(result.username)}, ${JSON.stringify(result.password)});
                }
            })();
        `;

        await webview.executeJavaScript(script);
    } catch (err) {
        console.error('[CredentialManager] Autofill failed:', err);
    }
}

/**
 * Inject credential detection script into webview
 */
function injectCredentialScript(webview, tabId) {
    if (!credentialState.credentialScript) return;

    try {
        const currentUrl = webview.getURL();

        // Skip injection for local files and homepage
        if (!currentUrl || currentUrl.startsWith('file://') || currentUrl === 'about:blank') {
            return;
        }

        webview.executeJavaScript(credentialState.credentialScript).catch(err => {
            // Silently fail - some pages may block script execution
        });
    } catch (err) {
        console.error('[CredentialManager] Failed to inject credential script:', err);
    }
}

/**
 * Handle credential form submission from webview
 */
function handleCredentialSubmit(data) {
    const { url, username, password } = data;

    if (!url || !username || !password) return;

    // Check if we should prompt
    ipcRenderer.send('credential-check', { url, username, password });

    // Store pending credential
    credentialState.pendingCredential = { url, username, password };
}

/**
 * Handle login form detected on page
 */
function handleLoginFormDetected(data) {
    const { url } = data;

    // Request credentials for autofill
    ipcRenderer.send('credential-get-for-autofill', { url });
}

/**
 * Setup IPC Listeners for Credential Manager
 */
function setupCredentialIPCListeners() {
    // Receive form detection script
    ipcRenderer.on('credential-script', (_event, data) => {
        credentialState.credentialScript = data.script;
    });

    // Receive credential check result
    ipcRenderer.on('credential-check-result', (_event, data) => {
        if (!credentialState.pendingCredential) return;

        const { shouldPrompt, status } = data;

        if (!shouldPrompt) {
            // Site is in "never save" list
            credentialState.pendingCredential = null;
            return;
        }

        if (status === 'same') {
            // Credentials already saved with same password - don't prompt
            credentialState.pendingCredential = null;
            return;
        }

        if (status === 'different') {
            // Password changed - show update prompt
            showCredentialUpdatePrompt(
                credentialState.pendingCredential.url,
                credentialState.pendingCredential.username
            );
        } else {
            // New credential - show save prompt
            showCredentialSavePrompt(
                credentialState.pendingCredential.url,
                credentialState.pendingCredential.username
            );
        }
    });

    // Receive credential saved confirmation
    ipcRenderer.on('credential-saved', (_event, data) => {
        if (data.success) {
            showToast('Password saved');
            // Refresh credential suggestions for URL bar
            ipcRenderer.send('credential-get-for-suggestions');
        }
    });

    // Receive all credentials list
    ipcRenderer.on('credential-list', (_event, data) => {
        renderCredentialsList(data.credentials || []);
        renderNeverSaveSites(data.neverSaveSites || []);
    });

    // Receive credential suggestions (for URL bar)
    ipcRenderer.on('credential-suggestions', (_event, data) => {
        savedCredentials = data.credentials || [];
        console.log(`[URLSuggestions] Loaded ${savedCredentials.length} credential sites`);
    });

    // Receive autofill credentials
    ipcRenderer.on('credential-autofill-list', (_event, data) => {
        if (data.credentials && data.credentials.length > 0) {
            credentialState.autofillCredentials = data.credentials;

            // If we have a pending position from focus event, show dropdown
            if (credentialState.pendingAutofillPosition && credentialState.pendingAutofillWebview) {
                const webview = credentialState.pendingAutofillWebview;
                const pos = credentialState.pendingAutofillPosition;

                // Get webview's position relative to window
                const webviewRect = webview.getBoundingClientRect();

                // Calculate absolute position for dropdown
                const dropdownX = webviewRect.left + pos.x;
                const dropdownY = webviewRect.top + pos.y + 4; // Small offset below field

                showAutofillDropdownAt(data.credentials, dropdownX, dropdownY, pos.width);
            }
        } else {
            // No credentials for this site, hide dropdown
            hideAutofillDropdown();
        }
    });

    // Receive never-save update
    ipcRenderer.on('credential-never-save-updated', (_event, data) => {
        showToast('Saving disabled for this site');
        renderNeverSaveSites(data.neverSaveSites || []);
    });

    // Receive enable-save update
    ipcRenderer.on('credential-enable-save-updated', (_event, data) => {
        showToast('Saving enabled for this site');
        renderNeverSaveSites(data.neverSaveSites || []);
    });

    // Receive all cleared
    ipcRenderer.on('credential-all-cleared', (_event, data) => {
        if (data.success) {
            showToast('All passwords deleted');
        }
    });
}

/**
 * Extend TabManager to include credential injection
 */
const originalInjectAdBlocker = TabManager.prototype.injectAdBlocker;
TabManager.prototype.injectAdBlocker = function(webview, tabId) {
    // Call original ad blocker injection
    originalInjectAdBlocker.call(this, webview, tabId);

    // Also inject credential detection script
    injectCredentialScript(webview, tabId);
};

/**
 * Setup console message listener for credential events from webviews
 */
function setupWebviewCredentialListeners(webview) {
    webview.addEventListener('console-message', (event) => {
        try {
            if (event.message.includes('yarvix-credential-submit') ||
                event.message.includes('yarvix-login-form-detected') ||
                event.message.includes('yarvix-autofill-focus') ||
                event.message.includes('yarvix-autofill-blur')) {
                const data = JSON.parse(event.message);

                if (data.type === 'yarvix-credential-submit') {
                    handleCredentialSubmit(data.data);
                } else if (data.type === 'yarvix-login-form-detected') {
                    handleLoginFormDetected(data.data);
                } else if (data.type === 'yarvix-autofill-focus') {
                    handleAutofillFocus(data.data, webview);
                } else if (data.type === 'yarvix-autofill-blur') {
                    handleAutofillBlur();
                }
            }
        } catch (e) {
            // Ignore non-JSON messages
        }
    });
}

/**
 * Handle autofill focus event - show dropdown near the focused field
 */
function handleAutofillFocus(data, webview) {
    const { url, position } = data;

    // Store position and webview for when credentials arrive
    credentialState.pendingAutofillPosition = position;
    credentialState.pendingAutofillWebview = webview;
    credentialState.pendingAutofillUrl = url;

    // Request credentials for this URL
    ipcRenderer.send('credential-get-for-autofill', { url });
}

/**
 * Handle autofill blur event - hide dropdown
 */
function handleAutofillBlur() {
    // Delay hide to allow clicking on dropdown items
    setTimeout(() => {
        if (!credentialState.dropdownClicked) {
            hideAutofillDropdown();
        }
        credentialState.dropdownClicked = false;
    }, 200);
}

// Extend setupWebviewListeners to include credential listeners
const originalSetupWebviewListeners = window.setupWebviewListeners;
window.setupWebviewListeners = function(webview) {
    if (originalSetupWebviewListeners) {
        originalSetupWebviewListeners(webview);
    }
    setupWebviewCredentialListeners(webview);
};

// Initialize credential manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize after a small delay to ensure TabManager is ready
    setTimeout(initCredentialManager, 100);
});

// Close autofill dropdown when clicking outside
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('autofill-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        hideAutofillDropdown();
    }
});
