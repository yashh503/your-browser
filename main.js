const { app, BrowserWindow, session, ipcMain, contentTracing } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { AdBlocker, AD_DOMAINS, BLOCK_PATTERNS } = require('./adblock');

// Initialize Ad Blocker
const adBlocker = new AdBlocker();

// Use a real Chrome User-Agent to make websites work normally
const CHROME_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Add command-line flags for better website compatibility (like Chrome)
app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors');
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('allow-running-insecure-content');
app.commandLine.appendSwitch('disable-web-security', 'false'); // Keep security but be more lenient

// Suppress known non-fatal Chromium errors related to service worker database issues
// These errors occur due to corrupted IndexedDB files but don't crash the application
process.on('uncaughtException', (error) => {
  if (error.message && error.message.includes('service_worker_storage')) {
    console.warn('Suppressed service worker storage error:', error.message);
    return; // Don't crash the app for these non-fatal errors
  }
  throw error;
});

/**
 * Clean up corrupted service worker database files
 * This helps prevent "Failed to delete the database: Database IO error" errors
 */
function cleanupServiceWorkerData() {
  const userDataPath = app.getPath('userData');
  const serviceWorkerPath = path.join(userDataPath, 'ServiceWorker');
  
  // Also check for IndexedDB in the GPU process directory
  const gpuPath = path.join(userDataPath, 'GPUCache');
  const databasesPath = path.join(userDataPath, 'databases');
  
  const pathsToClean = [serviceWorkerPath, databasesPath];
  
  pathsToClean.forEach(p => {
    try {
      if (fs.existsSync(p)) {
        const stats = fs.statSync(p);
        if (stats.isDirectory()) {
          // Rename folder to trigger fresh creation
          const backupPath = p + '.backup.' + Date.now();
          fs.renameSync(p, backupPath);
          console.log(`Backed up corrupted data: ${p} -> ${backupPath}`);
        }
      }
    } catch (err) {
      console.warn('Failed to clean up service worker data:', err.message);
    }
  });
}

// Run cleanup before app is ready to prevent errors during startup
if (app.isReady()) {
  cleanupServiceWorkerData();
} else {
  app.on('will-ready', cleanupServiceWorkerData);
}

let mainWindow;

function resolveScreenshotFolder() {
  if (process.platform === 'darwin') {
    try {
      // Respect custom screenshot location if set
      const output = execSync('defaults read com.apple.screencapture location', { encoding: 'utf8' }).trim();
      if (output) {
        return output.startsWith('~') ? path.join(os.homedir(), output.slice(1)) : output;
      }
    } catch (err) {
      // Fall back to Desktop if defaults fails or key missing
    }
    return path.join(os.homedir(), 'Desktop');
  }

  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'Pictures', 'Screenshots');
  }

  return path.join(os.homedir(), 'Pictures');
}

function watchScreenCaptures(targetWindow) {
  const folder = resolveScreenshotFolder();
  if (!fs.existsSync(folder)) {
    console.warn(`Screenshot/watch folder does not exist: ${folder}`);
    return;
  }

  // Track watcher so it can be cleaned up later if needed
  const watcher = fs.watch(folder, { persistent: false }, (eventType, filename) => {
    if (!filename || eventType !== 'rename') return;

    const lower = filename.toLowerCase();
    const isScreenshot = lower.includes('screenshot') || lower.includes('screen shot');
    const isRecording = lower.includes('screen recording') || lower.endsWith('.mov') || lower.endsWith('.mp4');

    if (!isScreenshot && !isRecording) return;

    targetWindow?.webContents.send('system-capture-detected', {
      kind: isRecording ? 'recording' : 'screenshot',
      filePath: path.join(folder, filename)
    });
  });

  targetWindow.on('closed', () => watcher.close());
}

function setupDownloadHandler(sess) {
  sess.on('will-download', (event, item, webContents) => {
    const fileName = item.getFilename();
    const totalBytes = item.getTotalBytes();

    // Notify UI that download started
    mainWindow.webContents.send('download-start', { fileName });

    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        console.log('Download is interrupted but can be resumed');
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download is paused');
        } else {
          // Send progress to UI
          const progress = item.getReceivedBytes() / totalBytes;
          mainWindow.webContents.send('download-progress', { fileName, progress });
        }
      }
    });

    item.once('done', (event, state) => {
      if (state === 'completed') {
        mainWindow.webContents.send('download-complete', {
            fileName,
            path: item.getSavePath()
        });
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: 'hiddenInset', // Shows macOS traffic lights inline
    trafficLightPosition: { x: 12, y: 12 }, // Position traffic lights
    webPreferences: {
      webviewTag: true,
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Prevent this window from being captured in screenshots or screen recording
  // (supported on macOS and Windows; other platforms may ignore this)
  mainWindow.setContentProtection(true);

  mainWindow.loadFile('index.html');

  // Handle keyboard shortcuts at the main window level
  // This ensures shortcuts work even when focus is inside a webview
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;

    const cmdOrCtrl = input.meta || input.control;
    const shift = input.shift;
    const key = input.key.toLowerCase();

    // Define shortcuts that should be handled by the renderer
    const browserShortcuts = [
      { keys: ['t'], cmdCtrl: true, shift: false },  // New tab
      { keys: ['w'], cmdCtrl: true, shift: false },  // Close tab
      { keys: ['t'], cmdCtrl: true, shift: true },   // Reopen closed tab
      { keys: ['r'], cmdCtrl: true, shift: false },  // Refresh
      { keys: ['l'], cmdCtrl: true, shift: false },  // Focus URL bar
      { keys: ['d'], cmdCtrl: true, shift: false },  // Bookmark
      { keys: ['f'], cmdCtrl: true, shift: false },  // Find
      { keys: ['n'], cmdCtrl: true, shift: false },  // New window
      { keys: ['tab'], cmdCtrl: true, shift: false }, // Next tab
      { keys: ['tab'], cmdCtrl: true, shift: true },  // Previous tab
      { keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9'], cmdCtrl: true, shift: false }, // Switch to tab
    ];

    for (const shortcut of browserShortcuts) {
      const keyMatches = shortcut.keys.includes(key);
      const cmdCtrlMatches = shortcut.cmdCtrl === cmdOrCtrl;
      const shiftMatches = shortcut.shift === shift;

      if (keyMatches && cmdCtrlMatches && shiftMatches) {
        // Send the shortcut to the renderer process to handle
        mainWindow.webContents.send('browser-shortcut', { key, cmdOrCtrl, shift });
        event.preventDefault();
        return;
      }
    }
  });

  // --- DOWNLOAD MANAGER LOGIC ---
  // Handle downloads from main window
  setupDownloadHandler(mainWindow.webContents.session);

  // Handle downloads from webviews (they use the default session)
  setupDownloadHandler(session.defaultSession);
}

app.whenReady().then(async () => {
  // Configure the default session to behave like a normal browser
  const defaultSession = session.defaultSession;

  // Set User-Agent to match Chrome - this is the KEY fix for website compatibility
  defaultSession.setUserAgent(CHROME_USER_AGENT);

  // Set proper web request headers to appear as a normal browser
  defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
    // Remove Electron-specific headers that some sites block
    delete details.requestHeaders['X-Electron'];
    callback({ requestHeaders: details.requestHeaders });
  });

  // ========================================
  // AD BLOCKER - Request Filtering
  // ========================================
  defaultSession.webRequest.onBeforeRequest((details, callback) => {
    // Skip if ad blocker is disabled
    if (!adBlocker.enabled) {
      callback({ cancel: false });
      return;
    }

    const url = details.url;
    const resourceType = details.resourceType;

    // Skip first-party main frame requests
    if (resourceType === 'mainFrame') {
      callback({ cancel: false });
      return;
    }

    // Check if URL should be blocked
    const shouldBlock = adBlocker.shouldBlock(url, details.referrer || '');

    if (shouldBlock) {
      // Record the blocked request
      adBlocker.recordBlocked(details.webContentsId?.toString() || 'unknown');

      // Send update to renderer
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ad-blocked', {
          url: url,
          type: resourceType,
          webContentsId: details.webContentsId?.toString() || null,
          stats: adBlocker.getStats()
        });
      }

      callback({ cancel: true });
      return;
    }

    callback({ cancel: false });
  });

  // Handle certificate errors more gracefully (like Chrome does)
  defaultSession.setCertificateVerifyProc((request, callback) => {
    // Accept valid certificates
    callback(0); // 0 means success, -2 means reject, -3 means use default behavior
  });

  createWindow();

  // Listen for keyboard shortcuts from ALL webContents (including webviews)
  // This is the reliable way to capture shortcuts when focus is inside a webview
  app.on('web-contents-created', (_event, contents) => {
    // Handle new window requests (Cmd+click, target="_blank", window.open)
    // This intercepts ALL new window requests from webviews and opens them in a new tab instead
    contents.setWindowOpenHandler(({ url }) => {
      // Send the URL to the renderer to create a new tab
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('create-tab-with-url', url);
      }
      return { action: 'deny' }; // Prevent the new window from being created
    });

    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      const cmdOrCtrl = input.meta || input.control;
      const shift = input.shift;
      const key = input.key.toLowerCase();

      // Define browser shortcuts
      const shortcuts = [
        { key: 't', cmdCtrl: true, shift: false },
        { key: 'w', cmdCtrl: true, shift: false },
        { key: 't', cmdCtrl: true, shift: true },
        { key: 'r', cmdCtrl: true, shift: false },
        { key: 'l', cmdCtrl: true, shift: false },
        { key: 'd', cmdCtrl: true, shift: false },
        { key: 'f', cmdCtrl: true, shift: false },
        { key: 'n', cmdCtrl: true, shift: false },
        { key: 'tab', cmdCtrl: true, shift: false },
        { key: 'tab', cmdCtrl: true, shift: true },
        { key: '1', cmdCtrl: true, shift: false },
        { key: '2', cmdCtrl: true, shift: false },
        { key: '3', cmdCtrl: true, shift: false },
        { key: '4', cmdCtrl: true, shift: false },
        { key: '5', cmdCtrl: true, shift: false },
        { key: '6', cmdCtrl: true, shift: false },
        { key: '7', cmdCtrl: true, shift: false },
        { key: '8', cmdCtrl: true, shift: false },
        { key: '9', cmdCtrl: true, shift: false },
      ];

      for (const shortcut of shortcuts) {
        if (key === shortcut.key && cmdOrCtrl === shortcut.cmdCtrl && shift === shortcut.shift) {
          // Send to the main window's renderer
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('browser-shortcut', { key, cmdOrCtrl, shift });
            event.preventDefault();
          }
          return;
        }
      }
    });
  });
  
  // Clear corrupted service worker data immediately on startup
  // This helps prevent the "Failed to delete the database: Database IO error" issue
  try {
    const sessions = [session.defaultSession];
    for (const sess of sessions) {
      try {
        await sess.clearStorageData({
          storages: ['serviceworkers', 'indexdb', 'cachestorage']
        });
        console.log('Service worker data cleared on startup');
      } catch (err) {
        // Ignore errors during startup clearing - the error might persist but won't crash
        console.warn('Startup service worker clear warning:', err.message);
      }
    }
  } catch (err) {
    console.warn('Failed to clear service worker data on startup:', err.message);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC Handler for creating new window
ipcMain.on('create-new-window', () => {
  createWindow();
});

// IPC Handler for opening URL in new tab (from Cmd+click)
ipcMain.on('open-url-in-new-tab', (_event, url) => {
  // Forward to the main window's renderer to create a new tab
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('create-tab-with-url', url);
  }
});

// IPC Handler for clearing service worker data
ipcMain.on('clear-service-worker-data', async () => {
  try {
    // Clear service worker data for all sessions
    const sessions = [session.defaultSession, ...app.windows().map(w => w.webContents.session)];
    const uniqueSessions = [...new Set(sessions)];
    
    for (const sess of uniqueSessions) {
      try {
        await sess.clearStorageData({
          storages: ['serviceworkers', 'indexdb', 'cachestorage']
        });
      } catch (err) {
        console.warn('Failed to clear service worker data for session:', err.message);
      }
    }
    
    mainWindow?.webContents.send('service-worker-data-cleared', { success: true });
  } catch (error) {
    console.error('Error clearing service worker data:', error);
    mainWindow?.webContents.send('service-worker-data-cleared', { success: false, error: error.message });
  }
});

// IPC Handler for getting service worker count
ipcMain.on('get-service-worker-info', async () => {
  try {
    const serviceWorkers = session.defaultSession.serviceWorkers;
    mainWindow?.webContents.send('service-worker-info', {
      count: serviceWorkers ? Object.keys(serviceWorkers).length : 0
    });
  } catch (error) {
    mainWindow?.webContents.send('service-worker-info', { count: 0 });
  }
});

// ========================================
// AD BLOCKER IPC HANDLERS
// ========================================

// Toggle ad blocker on/off
ipcMain.on('adblock-toggle', () => {
  const newState = adBlocker.toggle();
  mainWindow?.webContents.send('adblock-state-changed', {
    enabled: newState,
    stats: adBlocker.getStats()
  });
});

// Get ad blocker stats
ipcMain.on('adblock-get-stats', () => {
  mainWindow?.webContents.send('adblock-stats', adBlocker.getStats());
});

// Add domain to whitelist
ipcMain.on('adblock-whitelist-add', (_event, domain) => {
  adBlocker.addToWhitelist(domain);
  mainWindow?.webContents.send('adblock-whitelist-updated', {
    whitelist: Array.from(adBlocker.whitelist)
  });
});

// Remove domain from whitelist
ipcMain.on('adblock-whitelist-remove', (_event, domain) => {
  adBlocker.removeFromWhitelist(domain);
  mainWindow?.webContents.send('adblock-whitelist-updated', {
    whitelist: Array.from(adBlocker.whitelist)
  });
});

// Get whitelist
ipcMain.on('adblock-get-whitelist', () => {
  mainWindow?.webContents.send('adblock-whitelist', {
    whitelist: Array.from(adBlocker.whitelist)
  });
});

// Get content script for injection
ipcMain.on('adblock-get-content-script', () => {
  mainWindow?.webContents.send('adblock-content-script', {
    script: adBlocker.getContentScript(),
    css: adBlocker.getCosmeticFilterCSS(),
    enabled: adBlocker.enabled
  });
});

// IPC Handler for clearing all site data (cookies, sessions, storage)
ipcMain.on('clear-site-data', async () => {
  try {
    const defaultSession = session.defaultSession;

    // Clear all storage data
    await defaultSession.clearStorageData({
      storages: [
        'cookies',
        'localstorage',
        'sessionstorage',
        'indexdb',
        'websql',
        'serviceworkers',
        'cachestorage'
      ]
    });

    // Clear cache
    await defaultSession.clearCache();

    // Clear auth cache
    await defaultSession.clearAuthCache();

    console.log('[YarvixBrowser] All site data cleared successfully');
    mainWindow?.webContents.send('site-data-cleared', { success: true });
  } catch (error) {
    console.error('[YarvixBrowser] Error clearing site data:', error);
    mainWindow?.webContents.send('site-data-cleared', { success: false, error: error.message });
  }
});
