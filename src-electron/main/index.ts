import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { setupGpuAcceleration } from '../hardware/gpuAccel';
import { registerIpcHandlers } from '../ipc/handlers';

setupGpuAcceleration();

let mainWindow: BrowserWindow | null = null;

/**
 * Resolve the renderer URL to load at startup.
 *
 * Only honor ELECTRON_RENDERER_URL when we are actually in development, AND the
 * value points at a loopback host. Without this check, an attacker (or a
 * misconfigured launch script) that sets ELECTRON_RENDERER_URL in the
 * production environment could make the packaged window load
 * attacker-controlled content with full preload access.
 */
function resolveRendererUrl(): string | null {
  const isDev = process.env.NODE_ENV === 'development';
  const raw = process.env.ELECTRON_RENDERER_URL;
  if (!isDev || !raw) return null;
  try {
    const u = new URL(raw);
    const loopback = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '::1';
    if (!loopback) {
      console.error(`Refusing to load non-loopback ELECTRON_RENDERER_URL: ${raw}`);
      return null;
    }
    return raw;
  } catch {
    console.error(`Invalid ELECTRON_RENDERER_URL, ignoring: ${raw}`);
    return null;
  }
}

function createWindow(): BrowserWindow {
  // Reuse an existing, live window instead of leaking a second one if
  // `activate` / `createWindow` fires twice.
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0A0A0A',
    title: '',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#00000000',
      symbolColor: '#A0A0A0',
      height: 64
    },
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  const devUrl = resolveRendererUrl();
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
    // DevTools can be enabled with --devtools CLI flag if needed
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  const sendWindowState = (maximized: boolean): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-maximize-state', maximized);
    }
  };

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.maximize();
    }
  });

  mainWindow.on('maximize', () => sendWindowState(true));
  mainWindow.on('unmaximize', () => sendWindowState(false));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  mainWindow = null;
});
