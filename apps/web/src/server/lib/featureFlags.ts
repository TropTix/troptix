import { cookies } from 'next/headers';
import { PostHog } from 'posthog-node';
import { z } from 'zod';
import type { FeatureFlagKey } from '@troptix/api';

/**
 * Server-side feature flag check. Fail closed: any error, timeout, or missing
 * flag returns false, which must always mean today's live behavior
 * (docs/runbooks/feature-flags.md, ADR 0023).
 *
 * Remote evaluation on purpose — local evaluation polls definitions per
 * process, which serverless multiplies into cost and latency. One request per
 * check is fine at our volume; memoize per request before reaching for
 * anything cleverer.
 *
 * Pass the signed-in user where you have one: the Supabase user id keeps
 * server and client verdicts identical, and the email person property makes
 * staff targeting work regardless of ingestion lag.
 */
export async function isFlagEnabled(
  flag: FeatureFlagKey,
  user?: { id?: string | null; email?: string | null }
): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return false;

  let client: PostHog | undefined;
  try {
    client = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
      featureFlagsRequestTimeoutMs: 2000,
    });
    const distinctId = user?.id || (await anonymousDistinctId(apiKey));
    const options: Parameters<typeof client.evaluateFlags>[1] = {
      flagKeys: [flag],
    };
    if (user?.email) options.personProperties = { email: user.email };
    const flags = await client.evaluateFlags(distinctId, options);
    return flags.isEnabled(flag);
  } catch {
    return false;
  } finally {
    // Flush the $feature_flag_called event — it feeds the per-flag usage view
    // that cleanup relies on.
    await client?.shutdown().catch(() => {});
  }
}

/**
 * The posthog-js cookie carries the browser's anonymous distinct id. Reusing
 * it keeps a percentage rollout consistent between this server check and the
 * same visitor's client hooks. Outside a request scope (cron, webhooks) or
 * with no cookie, fall back to a constant — correct for flags that are off,
 * staff-only, or fully on, which is every flag until a percentage rollout
 * starts.
 */
async function anonymousDistinctId(apiKey: string): Promise<string> {
  try {
    const store = await cookies();
    const raw = store.get(`ph_${apiKey}_posthog`)?.value;
    if (raw) {
      const cookie = z
        .object({ distinct_id: z.string().min(1) })
        .safeParse(JSON.parse(raw));
      if (cookie.success) return cookie.data.distinct_id;
    }
  } catch {
    // No request scope or unreadable cookie — fall through.
  }
  return 'server-anonymous';
}
