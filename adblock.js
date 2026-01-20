/**
 * YarvixBrowser Ad Blocker Module
 * Similar to Brave's Shields - blocks ads, trackers, and unwanted content
 */

// Common ad/tracker domains (subset of EasyList)
const AD_DOMAINS = [
  // Google Ads
  'doubleclick.net',
  'googlesyndication.com',
  'googleadservices.com',
  'google-analytics.com',
  'googletagmanager.com',
  'googletagservices.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'tpc.googlesyndication.com',

  // YouTube Ad Domains (for blocking YouTube ads)
  // NOTE: Do NOT block 'ytimg.com' or 'yt3.ggpht.com' - they serve thumbnails and channel avatars
  'youtubekids.com', // YouTube Kids ad tracking

  // Facebook/Meta
  'facebook.com/tr',
  'connect.facebook.net/en_US/fbevents',
  'pixel.facebook.com',
  'an.facebook.com',

  // Amazon Ads
  'amazon-adsystem.com',
  'aax.amazon-adsystem.com',
  'fls-na.amazon-adsystem.com',

  // Microsoft/Bing Ads
  'bat.bing.com',
  'ads.microsoft.com',

  // Twitter/X Ads
  'ads-twitter.com',
  'analytics.twitter.com',
  'static.ads-twitter.com',

  // Common Ad Networks
  'adnxs.com',
  'advertising.com',
  'adsrvr.org',
  'adroll.com',
  'criteo.com',
  'criteo.net',
  'outbrain.com',
  'taboola.com',
  'mgid.com',
  'revcontent.com',
  'zergnet.com',
  'adcolony.com',
  'admob.com',
  'applovin.com',
  'unity3d.com/webview',
  'unityads.unity3d.com',
  'mopub.com',
  'vungle.com',
  'chartboost.com',
  'inmobi.com',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'spotxchange.com',
  'smartadserver.com',
  'media.net',
  'contextweb.com',
  'bidswitch.net',
  'casalemedia.com',
  'lijit.com',
  'sovrn.com',
  'sharethrough.com',
  'triplelift.com',
  'indexexchange.com',

  // Trackers
  'scorecardresearch.com',
  'quantserve.com',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'hotjar.com',
  'fullstory.com',
  'mouseflow.com',
  'crazyegg.com',
  'clicktale.com',
  'optimizely.com',
  'omtrdc.net',
  'demdex.net',
  'bluekai.com',
  'krxd.net',
  'exelator.com',
  'tapad.com',
  'rlcdn.com',
  'liveramp.com',
  'adsymptotic.com',
  'newrelic.com',
  'nr-data.net',

  // Pop-unders / Malvertising
  'propellerads.com',
  'popcash.net',
  'popads.net',
  'exoclick.com',
  'juicyads.com',
  'trafficjunky.com',
  'clickadu.com',
  'hilltopads.com',

  // Video Ads
  'imasdk.googleapis.com',
  'static.doubleclick.net',
  'ad.doubleclick.net',
  'pubads.g.doubleclick.net',

  // Tracking Pixels
  'pixel.wp.com',
  'stats.wp.com',
  'pixel.quantserve.com'
];

// URL patterns to block (regex patterns)
const BLOCK_PATTERNS = [
  /\/ads\//i,
  /\/ad\//i,
  /\/advertisement/i,
  /\/advert/i,
  /\/banner[_-]?ad/i,
  /\/pop[_-]?under/i,
  /\/pop[_-]?up/i,
  /\.gif\?.*ad/i,
  /\/sponsored/i,
  /\/tracking/i,
  /\/tracker/i,
  /\/pixel\./i,
  /\/beacon/i,
  /\/analytics\.js/i,
  /\/gtag\/js/i,
  /\/gtm\.js/i,
  /ad[_-]?server/i,
  /adserv/i,
  /doubleclick/i,
  /\/pagead\//i,
  /\/adsbygoogle/i,
  /google_ads/i,
  /prebid/i,
  /\/outbrain/i,
  /\/taboola/i,
  /\/mgid/i,

  // YouTube-specific ad blocking patterns (Brave-style)
  /[?&]ad_/i,
  /[?&]dae_/i,
  /[?&]投放 /i, // Chinese ad parameter
  /\/api\/stats\/ads/i,
  /\/get_midroll_info/i,
  /\/player_ads/i,
  /\/ads\.js/i,
  /\/ad_status/i,
  /\/youtubei\/v1\/ads/i,
  /\/v1\/postpublish/i,
  /\/ptracking/i,
  /\/attribution/i,
  /\/set_adsense_visiblity/i,
  /\/ivs\/set/i,
  /\/drm_license/i, // Sometimes used for ad verification
  /\/videotagsessio/i, // Ad-related tracking
  /\/watermark\/.*ad/i,
  /ytad/,
  /youtubeads/,
  /video_ad/,
  /adsegment/,
  /\/ad-stream/i,
  /\/preroll/i,
  /\/midroll/i,
  /\/postroll/i,
  /adfmt/,
  /adfmtc/,
  /\/htmlad\.swf/i,
  /\/ad\/[a-z]*\.js/i,
  /\/pubads/i,
  /\/gpt\/pubads/i,
  /\/companion_ad/i,
  /\/vast/,
  /\/vmap/,
  /\/ima3/i,
  /\/imasdk/i,
  /\/dai/,
  /\/oembed.*ad/i,
  /\/adbreak/i,
  /\/adstart/i,
  /\/adtimeshift/i,
  /\/adpause/i,
  /\/adresume/i,
  /\/adclick/i,
  /\/adimpression/i,
  /\/adview/,
  /\/advol/,
  /\/adver/,
  /\/adframe/,
  /\/adfeed/,
  /\/adlog/,
  /\/adcount/,
  /\/adcountdown/,
  /\/adsystem/,
  /\/adsense/,
  /\/adsinfo/,
  /\/adspeed/,
  /\/adstory/,
  /\/adtest/,
  /\/adtrack/,
  /\/adurl/,
  /\/adverify/,
  /\/adwatch/,
  /\/adzone/,
  /\/adword/,
  /\/adwork/,
  /\/sponsored_search/,
  /\/product_ads/,
  /\/shopping_ads/,
  /\/display_ads/,
  /\/text_ads/,
  /\/link_ads/,
  /\/video_ads/,
  /\/instream_ads/,
  /\/preroll_ads/,
  /\/overlay_ads/,
  /\/banner_ads/,
  /\/sticky_ads/,
  /\/popup_ads/,
  /\/interstitial_ads/,
  /\/native_ads/,
  /\/native_ad/,
  /\/content_ads/,
  /\/contextual_ads/,
  /\/matched_content/,
  /\/custom_ads/,
  /\/house_ads/,
  /\/remnant_ads/,
  /\/backfill_ads/,
  /\/deadnet_ads/
];

// Resource types to potentially block
const BLOCKABLE_RESOURCE_TYPES = [
  'script',
  'image',
  'stylesheet',
  'xmlhttprequest',
  'subFrame',
  'other'
];

// CSS selectors to hide ad elements (cosmetic filtering)
const COSMETIC_FILTERS = [
  // Generic ad containers
  '[id*="google_ads"]',
  '[id*="doubleclick"]',
  '[class*="ad-container"]',
  '[class*="ad-wrapper"]',
  '[class*="ad-banner"]',
  '[class*="ad-slot"]',
  '[class*="ad-unit"]',
  '[class*="advertisement"]',
  '[class*="sponsored-content"]',
  '[class*="promoted-content"]',
  '[data-ad]',
  '[data-ad-slot]',
  '[data-google-query-id]',

  // Common ad divs
  '.adsbygoogle',
  '.ad-placement',
  '.ad-block',
  '.banner-ad',
  '.sidebar-ad',
  '.native-ad',
  '.sponsored',
  '.promoted',
  '.dfp-ad',
  '.gpt-ad',

  // Social media embeds that track
  '[class*="fb-ad"]',
  '[class*="twitter-ad"]',

  // Video ads (be careful not to hide video player itself)
  '.preroll-ad',
  '.midroll-ad',
  '.postroll-ad',

  // Outbrain/Taboola widgets
  '.OUTBRAIN',
  '.taboola-widget',
  '[id*="taboola"]',
  '[id*="outbrain"]',
  '.mgid-widget',

  // Cookie notices (optional - can be toggled)
  // '.cookie-notice',
  // '.cookie-banner',
  // '.gdpr-banner'

  // YouTube-specific ad elements
  // IMPORTANT: Do NOT hide .html5-video-player, .video-ads, .ytp-button, etc. as they affect video playback
  '#player-ads',
  '.ytd-player-legacy-desktop-watch-ads',
  '.ytd-player-theater-legacy-watch-ads',
  // Hide ad overlays (not the skip button - we need to click it)
  '.ytp-ad-overlay-container',
  '.ytp-ad-text-overlay',
  '.ytp-ad-overlay-slot',
  '.ytp-ad-overlay-image',
  '.ytp-ad-image-overlay',
  '.ytp-ad-message-box',
  '.ytp-flyout-cta',
  '.ytp-flyout-cta-body',
  '.ytp-flyout-cta-image',
  '.ytp-flyout-cta-title',
  '.ytp-flyout-cta-description',
  '.ytp-cards-teaser',
  '.ytp-promotion-headline',
  '.ytp-promotion-item',
  '.ytp-promotion-shelf',
  // Hide annotations
  '.ytp-annotation',
  '.ytp-annotation-ink',
  // Hide playlist/companion ads
  '.ytd-companion-slot-renderer',
  '.ytd-display-ad-renderer',
  '.ytd-video-masthead-ad-v3-renderer',
  '.ytd-search-pypt-renderer',
  '.ytd-advertise-info-renderer',
  // Hide promo banners
  '.ytd-promo-banner-renderer',
  '.ytd-browse-above-hero',
  // Hide promotional content
  '.ytd-promoted-sparkles-tokens-renderer',
  '.ytd-promoted-sparkles-text-search-renderer',
  // Hide in-feed ads
  '.ytd-in-feed-ad-layout-renderer',
  '.ytd-carousel-ad-renderer',
  // Hide sponsored messages
  '.ytd-sponsorships-offer-renderer',
  '.ytd-sponsorships-alert-renderer',
  // Hide membership promos
  '.ytd-mealbar-promo-renderer',
  '.ytd-offer-module-renderer',
  '.ytd-premium-edu-promo-renderer',
  // Hide premium promos (just the buttons, not player controls)
  '.ytp-youtube-premium-button',
  '.ytp-premium-button',
  // Hide sponsored Live badges
  '.ytd-sponsorships-live-badge-renderer',
  // Hide search/homepage ads
  '.ytd-search-ads-renderer',
  // Hide music ads
  '.ytmusic-player-ads',
  '.ytmusic-nav-bar-ad',
  '.ytkids-ad',
  // Hide Shorts ads
  '.ytd-reel-shelf-ad-renderer',
  '.ytd-reel-player-overlay-ad-renderer',
  // Hide donation/merch shelves
  '.ytd-donation-shelf-renderer',
  '.ytd-merch-shelf-renderer',
  '.ytmusic-merch-shelf-renderer',
  '.ytmusic-premium-header-renderer',
  '.ytd-podcast-promo-renderer'
];

/**
 * AdBlocker class - handles all ad blocking logic
 */
class AdBlocker {
  constructor() {
    this.enabled = true;
    this.stats = {
      totalBlocked: 0,
      sessionBlocked: 0,
      blockedByTab: new Map()
    };
    this.whitelist = new Set();
    this.loadSettings();
  }

  loadSettings() {
    try {
      const stored = localStorage?.getItem('adBlockerSettings');
      if (stored) {
        const settings = JSON.parse(stored);
        this.enabled = settings.enabled !== false;
        this.whitelist = new Set(settings.whitelist || []);
        this.stats.totalBlocked = settings.totalBlocked || 0;
      }
    } catch (e) {
      // localStorage not available in main process - this is expected
      console.log('Ad blocker settings persistence requires renderer process');
    }
  }

  saveSettings() {
    try {
      localStorage?.setItem('adBlockerSettings', JSON.stringify({
        enabled: this.enabled,
        whitelist: Array.from(this.whitelist),
        totalBlocked: this.stats.totalBlocked
      }));
    } catch (e) {
      // localStorage not available in main process - this is expected
    }
  }

  /**
   * Check if a URL should be blocked
   * @param {string} url - The URL to check
   * @param {string} pageUrl - The page URL (for whitelist checking)
   * @returns {boolean} - True if should be blocked
   */
  shouldBlock(url, pageUrl = '') {
    if (!this.enabled) return false;

    // Check whitelist
    if (pageUrl && this.isWhitelisted(pageUrl)) {
      return false;
    }

    const urlLower = url.toLowerCase();

    // Check domain blocklist
    for (const domain of AD_DOMAINS) {
      if (urlLower.includes(domain)) {
        return true;
      }
    }

    // Check URL patterns
    for (const pattern of BLOCK_PATTERNS) {
      if (pattern.test(url)) {
        return true;
      }
    }

    // YouTube-specific blocking (Brave-style)
    if (this.isYouTubeRelated(url, pageUrl)) {
      return true;
    }

    return false;
  }

  /**
   * Check if URL is YouTube ad-related
   * @param {string} url - The URL to check
   * @param {string} pageUrl - The page URL
   * @returns {boolean}
   */
  isYouTubeRelated(url, pageUrl) {
    const urlLower = url.toLowerCase();

    // Check if this is a YouTube ad request
    // NOTE: Do NOT include 'ytimg.com' or 'yt3.ggpht.com' - they serve thumbnails and channel avatars
    const isYouTubeDomain = urlLower.includes('youtube.com') ||
                           urlLower.includes('googlevideo.com');

    if (!isYouTubeDomain) return false;

    // YouTube ad-related URL patterns
    const youtubeAdPatterns = [
      // Query parameters that indicate ads
      /[?&]ad_/,
      /[?&]dae_/,
      /[?&]投放/, // Chinese ad parameter

      // API endpoints for ads
      /\/api\/stats\/ads/,
      /\/get_midroll_info/,
      /\/player_ads/,
      /\/ads\.js/,
      /\/ad_status/,
      /\/youtubei\/v1\/ads/,
      /\/v1\/postpublish/,
      /\/ptracking/,
      /\/attribution/,
      /\/set_adsense_visiblity/,
      /\/ivs\/set/,
      /\/drm_license/,
      /\/videotagsessio/,
      /\/watermark\/.*ad/,

      // Ad tag patterns
      /ytad/,
      /youtubeads/,
      /video_ad/,
      /adsegment/,

      // Video ad patterns
      /\/ad-stream/,
      /\/preroll/,
      /\/midroll/,
      /\/postroll/,
      /adfmt/,
      /adfmtc/,
      /\/htmlad\.swf/,
      /\/ad\/[a-z]*\.js/,

      // Ad system patterns
      /\/pubads/,
      /\/gpt\/pubads/,
      /\/companion_ad/,
      /\/vast/,
      /\/vmap/,
      /\/ima3/,
      /\/imasdk/,
      /\/dai/,
      /\/oembed.*ad/,
      /\/adbreak/,
      /\/adstart/,
      /\/adtimeshift/,
      /\/adpause/,
      /\/adresume/,
      /\/adclick/,
      /\/adimpression/,
      /\/adview/,

      // Ad tracking patterns
      /\/adsystem/,
      /\/adsense/,
      /\/adsinfo/,
      /\/adspeed/,
      /\/adstory/,
      /\/adtest/,
      /\/adtrack/,
      /\/adurl/,
      /\/adverify/,
      /\/adwatch/,
      /\/adzone/,

      // Additional YouTube-specific patterns
      /\/ptracking\?.*video_id/,
      /\/attribution\?/,
      /\/get_ad_signals/,
      /\/ad_frag/,
      /\/ads\/.*\.js/,
      /\/creative\/.*\.js/,
      /\/load_ad/,
      /\/load_ads/,
      /\/show_ad/,
      /\/show_ads/,
      /\/trigger_ad/,
      /\/log_ad/,
      /\/ping_ad/,
      /\/ping_ads/,
      /\/track_ad/,
      /\/track_ads/
    ];

    for (const pattern of youtubeAdPatterns) {
      if (pattern.test(urlLower)) {
        return true;
      }
    }

    // Block YouTube API calls that are ad-related
    if (urlLower.includes('/youtubei/v1/player') || urlLower.includes('/api/player')) {
      // Check if this is an ad request by looking at the context
      // If the page is YouTube and URL contains certain ad-related parameters
      if (pageUrl && pageUrl.includes('youtube.com')) {
        // These endpoints can be used for ad tracking
        if (urlLower.includes('ad') || urlLower.includes('adformat')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a domain is whitelisted
   * @param {string} url - The URL to check
   * @returns {boolean}
   */
  isWhitelisted(url) {
    try {
      const hostname = new URL(url).hostname;
      return this.whitelist.has(hostname);
    } catch {
      return false;
    }
  }

  /**
   * Add a domain to whitelist
   * @param {string} domain - The domain to whitelist
   */
  addToWhitelist(domain) {
    this.whitelist.add(domain);
    this.saveSettings();
  }

  /**
   * Remove a domain from whitelist
   * @param {string} domain - The domain to remove
   */
  removeFromWhitelist(domain) {
    this.whitelist.delete(domain);
    this.saveSettings();
  }

  /**
   * Toggle ad blocker on/off
   * @returns {boolean} - New state
   */
  toggle() {
    this.enabled = !this.enabled;
    this.saveSettings();
    return this.enabled;
  }

  /**
   * Record a blocked request
   * @param {string} tabId - The tab ID
   */
  recordBlocked(tabId) {
    this.stats.sessionBlocked++;
    this.stats.totalBlocked++;

    const currentCount = this.stats.blockedByTab.get(tabId) || 0;
    this.stats.blockedByTab.set(tabId, currentCount + 1);

    // Save periodically (every 10 blocks)
    if (this.stats.sessionBlocked % 10 === 0) {
      this.saveSettings();
    }
  }

  /**
   * Get blocked count for a tab
   * @param {string} tabId - The tab ID
   * @returns {number}
   */
  getBlockedCount(tabId) {
    return this.stats.blockedByTab.get(tabId) || 0;
  }

  /**
   * Reset tab stats (called when tab navigates)
   * @param {string} tabId - The tab ID
   */
  resetTabStats(tabId) {
    this.stats.blockedByTab.set(tabId, 0);
  }

  /**
   * Get CSS for cosmetic filtering
   * @returns {string}
   */
  getCosmeticFilterCSS() {
    return COSMETIC_FILTERS.map(selector => `${selector} { display: none !important; }`).join('\n');
  }

  /**
   * Get JavaScript for additional ad blocking
   * @returns {string}
   */
  getContentScript() {
    return `
      (function() {
        // Skip if already injected
        if (window.__yarvixAdBlocker) return;
        window.__yarvixAdBlocker = true;

        // Detect YouTube for special handling
        const isYouTube = window.location.hostname.includes('youtube.com') ||
                          window.location.hostname.includes('googlevideo.com');

        // YouTube-specific ad blocking (Brave-style)
        if (isYouTube) {
          // Block YouTube ad-related functions by overriding them
          const originalCreateElement = document.createElement.bind(document);
          document.createElement = function(tagName) {
            const element = originalCreateElement(tagName);
            if (tagName.toLowerCase() === 'script') {
              const originalSetAttribute = element.setAttribute.bind(element);
              element.setAttribute = function(name, value) {
                // Block known YouTube ad script patterns
                const blockedPatterns = [
                  'adservice', 'doubleclick', 'googlesyndication',
                  'pagead2', 'adsbygoogle', 'ytads', 'youtubeads',
                  'imasdk', 'ima3', 'googletagservices',
                  'player_ads', 'ads.js', 'ad_status',
                  'midroll', 'preroll', 'postroll',
                  'get_midroll_info', 'api/stats/ads',
                  'youtubei/v1/ads', 'ptracking',
                  'attribution', 'adbreak', 'adstart',
                  'vast', 'vmap', 'dai', 'ima'
                ];
                if (name === 'src' && value) {
                  const valueLower = value.toLowerCase();
                  for (const pattern of blockedPatterns) {
                    if (valueLower.includes(pattern.toLowerCase())) {
                      console.log('[YarvixBrowser] Blocked YouTube ad script:', value);
                      return;
                    }
                  }
                }
                return originalSetAttribute(name, value);
              };
            }
            return element;
          };

          // Block eval-based ad loading
          const originalEval = window.eval;
          window.eval = function(code) {
            if (code && typeof code === 'string') {
              const blockedPatterns = [
                'adservice', 'doubleclick', 'googlesyndication',
                'ytads', 'youtubeads', 'player_ads',
                'ads.js', 'midroll_info', 'vast', 'vmap',
                'ima3', 'imasdk', 'adbreak', 'getAd',
                'adPod', 'adUnit', 'adSegment'
              ];
              for (const pattern of blockedPatterns) {
                if (code.toLowerCase().includes(pattern.toLowerCase())) {
                  console.log('[YarvixBrowser] Blocked YouTube ad eval:', pattern);
                  return;
                }
              }
            }
            return originalEval(code);
          };

          // Block fetch requests for ads
          if (window.fetch) {
            const originalFetch = window.fetch;
            window.fetch = function(input, init) {
              const url = typeof input === 'string' ? input : input?.url;
              if (url) {
                const blockedPatterns = [
                  '/ads/', '/ad/', '/ads?', '/ad?',
                  'googlesyndication', 'doubleclick',
                  'youtubei/v1/ads', 'api/stats/ads',
                  'get_midroll', 'ptracking', 'attribution',
                  'player_ads', 'ads.js', 'ad_status',
                  'imasdk', 'ima3', 'vast', 'vmap',
                  'preroll', 'midroll', 'postroll',
                  'dai', 'ima', 'adbreak', 'adstart',
                  'watermark', 'adfmt', 'adsegment'
                ];
                const urlLower = url.toLowerCase();
                for (const pattern of blockedPatterns) {
                  if (urlLower.includes(pattern.toLowerCase())) {
                    console.log('[YarvixBrowser] Blocked YouTube ad fetch:', url);
                    return new Response(new Blob(), { status: 403 });
                  }
                }
              }
              return originalFetch(input, init);
            };
          }

          // Block XMLHttpRequest for ads
          if (window.XMLHttpRequest) {
            const originalOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              const blockedPatterns = [
                '/ads/', '/ad/', '/ads?', '/ad?',
                'googlesyndication', 'doubleclick',
                'youtubei/v1/ads', 'api/stats/ads',
                'get_midroll', 'ptracking', 'attribution',
                'player_ads', 'ads.js', 'ad_status',
                'imasdk', 'ima3', 'vast', 'vmap',
                'preroll', 'midroll', 'postroll',
                'dai', 'ima', 'adbreak', 'adstart'
              ];
              if (url) {
                const urlLower = url.toLowerCase();
                for (const pattern of blockedPatterns) {
                  if (urlLower.includes(pattern.toLowerCase())) {
                    console.log('[YarvixBrowser] Blocked YouTube ad XHR:', url);
                    this.abort();
                    return;
                  }
                }
              }
              return originalOpen.apply(this, arguments);
            };
          }

          // Aggressively remove YouTube ad elements
          const removeYouTubeAds = () => {
            // Skip button (appears when ads are playing)
            const skipButtons = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-container, .ytp-skip-ad-button');
            skipButtons.forEach(btn => {
              if (btn) {
                // Click the skip button if it exists
                btn.click();
                btn.remove();
              }
            });

            // Remove ad overlays
            const adOverlays = document.querySelectorAll(
              '.ytp-ad-player-overlay, .ytp-ad-preview, .ytp-ad-message-box, ' +
              '.ytp-ad-progress, .ytp-ad-text, .ytp-ad-image, ' +
              '.ytp-ad-duration-remaining, .ytp-ad-progress-list, ' +
              '.ytp-ad-button, .ytp-ad-button-icon, .ytp-ad-button-text, ' +
              '.ytp-flyout-cta, .ytp-flyout-cta-body, .ytp-flyout-cta-image, ' +
              '.ytp-flyout-cta-title, .ytp-flyout-cta-description'
            );
            adOverlays.forEach(el => el.style.display = 'none');

            // Remove cards and teasers that are ads
            const cardTeasers = document.querySelectorAll(
              '.ytp-cards-teaser, .ytp-cards-teaser-image, ' +
              '.ytp-cards-teaser-title, .ytp-cards-teaser-text, ' +
              '.ytp-card, .ytp-card-teaser, .ytp-card-content'
            );
            cardTeasers.forEach(el => el.style.display = 'none');

            // Remove promotion content
            const promotions = document.querySelectorAll(
              '.ytp-promotion-headline, .ytp-promotion-item, ' +
              '.ytp-promotion-shelf, .ytp-modified-annotations'
            );
            promotions.forEach(el => el.style.display = 'none');

            // Remove annotations
            const annotations = document.querySelectorAll('.ytp-annotation, .ytp-annotation-ink');
            annotations.forEach(el => el.style.display = 'none');

            // Remove end screen elements that are ads
            const endScreens = document.querySelectorAll('.ytp-endscreen-element, .ytp-endscreen-element-content');
            endScreens.forEach(el => el.style.display = 'none');

            // Remove action panels
            const actionPanels = document.querySelectorAll('.ytp-action-panel, .ytp-action-panel-content');
            actionPanels.forEach(el => el.style.display = 'none');

            // Remove "Learn More" buttons
            const learnMoreButtons = document.querySelectorAll('.ytp-button:has-text("Learn More"), .ytp-button:has-text("Ad"), .ytp-button:has-text("Advertisement")');
            learnMoreButtons.forEach(el => el.style.display = 'none');

            // Remove YouTube Premium buttons
            const premiumButtons = document.querySelectorAll(
              '.ytp-youtube-premium-button, .ytp-premium-button, ' +
              '.ytp-paid-msg-subtitle, .ytp-paid-membership-cta'
            );
            premiumButtons.forEach(el => el.style.display = 'none');

            // Remove poll/survey overlays
            const polls = document.querySelectorAll('.ytp-poll, .ytp-poll-choice, .ytp-survey, .ytp-teaser');
            polls.forEach(el => el.style.display = 'none');

            // Remove paid badges
            const paidBadges = document.querySelectorAll('.ytp-paid, .ytp-badge');
            paidBadges.forEach(el => el.style.display = 'none');

            // Remove suggested videos in ad context
            const suggestedInAd = document.querySelectorAll('.ytp-suggested-renderer');
            suggestedInAd.forEach(el => el.style.display = 'none');

            // Hide entire player when ad is playing (alternative approach)
            const adPlaying = document.querySelector('.ytp-ad-active');
            if (adPlaying) {
              const player = document.querySelector('.html5-video-player');
              if (player) {
                player.style.opacity = '0.1';
                setTimeout(() => player.style.opacity = '1', 5000);
              }
            }

            // Remove ad container elements in the player
            const adContainers = document.querySelectorAll(
              '#player-ads, .ad-container, .ad-box, .ad-slot, .adsquare, ' +
              '.video-ads, .ytd-player-legacy-desktop-watch-ads, ' +
              '.ytd-player-theater-legacy-watch-ads'
            );
            adContainers.forEach(el => el.style.display = 'none');

            // Remove ad-related iframes
            document.querySelectorAll('iframe').forEach(iframe => {
              const src = iframe.src || '';
              const blockedPatterns = [
                'doubleclick', 'googlesyndication', 'googletagservices',
                'adservice', 'pagead2', 'adsbygoogle', 'ima3',
                'imasdk', 'vast', 'vmap', 'dai', 'preroll',
                'midroll', 'postroll', 'player_ads', 'ads.js',
                'ad_status', 'watermark', 'adfmt', 'adsegment'
              ];
              const srcLower = src.toLowerCase();
              for (const pattern of blockedPatterns) {
                if (srcLower.includes(pattern.toLowerCase())) {
                  iframe.remove();
                  break;
                }
              }
            });

            // Remove ad-related divs
            const adDivs = document.querySelectorAll(
              '.ytd-companion-slot-renderer, .ytd-display-ad-renderer, ' +
              '.ytd-video-masthead-ad-v3-renderer, .ytd-search-pypt-renderer, ' +
              '.ytd-advertise-info-renderer, .ytd-shelf-renderer, ' +
              '.ytd-promo-banner-renderer, .ytd-browse-above-hero, ' +
              '.ytd-promoted-sparkles-tokens-renderer, ' +
              '.ytd-promoted-sparkles-text-search-renderer, ' +
              '.ytd-in-feed-ad-layout-renderer, .ytd-carousel-ad-renderer, ' +
              '.ytd-ab4r-container-for-music-home-page, ' +
              '.ytd-sponsorships-offer-renderer, .ytd-sponsorships-alert-renderer, ' +
              '.ytd-shopping-product-details, .ytd-mealbar-promo-renderer, ' +
              '.ytd-offer-module-renderer, .ytd-premium-edu-promo-renderer, ' +
              '.ytd-announcement, .ypc-meets-card, .ytd-sponsorships-live-badge-renderer'
            );
            adDivs.forEach(el => el.style.display = 'none');

            // Remove homepage and search ads
            const searchAds = document.querySelectorAll(
              '.ytd-search-ads-renderer, .ytd-homepage-stories-primary-info-renderer'
            );
            searchAds.forEach(el => el.style.display = 'none');

            // Remove Shorts ads
            const shortsAds = document.querySelectorAll(
              '.ytd-reel-shelf-ad-renderer, .ytd-reel-player-overlay-ad-renderer'
            );
            shortsAds.forEach(el => el.style.display = 'none');

            // Remove music ads
            const musicAds = document.querySelectorAll(
              '.ytmusic-player-ads, .ytmusic-nav-bar-ad, .ytkids-ad, ' +
              '.ytmusic-merch-shelf-renderer, .ytmusic-premium-header-renderer'
            );
            musicAds.forEach(el => el.style.display = 'none');

            // Remove donation/merch/promo content
            const promoContent = document.querySelectorAll(
              '.ytd-feed-nudge-renderer, .ytd-live-chat-tip-shoppable-product, ' +
              '.ytd-donation-shelf-renderer, .ytd-merch-shelf-renderer, ' +
              '.ytd-podcast-promo-renderer, .ytd-educational-overlay-renderer, ' +
              '.ytd-trending-now-movie-offer-renderer, ' +
              '.ytd-enforcement-notice-view-model'
            );
            promoContent.forEach(el => el.style.display = 'none');

            // Remove YouTube Premium CTA from video player
            const premiumCTA = document.querySelectorAll(
              '.ytp-youtube-premium-button, .ytp-premium-button, ' +
              '[aria-label*="YouTube Premium"], [title*="YouTube Premium"]'
            );
            premiumCTA.forEach(el => el.style.display = 'none');

            // Click skip button if it appears
            const skipBtn = document.querySelector('.ytp-ad-skip-button');
            if (skipBtn) {
              skipBtn.click();
            }

            // Hide ad when playing by simulating click on video
            const adPlayingIndicator = document.querySelector('.ytp-ad-active');
            if (adPlayingIndicator) {
              const video = document.querySelector('video');
              if (video) {
                // Pause and restart video
                video.pause();
                video.currentTime += 0.1;
                video.play().catch(() => {});
              }
            }
          };

          // Run immediately on YouTube
          removeYouTubeAds();

          // Run on DOM changes with debouncing
          let youtubeAdBlockTimeout;
          const youtubeObserver = new MutationObserver((mutations) => {
            clearTimeout(youtubeAdBlockTimeout);
            youtubeAdBlockTimeout = setTimeout(() => {
              requestAnimationFrame(removeYouTubeAds);
            }, 100);
          });

          youtubeObserver.observe(document.body || document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style', 'hidden']
          });

          // Also monitor for YouTube's SPA navigation
          const urlObserver = new MutationObserver(() => {
            const currentUrl = window.location.href;
            if (currentUrl !== window.__lastYoutubeUrl) {
              window.__lastYoutubeUrl = currentUrl;
              setTimeout(removeYouTubeAds, 500);
            }
          });

          urlObserver.observe(document.documentElement, {
            childList: true,
            subtree: true
          });
        }

        // Remove ad elements (generic)
        const removeAds = () => {
          const selectors = ${JSON.stringify(COSMETIC_FILTERS)};
          selectors.forEach(selector => {
            try {
              document.querySelectorAll(selector).forEach(el => {
                el.style.display = 'none';
                el.remove();
              });
            } catch(e) {}
          });

          // Remove iframes with ad-related sources
          document.querySelectorAll('iframe').forEach(iframe => {
            const src = iframe.src || '';
            if (src.includes('doubleclick') ||
                src.includes('googlesyndication') ||
                src.includes('adservice') ||
                src.includes('/ads/') ||
                src.includes('ad.') ||
                src.includes('advertising') ||
                src.includes('pagead') ||
                src.includes('adsbygoogle') ||
                src.includes('ima3') ||
                src.includes('imasdk') ||
                src.includes('vast') ||
                src.includes('vmap') ||
                src.includes('preroll') ||
                src.includes('midroll') ||
                src.includes('postroll') ||
                src.includes('dai') ||
                src.includes('player_ads') ||
                src.includes('watermark')) {
              iframe.remove();
            }
          });
        };

        // Run immediately
        removeAds();

        // Run on DOM changes
        const observer = new MutationObserver((mutations) => {
          let shouldClean = false;
          for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
              shouldClean = true;
              break;
            }
          }
          if (shouldClean) {
            requestAnimationFrame(removeAds);
          }
        });

        observer.observe(document.body || document.documentElement, {
          childList: true,
          subtree: true
        });

        // Block popup windows
        const originalOpen = window.open;
        window.open = function(url, name, features) {
          if (url && (
            url.includes('ad') ||
            url.includes('popup') ||
            url.includes('click') ||
            !url.includes(location.hostname)
          )) {
            console.log('[YarvixBrowser] Blocked popup:', url);
            return null;
          }
          return originalOpen.call(window, url, name, features);
        };

        // Prevent ad scripts from loading (generic)
        const originalCreateElementGeneric = document.createElement;
        document.createElement = function(tagName) {
          const element = originalCreateElementGeneric.call(document, tagName);
          if (tagName.toLowerCase() === 'script') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
              if (name === 'src' && value) {
                const blockedDomains = ['doubleclick', 'googlesyndication', 'googleadservices', 'adsbygoogle', 'pagead', 'ima3', 'imasdk', 'vast', 'vmap', 'dai', 'preroll', 'midroll', 'postroll', 'player_ads', 'ytads', 'youtubeads', 'watermark', 'adfmt'];
                for (const domain of blockedDomains) {
                  if (value.includes(domain)) {
                    console.log('[YarvixBrowser] Blocked script:', value);
                    return;
                  }
                }
              }
              return originalSetAttribute.call(element, name, value);
            };
          }
          return element;
        };

        console.log('[YarvixBrowser] Ad blocker active');
      })();
    `;
  }

  /**
   * Get statistics
   * @returns {Object}
   */
  getStats() {
    return {
      enabled: this.enabled,
      sessionBlocked: this.stats.sessionBlocked,
      totalBlocked: this.stats.totalBlocked,
      whitelistCount: this.whitelist.size
    };
  }
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdBlocker, AD_DOMAINS, BLOCK_PATTERNS, COSMETIC_FILTERS };
} else if (typeof window !== 'undefined') {
  window.AdBlocker = AdBlocker;
  window.AD_DOMAINS = AD_DOMAINS;
  window.BLOCK_PATTERNS = BLOCK_PATTERNS;
  window.COSMETIC_FILTERS = COSMETIC_FILTERS;
}
