import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
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

/**
 * Only retry on errors that have a reasonable chance of succeeding on retry:
 * network/timeout failures (no response), 5xx (transient server), and 429
 * (rate-limited). A 4xx like 404/401 must NOT be retried — it just adds
 * latency for a result that won't change. Backoff is exponential with jitter
 * instead of the previous linear 1s/2s/3s.
 */
function isRetryable(error: AxiosError): boolean {
  // No response ⇒ network error, DNS, timeout, or abort.
  if (!error.response) return true;
  const status = error.response.status;
  return status >= 500 || status === 429;
}

apiClient.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as InternalAxiosRequestConfig | undefined;

  if (!config || !isRetryable(error)) {
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
    console.warn(`Request failed (${error.response?.status ?? 'network'}). Retrying attempt ${retryCount}...`);
    // Exponential backoff with full jitter: base 400ms * 2^(attempt-1), jittered.
    const base = 400 * Math.pow(2, retryCount - 1);
    const delay = base + Math.floor(Math.random() * base);
    await new Promise((resolve) => setTimeout(resolve, delay));
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
  // Primary: Electron IPC. Runs in the privileged main process, so it is not
  // subject to renderer CORS/mixed-content rules — the only reliable path to
  // raw.githubusercontent.com from a packaged secure-origin build.
  if (window.electronAPI?.fetchChannels) {
    try {
      const data = await window.electronAPI.fetchChannels();
      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} channels via IPC`);
        return data;
      }
    } catch (error) {
      console.warn('IPC fetch failed, trying fallback...', error);
    }
  }

  // Fallback: Cloudflare Worker /channels. In the packaged Electron build the
  // direct-GitHub fetch below is unreliable (raw.githubusercontent.com does not
  // return a permissive Access-Control-Allow-Origin, so a secure renderer will
  // block it); the Worker is the supported browser/web fallback.
  try {
    const response = await apiClient.get<ChannelFinal[]>('/channels');
    if (response.data && response.data.length > 0) {
      console.log(`Loaded ${response.data.length} channels from Cloudflare Worker`);
      return response.data;
    }
  } catch (error) {
    console.warn('Cloudflare fetch failed.', error);
  }

  // Last resort: direct GitHub raw. Only useful when CORS is genuinely
  // permissive (e.g. a same-origin dev proxy). Logged separately so it's clear
  // this path is expected to fail in the packaged app.
  try {
    const response = await axios.get<ChannelFinal[]>(GITHUB_RAW_URL, {
      timeout: 5000,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (response.data && response.data.length > 0) {
      console.log(`Loaded ${response.data.length} channels from GitHub raw`);
      return response.data;
    }
  } catch (error) {
    console.warn('GitHub raw fetch failed (expected in packaged build if CORS blocks).', error);
  }

  return [];
}

export async function checkStatus(): Promise<HealthStatus> {
  const response = await apiClient.get<HealthStatus>('/status');
  return response.data;
}
