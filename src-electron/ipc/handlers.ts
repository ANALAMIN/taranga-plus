import { ipcMain, BrowserWindow, screen } from 'electron';
import axios from 'axios';

const GITHUB_RAW_URL = process.env.GITHUB_RAW_URL || 'https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json';

function snapWindowToPosition(win: BrowserWindow, position: string): void {
  const bounds = win.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;

  let targetBounds = { x: 0, y: 0, width: 0, height: 0 };

  switch (position) {
    case 'left-half':
      targetBounds = {
        x: workArea.x,
        y: workArea.y,
        width: Math.round(workArea.width / 2),
        height: workArea.height,
      };
      break;
    case 'right-half':
      targetBounds = {
        x: workArea.x + Math.round(workArea.width / 2),
        y: workArea.y,
        width: Math.round(workArea.width / 2),
        height: workArea.height,
      };
      break;
    case 'top-left-quarter':
      targetBounds = {
        x: workArea.x,
        y: workArea.y,
        width: Math.round(workArea.width / 2),
        height: Math.round(workArea.height / 2),
      };
      break;
    case 'top-right-quarter':
      targetBounds = {
        x: workArea.x + Math.round(workArea.width / 2),
        y: workArea.y,
        width: Math.round(workArea.width / 2),
        height: Math.round(workArea.height / 2),
      };
      break;
    case 'bottom-left-quarter':
      targetBounds = {
        x: workArea.x,
        y: workArea.y + Math.round(workArea.height / 2),
        width: Math.round(workArea.width / 2),
        height: Math.round(workArea.height / 2),
      };
      break;
    case 'bottom-right-quarter':
      targetBounds = {
        x: workArea.x + Math.round(workArea.width / 2),
        y: workArea.y + Math.round(workArea.height / 2),
        width: Math.round(workArea.width / 2),
        height: Math.round(workArea.height / 2),
      };
      break;
    case 'maximize':
      win.maximize();
      return;
    default:
      return;
  }

  win.setResizable(true);
  win.setBounds(targetBounds, true);
}

export function registerIpcHandlers(): void {
  ipcMain.handle('fetch-channels', async () => {
    try {
      const response = await axios.get(GITHUB_RAW_URL, {
        timeout: 5000,
        headers: { 'Accept': 'application/json' }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch channels from GitHub:', error);
      throw new Error('Could not retrieve channels.');
    }
  });

  ipcMain.handle('get-cache-status', async () => {
    try {
      const response = await axios.get(GITHUB_RAW_URL, {
        timeout: 3000,
        headers: { 'Accept': 'application/json' }
      });
      const healthy = response.status === 200 && Array.isArray(response.data);
      return { status: healthy ? 'healthy' : 'degraded' };
    } catch {
      return { status: 'unhealthy' };
    }
  });

  ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });

  ipcMain.on('window-snap', (event, position: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      snapWindowToPosition(win, position);
    }
  });
}
