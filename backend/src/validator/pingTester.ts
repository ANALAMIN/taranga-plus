import { ChannelRaw, ChannelValidated } from '../types';

// Maximum acceptable timeout (4000ms) as per specification
const TIMEOUT_MS = 4000;

/**
 * Tests a single stream URL with an HTTP HEAD request.
 * Measures response latency and determines if the stream is alive.
 */
async function testStream(channel: ChannelRaw): Promise<ChannelValidated> {
  const start = Date.now();
  let isAlive = false;
  let latencyMs = TIMEOUT_MS;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    // We use HEAD method because it's faster and doesn't download actual video data
    const response = await fetch(channel.url, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        // User-Agent spoofing to bypass basic protections
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      isAlive = true;
      latencyMs = Date.now() - start;
    }
  } catch (error) {
    // Fetch failed, aborted due to timeout, or network issue
    isAlive = false;
  }

  return {
    ...channel,
    isAlive,
    latencyMs
  };
}

/**
 * Tests an array of raw channels concurrently using chunks
 * to avoid memory bounds limits in Cloudflare Workers.
 * Returns an array mapping valid channels to their latency scores.
 */
export async function validateChannels(channels: ChannelRaw[]): Promise<ChannelValidated[]> {
  const validChannels: ChannelValidated[] = [];
  const batchSize = 50; // Process 50 channels at a time to stay under concurrency/memory limits

  for (let i = 0; i < channels.length; i += batchSize) {
    const batch = channels.slice(i, i + batchSize);
    const results = await Promise.all(batch.map(testStream));
    
    // Only retain channels that successfully responded
    validChannels.push(...results.filter(c => c.isAlive));
  }

  return validChannels;
}
