import sharp from 'sharp';
import { eventFlyerUrl } from '@/lib/supabase/storage';

const FLYER_PATH = /^[\w-]+\.[a-z0-9]+$/i;

// WhatsApp drops preview images over a few hundred KB, and organizers upload
// multi-MB flyers. Flyer paths are random and never overwritten, so the
// output can be cached forever.
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string }> }
) {
  const url = new URL(req.url);
  // The CDN keys on the query string; without this, ?n=1, ?n=2… each re-encode.
  if (url.search) {
    return Response.redirect(new URL(url.pathname, url), 308);
  }

  const { path } = await params;
  if (!FLYER_PATH.test(path)) {
    return new Response('Not found', { status: 404 });
  }

  const source = eventFlyerUrl(path)!;
  let upstream: Response;
  try {
    upstream = await fetch(source, { signal: AbortSignal.timeout(5000) });
  } catch {
    return new Response('Bad gateway', { status: 502 });
  }
  // Supabase Storage answers a missing object with 400.
  if (upstream.status === 400 || upstream.status === 404) {
    return new Response('Not found', { status: 404 });
  }
  if (!upstream.ok) {
    return new Response('Bad gateway', { status: 502 });
  }

  let jpeg: Buffer;
  try {
    jpeg = await sharp(Buffer.from(await upstream.arrayBuffer()))
      .rotate()
      .resize({
        width: 1200,
        height: 1200,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
  } catch {
    return Response.redirect(source, 302);
  }

  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
