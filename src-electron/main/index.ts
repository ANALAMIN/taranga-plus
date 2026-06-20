import { app, BrowserWindow } from 'electron';
import { join } from 'path';
import { setupGpuAcceleration } from '../hardware/gpuAccel';
import { registerIpcHandlers } from '../ipc/handlers';

setupGpuAcceleration();

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
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

  if (process.env.NODE_ENV === 'development' || process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL || 'http://localhost:3000');
    // DevTools can be enabled with --devtools CLI flag if needed
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.maximize();
  });

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window-maximize-state', true);
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window-maximize-state', false);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
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
