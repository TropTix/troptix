import { createClient } from '@/lib/supabase/client';

/**
 * `Events.imageUrl` stores the object PATH within the bucket, never a full URL
 * (ADR 0016) — public URLs are derived at render time by `eventFlyerUrl()`.
 */

export const EVENT_FLYERS_BUCKET = 'event-flyers';

export const DEFAULT_EVENT_IMAGE = '/placeholder-event.jpg';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

const PUBLIC_BASE = `${SUPABASE_URL}/storage/v1/object/public`;

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

function storagePath(value: string | null | undefined): string | null {
  if (!value || isAbsoluteUrl(value)) return null;
  return value.replace(/^\/+/, '');
}

function publicUrl(
  bucket: string,
  value: string | null | undefined
): string | null {
  const path = storagePath(value);
  if (path) return `${PUBLIC_BASE}/${bucket}/${path}`;
  return value || null;
}

export function eventFlyerUrl(value: string | null | undefined): string | null {
  return publicUrl(EVENT_FLYERS_BUCKET, value);
}

export function eventFlyerPreviewImage(
  value: string | null | undefined,
  origin: string
): { url: string; type?: string } | null {
  const path = storagePath(value);
  if (path) {
    return {
      url: `${origin}/api/og/flyer/${encodeURIComponent(path)}`,
      type: 'image/jpeg',
    };
  }
  return value ? { url: value } : null;
}

export const ORGANIZATION_LOGOS_BUCKET = 'organization-logos';

export function organizationLogoUrl(
  value: string | null | undefined
): string | null {
  return publicUrl(ORGANIZATION_LOGOS_BUCKET, value);
}

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

export async function deleteOrganizationLogo(
  value: string | null | undefined
): Promise<void> {
  const path = storagePath(value);
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(ORGANIZATION_LOGOS_BUCKET)
    .remove([path]);
  if (error && !/not\s*found/i.test(error.message)) throw error;
}

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

export async function deleteEventFlyer(
  value: string | null | undefined
): Promise<void> {
  const path = storagePath(value);
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage
    .from(EVENT_FLYERS_BUCKET)
    .remove([path]);
  if (error && !/not\s*found/i.test(error.message)) throw error;
}
