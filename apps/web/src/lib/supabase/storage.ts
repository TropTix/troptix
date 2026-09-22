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

export function eventFlyerUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  const path = value.replace(/^\/+/, '');
  return `${PUBLIC_BASE}/${EVENT_FLYERS_BUCKET}/${path}`;
}

export const ORGANIZATION_LOGOS_BUCKET = 'organization-logos';

export function organizationLogoUrl(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  if (isAbsoluteUrl(value)) return value;
  const path = value.replace(/^\/+/, '');
  return `${PUBLIC_BASE}/${ORGANIZATION_LOGOS_BUCKET}/${path}`;
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
  if (!value || isAbsoluteUrl(value)) return;
  const supabase = createClient();
  const path = value.replace(/^\/+/, '');
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
  if (!value || isAbsoluteUrl(value)) return;
  const supabase = createClient();
  const path = value.replace(/^\/+/, '');
  const { error } = await supabase.storage
    .from(EVENT_FLYERS_BUCKET)
    .remove([path]);
  if (error && !/not\s*found/i.test(error.message)) throw error;
}
