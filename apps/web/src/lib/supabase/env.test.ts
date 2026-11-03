/**
 * @jest-environment node
 */

import { readSupabaseEnv } from './env';

// process.env is shared across every file in a Jest worker, so restore rather
// than delete.
const ORIGINAL_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIGINAL_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

function restore(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

let errorSpy: jest.SpyInstance;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  restore('NEXT_PUBLIC_SUPABASE_URL', ORIGINAL_URL);
  restore('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', ORIGINAL_KEY);
});

describe('readSupabaseEnv', () => {
  it('returns both values and logs nothing when both are set', () => {
    expect(readSupabaseEnv()).toEqual({
      url: 'https://example.supabase.co',
      key: 'sb_publishable_test',
    });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('returns null and names the key when only the key is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(readSupabaseEnv()).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
    expect(line).not.toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('returns null and names the url when only the url is missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(readSupabaseEnv()).toBeNull();
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(line).not.toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });

  it('treats an empty string as missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = '';

    expect(readSupabaseEnv()).toBeNull();
    expect(errorSpy.mock.calls[0][0]).toContain(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  });

  it('names both variables when both are missing', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(readSupabaseEnv()).toBeNull();
    const line = errorSpy.mock.calls[0][0] as string;
    expect(line).toContain('NEXT_PUBLIC_SUPABASE_URL');
    expect(line).toContain('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });
});
