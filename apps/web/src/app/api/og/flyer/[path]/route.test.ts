/**
 * @jest-environment node
 */
import sharp from 'sharp';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
const { GET } = require('./route') as typeof import('./route');

const fetchMock = jest.fn();
global.fetch = fetchMock;

const call = (path: string, query = '') =>
  GET(new Request(`https://app.test/api/og/flyer/${path}${query}`), {
    params: Promise.resolve({ path }),
  });

const png = (width: number, height: number) =>
  sharp({
    create: { width, height, channels: 3, background: '#ff0000' },
  })
    .png()
    .toBuffer();

beforeEach(() => fetchMock.mockReset());

describe('GET /api/og/flyer/[path]', () => {
  it('returns a JPEG no larger than 1200px, cached forever', async () => {
    fetchMock.mockResolvedValue(new Response(await png(2400, 3000)));

    const res = await call('abc.png');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('immutable');
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect(meta).toMatchObject({ format: 'jpeg', width: 960, height: 1200 });
  });

  it.each(['..', 'a.b.c', 'dir%2Fx.png', 'x'])(
    'rejects %s without fetching',
    async (path) => {
      const res = await call(path);
      expect(res.status).toBe(404);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('redirects a request with a query string to the bare path', async () => {
    const res = await call('abc.png', '?n=1');
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe(
      'https://app.test/api/og/flyer/abc.png'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns 404 when Supabase has no such object', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 400 }));
    expect((await call('abc.png')).status).toBe(404);
  });

  it('returns 502 when Supabase fails or times out', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 503 }));
    expect((await call('abc.png')).status).toBe(502);
    fetchMock.mockRejectedValueOnce(
      new DOMException('timeout', 'TimeoutError')
    );
    expect((await call('abc.png')).status).toBe(502);
  });

  it('redirects to the original when the image cannot be decoded', async () => {
    fetchMock.mockResolvedValue(new Response('not an image'));
    const res = await call('abc.heic');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://proj.supabase.co/storage/v1/object/public/event-flyers/abc.heic'
    );
  });
});
