import axios, { InternalAxiosRequestConfig } from 'axios';
import { ChannelFinal, HealthStatus } from '../types';

// Extend Axios config to support custom retry params
declare module 'axios' {
  export interface InternalAxiosRequestConfig {
    retryCount?: number;
    retry?: number;
  }
}

// GitHub raw URL (primary) — channels.json updated hourly by GitHub Actions
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json';

// Cloudflare fallback (if GitHub is unreachable)
const CLOUDFLARE_URL = import.meta.env.VITE_CLOUDFLARE_URL || 'http://localhost:8787';

export const apiClient = axios.create({
  baseURL: CLOUDFLARE_URL,
  timeout: 3000,
});

// Axios Interceptor for automated retries with exponential backoff
apiClient.interceptors.response.use(undefined, async (error) => {
  const config = error.config as InternalAxiosRequestConfig;
  
  if (!config) {
    return Promise.reject(error);
  }

  if (!config.retry) {
    config.retry = 3;
    config.retryCount = 0;
  }
  
  config.retryCount += 1;
  
  if (config.retryCount <= config.retry) {
    console.warn(`Request failed. Retrying attempt ${config.retryCount}...`);
    // Exponential backoff
    const backoff = new Promise((resolve) => setTimeout(resolve, 1000 * config.retryCount!));
    await backoff;
    return apiClient(config);
  }
  
  return Promise.reject(error);
});

export async function getChannels(): Promise<ChannelFinal[]> {
  // Primary: Fetch from GitHub raw (validated channels.json)
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

  // Fallback: Try Cloudflare Worker
  try {
    const response = await apiClient.get<ChannelFinal[]>('/channels');
    return response.data;
  } catch (error) {
    console.warn('Cloudflare fetch failed. Using mock data for preview...', error);
  }

  // Last resort: Mock data for preview
  return [
    {
      id: 'mock-1',
      name: 'Gazi TV (GTV)',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/GTV_Logo.png/1200px-GTV_Logo.png',
      streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      category: 'sports',
      latencyMs: 45
    },
    {
      id: 'mock-2',
      name: 'Sony Sports Network',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/Sony_Sports_Network_logo.svg/1200px-Sony_Sports_Network_logo.svg.png',
      streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      category: 'sports',
      latencyMs: 120
    },
    {
      id: 'mock-3',
      name: 'Cartoon Network',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/14/Cartoon_Network_2010_logo.svg/1200px-Cartoon_Network_2010_logo.svg.png',
      streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      category: 'kids',
      latencyMs: 90
    },
    {
      id: 'mock-4',
      name: 'National Geographic',
      logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/NatGeo_logo.svg/1200px-NatGeo_logo.svg.png',
      streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      category: 'documentary',
      latencyMs: 150
    },
    {
      id: 'mock-5',
      name: 'BTV National',
      logoUrl: '',
      streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
      category: 'all',
      latencyMs: 30
    }
  ];
}

export async function checkStatus(): Promise<HealthStatus> {
  const response = await apiClient.get<HealthStatus>('/status');
  return response.data;
}
