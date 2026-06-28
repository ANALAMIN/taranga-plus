import { ChannelFinal } from '../types';

const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/ANALAMIN/taranga-plus/master/data/channels.json';

export async function getChannels(): Promise<ChannelFinal[]> {
  const backend = (window as any).chrome?.webview?.hostObjects?.backend;
  if (backend) {
    try {
      const json = await backend.FetchChannels();
      const data = JSON.parse(json) as ChannelFinal[];
      if (data && data.length > 0) {
        console.log(`Loaded ${data.length} channels via .NET backend`);
        return data;
      }
    } catch (error) {
      console.warn('.NET backend fetch failed, trying direct fetch...', error);
    }
  }

  const response = await fetch(GITHUB_RAW_URL, {
    headers: { 'Cache-Control': 'no-cache' },
  });
  if (!response.ok) {
    throw new Error(`GitHub raw fetch failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  console.log(`Loaded ${data.length} channels from GitHub raw (fallback)`);
  return data;
}
