// ui/electron-main/ipc/handlers.ts
import { ipcMain } from "electron";
import axios from "axios";
var CLOUDFLARE_API_URL = "http://localhost:8787";
function registerIpcHandlers() {
  ipcMain.handle("fetch-channels", async () => {
    try {
      const response = await axios.get(`${CLOUDFLARE_API_URL}/channels`, {
        timeout: 3e3,
        headers: {
          "Accept": "application/json"
        }
      });
      return response.data;
    } catch (error) {
      console.error("Failed to fetch channels from backend:", error);
      throw new Error("Could not retrieve channels. Please check your internet connection and try again.");
    }
  });
  ipcMain.handle("get-cache-status", async () => {
    return { status: "healthy" };
  });
}
export {
  registerIpcHandlers
};
