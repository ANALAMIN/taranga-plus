import { Env } from '../types';
import { getChannels } from '../storage/kvManager';
import { runCronJob } from '../cron/scheduler';

/**
 * Handles incoming HTTP requests to the Worker.
 */

// Origins explicitly permitted to call the public API. Requests carrying an
// `Origin` header not in this set receive NO Access-Control-Allow-Origin header
// (rather than a default-allow) so non-browser / spoofed clients cannot inherit
// the trusted origin. The Electron app loads from a secure custom scheme/host;
// add the exact origin your build emits if different.
const ALLOWED_ORIGINS = new Set<string>([
  'https://analamin.github.io',
  'https://taranga-plus.pages.dev',
  'http://localhost:3000',
  'http://localhost:5173',
]);

function corsHeadersFor(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  // Only reflect origins we explicitly trust. Unknown/missing → no ACAO header.
  if (!ALLOWED_ORIGINS.has(origin)) {
    return {
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Stream proxy. Re-serves an upstream HLS/DASH manifest or segment over HTTPS so
 * the renderer (a secure context with webSecurity enabled) can load `http://`
 * sources without mixed-content blocks or per-origin CORS failures. The stream
 * is fetched server-side by the Worker, which runs in the data center and is
 * not subject to browser same-origin rules.
 *
 * Path: /proxy/stream?url=<absolute upstream URL>
 *
 * Safety: only absolute http(s) URLs are accepted; opaque redirects are
 * followed by the runtime. We forward a normal browser UA to reduce origin
 * 403s from CDNs that block default fetch UAs.
 */
async function proxyStream(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const target = url.searchParams.get('url');
  if (!target) {
    return new Response('Missing url param', { status: 400 });
  }
  let upstream: URL;
  try {
    upstream = new URL(target);
  } catch {
    return new Response('Invalid url param', { status: 400 });
  }
  if (upstream.protocol !== 'http:' && upstream.protocol !== 'https:') {
    return new Response('Unsupported scheme', { status: 400 });
  }

  const range = request.headers.get('Range');
  const upstreamReq = new Request(upstream, {
    method: request.method,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': request.headers.get('Accept') || '*/*',
      ...(range ? { 'Range': range } : {}),
    },
    // Allow the Worker to follow upstream redirects.
    redirect: 'follow',
  });

  const upstreamRes = await fetch(upstreamReq);
  // Strip hop-by-hop and CORS headers from the upstream response; the browser
  // only sees our origin, so we set ACAO/CORS ourselves via corsHeadersFor.
  const headers = new Headers();
  const passthrough = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control', 'etag', 'last-modified'];
  for (const key of passthrough) {
    const v = upstreamRes.headers.get(key);
    if (v) headers.set(key, v);
  }
  const cors = corsHeadersFor(request);
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Preflight: permissive on OPTIONS (no body to protect), but the real
    // ACAO stamping for non-preflight responses follows corsHeadersFor().
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    try {
      if (path === '/proxy/stream') {
        return await proxyStream(request);
      }

      if (path === '/channels' && request.method === 'GET') {
        const channels = await getChannels(env);
        return new Response(JSON.stringify(channels), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeadersFor(request),
          },
        });
      }

      if (path === '/status' && request.method === 'GET') {
        const channels = await getChannels(env);
        return new Response(JSON.stringify({
          status: 'ok',
          channelCount: channels.length,
          timestamp: new Date().toISOString(),
        }), {
          headers: {
            'Content-Type': 'application/json',
            ...corsHeadersFor(request),
          },
        });
      }

      // Manual trigger for development/testing. Requires a shared secret
      // header so an unauthenticated visitor cannot hammer the upstream M3U
      // sources (trivial DoS against the worker + iptv-org otherwise).
      if (path === '/trigger-sync' && request.method === 'GET') {
        const expected = env.ADMIN_TOKEN;
        const provided = request.headers.get('x-admin-token');
        if (!expected || provided !== expected) {
          return new Response('Unauthorized', { status: 401 });
        }
        ctx.waitUntil(runCronJob(env));
        return new Response('Sync triggered in background', {
          headers: corsHeadersFor(request),
        });
      }

      return new Response('Not Found', { status: 404, headers: corsHeadersFor(request) });

    } catch (error: unknown) {
      console.error('API Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeadersFor(request),
        },
      });
    }
  },

  // Export the cron trigger handler so Cloudflare invokes it
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCronJob(env));
  },
};
