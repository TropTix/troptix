import { createClient } from '@/lib/supabase/client';

/**
 * Supabase Storage helpers for organizer images (event flyers, org logos).
 *
 * Backing decision: docs/adr/0016-supabase-storage-for-event-images.md. Rows
 * store the object PATH within the bucket (e.g. `a1b2…c3.jpg`), never a full
 * URL; the public URL is derived at render time, so the serving host stays
 * swappable with zero data migration. The per-bucket functions below are thin
 * wrappers over the generic helpers so behaviour stays identical across buckets.
 */

export const EVENT_FLYERS_BUCKET = 'event-flyers';
export const ORGANIZATION_LOGOS_BUCKET = 'organization-logos';

/**
 * Local fallback shown when an event has no flyer. Callers pair it with
 * `eventFlyerUrl()`, e.g. `eventFlyerUrl(event.imageUrl) ?? DEFAULT_EVENT_IMAGE`.
 */
export const DEFAULT_EVENT_IMAGE = '/placeholder-event.jpg';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * The single base from which every public object URL is built — and the only
 * thing to change to serve from a custom domain (e.g. cdn.troptix.com) later.
 * Because rows store paths, swapping this base requires no DB migration.
 */
const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public`;

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

/**
 * Resolve a stored path to a renderable URL.
 * - Falsy → `null` (callers fall back to their own placeholder / monogram).
 * - Already-absolute (legacy Firebase URLs, or any external URL) → untouched, so
 *   the app renders correctly during the path-migration window.
 * - Otherwise a bucket-relative path → the Supabase public URL.
 */
function bucketPublicUrl(
  bucket: string,
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  return `${PUBLIC_BASE}/${bucket}/${value.replace(/^\/+/, '')}`;
}

/**
 * Upload a file under a random `<uuid>.<ext>` path and return the stored PATH.
 * Writes are governed by the bucket's `authenticated` RLS policy — the caller
 * must be signed in. Throws on failure.
 */
async function uploadToBucket(bucket: string, file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) throw error;
  return path;
}

/**
 * Delete a stored path. No-ops on falsy input and on legacy absolute URLs (those
 * point at Firebase objects this helper does not own). Swallows "not found" so
 * removing an already-gone object is not an error.
 */
async function deleteFromBucket(
  bucket: string,
  value: string | null | undefined
): Promise<void> {
  if (!value || isAbsoluteUrl(value)) return;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(bucket)
    .remove([value.replace(/^\/+/, '')]);
  if (error && !/not\s*found/i.test(error.message)) throw error;
}

// Event flyers (Events.imageUrl).
export const eventFlyerUrl = (value: string | null | undefined) =>
  bucketPublicUrl(EVENT_FLYERS_BUCKET, value);
export const uploadEventFlyer = (file: File) =>
  uploadToBucket(EVENT_FLYERS_BUCKET, file);
export const deleteEventFlyer = (value: string | null | undefined) =>
  deleteFromBucket(EVENT_FLYERS_BUCKET, value);

// Organization logos (Organization.logoUrl).
export const organizationLogoUrl = (value: string | null | undefined) =>
  bucketPublicUrl(ORGANIZATION_LOGOS_BUCKET, value);
export const uploadOrganizationLogo = (file: File) =>
  uploadToBucket(ORGANIZATION_LOGOS_BUCKET, file);
export const deleteOrganizationLogo = (value: string | null | undefined) =>
  deleteFromBucket(ORGANIZATION_LOGOS_BUCKET, value);
