const { app, BrowserWindow, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

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

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});