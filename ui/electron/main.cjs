const { app, BrowserWindow, shell, Tray, Menu, nativeImage, globalShortcut } = require('electron');
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
let tray = null;
app.isQuitting = false;

// Create crisp 32x32 Holographic Cyan Core Tray Icon
function createTrayIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="#04070a" stroke="#00e5ff" stroke-width="2.5"/>
    <circle cx="16" cy="16" r="8" fill="#00e5ff" fill-opacity="0.35" stroke="#00e5ff" stroke-width="1.5"/>
    <circle cx="16" cy="16" r="3.5" fill="#ffffff"/>
  </svg>`;
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  return nativeImage.createFromDataURL(dataUrl);
}

// Function to check if backend is already listening
function checkBackendAlive() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8787/api/v1/health', (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 401);
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
    windowsHide: true,
    shell: process.platform === 'win32'
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start background backend:', err);
  });

  // Wait briefly for backend server to bind to port 8787 before showing the UI
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await checkBackendAlive()) {
      break;
    }
  }
}

// Toggle or bring forward JARVIS HUD window instantly
function toggleMainWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    if (mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

function setupTray() {
  if (tray) return;
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip('JARVIS 2.0 — Orchestrator Studio');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open JARVIS 2.0 (Alt+J)',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'Toggle HUD Window',
      click: toggleMainWindow
    },
    { type: 'separator' },
    {
      label: 'Core Status: Active (127.0.0.1:8787)',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Quit JARVIS',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', toggleMainWindow);
  tray.on('click', toggleMainWindow);
}

function registerGlobalShortcuts() {
  try {
    globalShortcut.register('Alt+J', toggleMainWindow);
    globalShortcut.register('CommandOrControl+Alt+Space', toggleMainWindow);
  } catch (err) {
    console.warn('Global shortcut registration skipped:', err);
  }
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

  // Minimize to tray on close unless quitting
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
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
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    await ensureBackendRunning();
    createWindow();
    setupTray();
    registerGlobalShortcuts();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (app.isQuitting) {
    if (backendProcess) {
      try {
        backendProcess.kill();
      } catch {}
      backendProcess = null;
    }
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {}
    backendProcess = null;
  }
});
