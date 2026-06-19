import { Env } from '../types';
import { getChannels } from '../storage/kvManager';
import { runCronJob } from '../cron/scheduler';

/**
 * Handles incoming HTTP requests to the Worker.
 */
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers - intentionally restrictive for security
    // Normally you'd restrict this to your Electron app's origin or require an auth token
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      if (path === '/channels' && request.method === 'GET') {
        const channels = await getChannels(env);
        return new Response(JSON.stringify(channels), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      if (path === '/status' && request.method === 'GET') {
        const channels = await getChannels(env);
        return new Response(JSON.stringify({
          status: 'ok',
          channelCount: channels.length,
          timestamp: new Date().toISOString()
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }
      
      // Manual trigger for development/testing
      if (path === '/trigger-sync' && request.method === 'GET') {
        ctx.waitUntil(runCronJob(env));
        return new Response('Sync triggered in background', {
          headers: corsHeaders
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeaders });

    } catch (error: unknown) {
      console.error('API Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  },

  // Export the cron trigger handler so Cloudflare invokes it
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCronJob(env));
  }
};
