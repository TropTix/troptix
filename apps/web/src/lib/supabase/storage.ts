import { createClient } from '@/lib/supabase/client';

/**
 * Supabase Storage helpers for event flyer images.
 *
 * Backing decision: docs/adr/0016-supabase-storage-for-event-images.md.
 * `Events.imageUrl` stores the object PATH within the bucket (e.g.
 * `a1b2…c3.jpg`), never a full URL. The public URL is derived at render time by
 * `eventFlyerUrl()`, so the serving host is swappable with zero data migration.
 */

export const EVENT_FLYERS_BUCKET = 'event-flyers';

/**
 * Local fallback shown when an event has no flyer. Callers pair it with
 * `eventFlyerUrl()`, e.g. `eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE`.
 */
export const DEFAULT_EVENT_IMAGE = '/placeholder-event.jpg';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * The single base from which every public flyer URL is built — and the only
 * thing to change to serve flyers from a custom domain (e.g. cdn.troptix.com)
 * later. Because rows store paths, swapping this base requires no DB migration.
 */
const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public`;

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * Resolve a stored `imageUrl` value to a renderable URL.
 *
 * - Falsy → `null` (callers fall back to their own placeholder).
 * - Already-absolute (legacy Firebase download URLs, or any external URL) →
 *   returned untouched, so the app renders correctly *during* the migration
 *   window before/while rows are rewritten to paths.
 * - Otherwise treated as a bucket-relative path and turned into the Supabase
 *   public URL.
 */
export function eventFlyerUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  const path = value.replace(/^\/+/, '');
  return `${PUBLIC_BASE}/${EVENT_FLYERS_BUCKET}/${path}`;
}

/**
 * Upload a flyer to the `event-flyers` bucket and return the stored PATH (what
 * goes into `Events.imageUrl`). Writes are governed by the bucket's
 * `authenticated` RLS policy — the caller must be signed in. Throws on failure.
 */
export async function uploadEventFlyer(file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(EVENT_FLYERS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) throw error;
  return path;
}

/**
 * Delete a flyer by its stored path. No-ops on falsy input and on legacy
 * absolute URLs (those point at Firebase objects this helper does not own).
 * Swallows "not found" so removing an already-gone object is not an error.
 */
export async function deleteEventFlyer(
  value: string | null | undefined
): Promise<void> {
  if (!value || isAbsoluteUrl(value)) return;
  const supabase = createClient();
  const path = value.replace(/^\/+/, '');
  const { error } = await supabase.storage
    .from(EVENT_FLYERS_BUCKET)
    .remove([path]);
  if (error && !/not\s*found/i.test(error.message)) throw error;
}
