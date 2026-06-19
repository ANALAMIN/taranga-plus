import { app, BrowserWindow } from 'electron';
import * as path from 'path';
import { setupGpuAcceleration } from './hardware/gpuAccel';
import { registerIpcHandlers } from './ipc/handlers';

// Setup GPU acceleration BEFORE the app is ready and window is created.
setupGpuAcceleration();

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0A0A0A', // matches --color-bg
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // In a strict production setting, contextIsolation should be true + preload.js
      webSecurity: false // Disabling webSecurity solely to allow Shaka to fetch segments without CORS issues natively (if proxies fail)
    },
    autoHideMenuBar: true
  });

  // Load the React app. In dev, we can connect to Vite.
  // In production, load the built index.html.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Register all IPC events
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
