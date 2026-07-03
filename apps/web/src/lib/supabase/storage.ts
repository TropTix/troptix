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

export const ORGANIZATION_LOGOS_BUCKET = 'organization-logos';

/**
 * Resolve a stored `Organization.logoUrl` to a renderable URL — same
 * path-not-URL contract as `eventFlyerUrl` (ADR 0016), for the org-logos bucket.
 * Falsy → `null` (callers fall back to a monogram). The upload counterpart lands
 * with the logo editor; until then every logoUrl is null and this returns null.
 */
export function organizationLogoUrl(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  const path = value.replace(/^\/+/, '');
  return `${PUBLIC_BASE}/${ORGANIZATION_LOGOS_BUCKET}/${path}`;
}

export const SPOTLIGHT_IMAGES_BUCKET = 'spotlight-images';

/**
 * Resolve a stored `Spotlight.imageUrl` to a renderable URL — same path-not-URL
 * contract as `eventFlyerUrl` (ADR 0016), for the spotlight-images bucket. Falsy
 * → `null` (callers fall back to a monogram).
 */
export function spotlightImageUrl(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  const path = value.replace(/^\/+/, '');
  return `${PUBLIC_BASE}/${SPOTLIGHT_IMAGES_BUCKET}/${path}`;
}

/**
 * Upload a spotlight card image to the `spotlight-images` bucket; returns the
 * stored PATH (what goes into `Spotlight.imageUrl`). Governed by the bucket's
 * authenticated RLS policy — the caller must be signed in. Throws on failure.
 */
export async function uploadSpotlightImage(file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(SPOTLIGHT_IMAGES_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) throw error;
  return path;
}

/** Delete a spotlight image by its stored path. No-ops on falsy / absolute values. */
export async function deleteSpotlightImage(
  value: string | null | undefined
): Promise<void> {
  if (!value || isAbsoluteUrl(value)) return;
  const supabase = createClient();
  const path = value.replace(/^\/+/, '');
  const { error } = await supabase.storage
    .from(SPOTLIGHT_IMAGES_BUCKET)
    .remove([path]);
  if (error && !/not\s*found/i.test(error.message)) throw error;
}

/**
 * Upload an org logo to the `organization-logos` bucket; returns the stored PATH
 * (what goes into `Organization.logoUrl`). Governed by the bucket's authenticated
 * RLS policy — the caller must be signed in. Throws on failure.
 */
export async function uploadOrganizationLogo(file: File): Promise<string> {
  const supabase = createClient();
  const ext = file.name.includes('.')
    ? file.name.split('.').pop()!.toLowerCase()
    : 'bin';
  const path = `${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from(ORGANIZATION_LOGOS_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) throw error;
  return path;
}

/** Delete an org logo by its stored path. No-ops on falsy / absolute values. */
export async function deleteOrganizationLogo(
  value: string | null | undefined
): Promise<void> {
  if (!value || isAbsoluteUrl(value)) return;
  const supabase = createClient();
  const path = value.replace(/^\/+/, '');
  const { error } = await supabase.storage
    .from(ORGANIZATION_LOGOS_BUCKET)
    .remove([path]);
  if (error && !/not\s*found/i.test(error.message)) throw error;
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
