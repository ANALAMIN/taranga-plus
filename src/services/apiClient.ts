import axios, { InternalAxiosRequestConfig } from 'axios';
import { ChannelFinal, HealthStatus } from '../types';

declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    retryCount?: number;
    retry?: number;
  }
}

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json';

const CLOUDFLARE_URL = import.meta.env.VITE_CLOUDFLARE_URL || 'http://localhost:8787';

export const apiClient = axios.create({
  baseURL: CLOUDFLARE_URL,
  timeout: 3000,
});

apiClient.interceptors.response.use(undefined, async (error) => {
  const config = error.config as InternalAxiosRequestConfig;
  
  if (!config) {
    return Promise.reject(error);
  }

  if (!config.retry) {
    config.retry = 3;
    config.retryCount = 0;
  }
  
  const retryCount = (config.retryCount ?? 0) + 1;
  config.retryCount = retryCount;
  const retryMax = config.retry ?? 0;
  if (retryCount <= retryMax) {
    console.warn(`Request failed. Retrying attempt ${retryCount}...`);
    const backoff = new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
    await backoff;
    return apiClient(config);
  }
  
  return Promise.reject(error);
});

declare global {
  interface Window {
    electronAPI?: {
      fetchChannels: () => Promise<ChannelFinal[]>;
    };
  }
}

export async function getChannels(): Promise<ChannelFinal[]> {
  // Primary: Use Electron IPC if available (bypasses CORS for GitHub raw)
  if (window.electronAPI?.fetchChannels) {
    try {
      const data = await window.electronAPI.fetchChannels();
      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} channels via IPC`);
        return data;
      }
    } catch (error) {
      console.warn('IPC fetch failed, trying direct fetch...', error);
    }
  }

  // Fallback 1: Direct fetch from GitHub raw (works in browser if CORS allows)
  try {
    const response = await axios.get<ChannelFinal[]>(GITHUB_RAW_URL, {
      timeout: 5000,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (response.data && response.data.length > 0) {
      console.log(`Loaded ${response.data.length} channels from GitHub`);
      return response.data;
    }
  } catch (error) {
    console.warn('GitHub fetch failed, trying Cloudflare...', error);
  }

  // Fallback 2: Try Cloudflare Worker
  try {
    const response = await apiClient.get<ChannelFinal[]>('/channels');
    return response.data;
  } catch (error) {
    console.warn('Cloudflare fetch failed.', error);
  }

  return [];
}

export async function checkStatus(): Promise<HealthStatus> {
  const response = await apiClient.get<HealthStatus>('/status');
  return response.data;
}
