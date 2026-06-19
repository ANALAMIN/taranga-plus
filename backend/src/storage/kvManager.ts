import { ChannelFinal, Env } from '../types';

const CHANNELS_KEY = 'channels_bd';

/**
 * Saves the final validated JSON array to KV storage.
 */
export async function saveChannels(env: Env, channels: ChannelFinal[]): Promise<void> {
  const jsonString = JSON.stringify(channels);
  await env.TARANGA_KV.put(CHANNELS_KEY, jsonString);
}

/**
 * Retrieves the compiled channels JSON from KV storage.
 * Used by the client API.
 */
export async function getChannels(env: Env): Promise<ChannelFinal[]> {
  const data = await env.TARANGA_KV.get(CHANNELS_KEY);
  if (!data) return [];
  
  try {
    return JSON.parse(data) as ChannelFinal[];
  } catch (err) {
    console.error('Failed to parse channels from KV:', err);
    return [];
  }
}
