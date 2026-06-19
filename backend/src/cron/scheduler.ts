import { Env } from '../types';
import { fetchAllSources } from '../aggregator/sourceScraper';
import { validateChannels } from '../validator/pingTester';
import { pickBestRoutes } from '../validator/routePicker';
import { saveChannels } from '../storage/kvManager';

/**
 * The main background job that aggregates, validates, and stores channels.
 * This runs hourly via Cloudflare Cron Triggers.
 */
export async function runCronJob(env: Env): Promise<void> {
  try {
    console.log('Starting hourly channel sync...');
    const start = Date.now();

    // 1. Fetch raw channels from all sources
    console.log('Fetching sources...');
    const rawChannels = await fetchAllSources(env);
    console.log(`Found ${rawChannels.length} raw channels.`);

    // 2. Validate channels via HTTP HEAD ping
    console.log('Validating streams (this may take a while)...');
    const validChannels = await validateChannels(rawChannels);
    console.log(`Validated ${validChannels.length} working channels.`);

    // 3. Deduplicate and pick lowest latency routes
    console.log('Deduplicating and picking best routes...');
    const finalChannels = await pickBestRoutes(validChannels);
    console.log(`Final channel lineup count: ${finalChannels.length}.`);

    // 4. Save to Cloudflare KV
    console.log('Saving to KV storage...');
    await saveChannels(env, finalChannels);

    const duration = (Date.now() - start) / 1000;
    console.log(`Sync completed successfully in ${duration.toFixed(2)}s.`);

  } catch (error) {
    console.error('Cron job failed:', error);
    // In production, you might want to send an alert here (e.g., Slack/Discord webhook)
  }
}
