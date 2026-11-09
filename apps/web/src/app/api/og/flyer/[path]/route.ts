import sharp from 'sharp';
import { eventFlyerUrl } from '@/lib/supabase/storage';

const FLYER_PATH = /^[\w-]+\.[a-z0-9]+$/i;

// WhatsApp drops preview images over a few hundred KB, and organizers upload
// multi-MB flyers. Flyer paths are random and never overwritten, so the
// output can be cached forever.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string }> }
) {
  const { path } = await params;
  if (!FLYER_PATH.test(path)) {
    return new Response('Not found', { status: 404 });
  }

  const upstream = await fetch(eventFlyerUrl(path)!);
  if (!upstream.ok) {
    return new Response('Not found', { status: 404 });
  }

  const jpeg = await sharp(Buffer.from(await upstream.arrayBuffer()))
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

  return new Response(new Uint8Array(jpeg), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
