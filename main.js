const { app, BrowserWindow, session, ipcMain, contentTracing } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

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

  // --- DOWNLOAD MANAGER LOGIC ---
  // Handle downloads from main window
  setupDownloadHandler(mainWindow.webContents.session);

  // Handle downloads from webviews (they use the default session)
  setupDownloadHandler(session.defaultSession);
}

app.whenReady().then(async () => {
  createWindow();
  
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
