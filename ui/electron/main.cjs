const { app, BrowserWindow, shell } = require('electron');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

// Ensure unique isolated user data directory to prevent Chrome singleton lock conflicts
const appDataDir = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : '/var/local');
app.setPath('userData', path.join(appDataDir, 'JARVIS_2_0_Desktop'));

// Avoid GPU cache lock collisions on Windows and allow seamless TTS voice playback
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let mainWindow = null;
let backendProcess = null;

// Function to check if backend is already listening
function checkBackendAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8787/api/v1/runtime/status', {
      headers: { 'Authorization': 'Bearer dev_token_or_paired_token' }
    }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(800, () => {
      req.destroy();
      resolve(false);
    });
  });
}

// Ensure JARVIS backend is running in the background without any console window
async function ensureBackendRunning() {
  const isAlive = await checkBackendAlive();
  if (isAlive) {
    return;
  }

  const rootDir = path.resolve(__dirname, '..', '..');
  const binScript = path.join(rootDir, 'dist', 'cli', 'bin.js');

  backendProcess = spawn('node', [binScript, 'start'], {
    cwd: rootDir,
    detached: false,
    stdio: 'ignore',
    windowsHide: true
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start background backend:', err);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'JARVIS 2.0 — Orchestrator Studio',
    backgroundColor: '#04070a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false // Allows loading local file:// while calling http://127.0.0.1:8787
    },
  });

  const distIndexPath = path.join(__dirname, '..', 'dist', 'index.html');

  // Load the compiled desktop application directly from disk
  mainWindow.loadFile(distIndexPath, { hash: 'orchestrator' });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await ensureBackendRunning();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {}
    backendProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {}
    backendProcess = null;
  }
});
