import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  fetchChannels: () => ipcRenderer.invoke('fetch-channels'),
  checkStatus: () => ipcRenderer.invoke('get-cache-status'),
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  snapWindow: (position: string) => ipcRenderer.send('window-snap', position),
  onMaximizeStateChange: (callback: (isMaximized: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on('window-maximize-state', handler);
    return () => ipcRenderer.removeListener('window-maximize-state', handler);
  },
  platform: process.platform
});
