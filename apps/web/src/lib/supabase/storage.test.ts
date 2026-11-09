// PUBLIC_BASE is read from env at module load, so each case re-imports the
// module in isolation with the env already set.
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

describe('eventFlyerPreviewUrl', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test';
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it('returns null when there is no flyer', () => {
    const { eventFlyerPreviewUrl } = require('./storage');
    expect(eventFlyerPreviewUrl(null)).toBeNull();
  });

  it('passes absolute URLs through untouched (legacy Firebase rows)', () => {
    const { eventFlyerPreviewUrl } = require('./storage');
    const firebase = 'https://firebasestorage.googleapis.com/v0/b/x/o/y';
    expect(eventFlyerPreviewUrl(firebase)).toBe(firebase);
  });

  it('points a bucket path at the resizing route', () => {
    const { eventFlyerPreviewUrl } = require('./storage');
    expect(eventFlyerPreviewUrl('/abc.png')).toBe(
      'https://app.test/api/og/flyer/abc.png'
    );
  });
});
