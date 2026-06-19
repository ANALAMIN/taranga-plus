import { ipcMain } from 'electron';
import axios from 'axios';

// Ensure this matches the Cloudflare worker URL once deployed
const CLOUDFLARE_API_URL = 'http://localhost:8787'; // Default for wranger dev, change when deploying

/**
 * Registers all IPC communication handlers between Main Process and Renderer (React UI).
 */
export function registerIpcHandlers(): void {
  
  /**
   * Fetches the validated channel list from the Cloudflare API.
   * We do this in the main process to avoid CORS issues and keep network logic separated.
   */
  ipcMain.handle('fetch-channels', async () => {
    try {
      const response = await axios.get(`${CLOUDFLARE_API_URL}/channels`, {
        timeout: 3000, 
        headers: {
          'Accept': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch channels from backend:', error);
      throw new Error('Could not retrieve channels. Please check your internet connection and try again.');
    }
  });

  /**
   * Reads generic App settings/Cache settings if needed at OS level.
   * Note: We mostly use IndexedDB on the renderer, but keeping an IPC route
   * open for Main process configuration if needed later.
   */
  ipcMain.handle('get-cache-status', async () => {
    // Basic stub, real storage is handled in Renderer via IndexedDB
    return { status: 'healthy' };
  });
}
