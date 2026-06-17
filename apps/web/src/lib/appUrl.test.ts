/**
 * `getAppBaseUrl` resolves the app's absolute origin from Vercel's system env
 * vars with a documented precedence: preview deploy URL → production domain →
 * `NEXT_PUBLIC_APP_URL` → localhost. `absoluteUrl` joins a path onto it. Env is
 * read at call time, so each case just sets the vars it needs.
 */
import { getAppBaseUrl, absoluteUrl } from './appUrl';

const VERCEL_KEYS = [
  'VERCEL_ENV',
  'VERCEL_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'NEXT_PUBLIC_APP_URL',
] as const;

describe('getAppBaseUrl', () => {
  const original: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of VERCEL_KEYS) {
      original[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of VERCEL_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it('uses the deploy URL on preview, even when a production domain is set', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_URL = 'troptix-abc123.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'usetroptix.com';
    expect(getAppBaseUrl()).toBe('https://troptix-abc123.vercel.app');
  });

  it('uses the canonical production domain in production', () => {
    process.env.VERCEL_ENV = 'production';
    process.env.VERCEL_URL = 'troptix-xyz789.vercel.app';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'usetroptix.com';
    expect(getAppBaseUrl()).toBe('https://usetroptix.com');
  });

  it('falls back to NEXT_PUBLIC_APP_URL when no Vercel vars are present', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://staging.example.com';
    expect(getAppBaseUrl()).toBe('https://staging.example.com');
  });

  it('falls back to localhost when nothing is set', () => {
    expect(getAppBaseUrl()).toBe('http://localhost:3000');
  });

  it('does not use a preview deploy URL when VERCEL_URL is missing', () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.VERCEL_PROJECT_PRODUCTION_URL = 'usetroptix.com';
    expect(getAppBaseUrl()).toBe('https://usetroptix.com');
  });
});

describe('absoluteUrl', () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.VERCEL_ENV;
    delete process.env.VERCEL_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com';
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it('joins a leading-slash path onto the base', () => {
    expect(absoluteUrl('/events/123')).toBe(
      'https://app.example.com/events/123'
    );
  });

  it('joins a slashless path onto the base', () => {
    expect(absoluteUrl('events/123')).toBe(
      'https://app.example.com/events/123'
    );
  });

  it('returns the bare base for an empty path', () => {
    expect(absoluteUrl()).toBe('https://app.example.com');
  });
});
