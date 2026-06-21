/**
 * `eventFlyerUrl` is the single URL-derivation point (ADR 0016). Its contract:
 * falsy → null, absolute URLs pass through (so legacy Firebase rows still
 * render mid-migration), bucket-relative paths become Supabase public URLs.
 * The base is read from env at module load, so each case re-imports in
 * isolation with the env set.
 */
const BASE = 'https://proj.supabase.co';

const loadEventFlyerUrl = () => {
  let mod!: typeof import('./storage');
  jest.isolateModules(() => {
    mod = require('./storage');
  });
  return mod.eventFlyerUrl;
};

describe('eventFlyerUrl', () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = BASE;
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  });

  it('returns null for falsy values', () => {
    const eventFlyerUrl = loadEventFlyerUrl();
    expect(eventFlyerUrl(null)).toBeNull();
    expect(eventFlyerUrl(undefined)).toBeNull();
    expect(eventFlyerUrl('')).toBeNull();
  });

  it('passes absolute URLs through untouched (legacy Firebase rows)', () => {
    const eventFlyerUrl = loadEventFlyerUrl();
    const firebase =
      'https://firebasestorage.googleapis.com/v0/b/x/o/y?alt=media&token=z';
    expect(eventFlyerUrl(firebase)).toBe(firebase);
  });

  it('builds a public URL from a bucket-relative path', () => {
    const eventFlyerUrl = loadEventFlyerUrl();
    expect(eventFlyerUrl('abc.jpg')).toBe(
      `${BASE}/storage/v1/object/public/event-flyers/abc.jpg`
    );
  });

  it('strips leading slashes from the path', () => {
    const eventFlyerUrl = loadEventFlyerUrl();
    expect(eventFlyerUrl('/abc.jpg')).toBe(
      `${BASE}/storage/v1/object/public/event-flyers/abc.jpg`
    );
  });
});
