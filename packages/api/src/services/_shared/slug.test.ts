import { describe, expect, it } from 'vitest';
import {
  slugify,
  isValidSlug,
  generateUniqueSlug,
  SLUG_MAX_LENGTH,
} from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates whitespace/punctuation', () => {
    expect(slugify('Island Vibes Collective')).toBe('island-vibes-collective');
    expect(slugify('DJ Kala!!')).toBe('dj-kala');
    expect(slugify("Emman's Events")).toBe('emman-s-events');
  });

  it('collapses runs and trims leading/trailing separators', () => {
    expect(slugify('  --Hello___World--  ')).toBe('hello-world');
    expect(slugify('a   b')).toBe('a-b');
  });

  it('strips diacritics', () => {
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('returns empty for punctuation-only input', () => {
    expect(slugify('!!!')).toBe('');
  });
});

describe('isValidSlug', () => {
  it('accepts lowercase alphanumeric/hyphen within length', () => {
    expect(isValidSlug('eman-events')).toBe(true);
    expect(isValidSlug('abc')).toBe(true);
    expect(isValidSlug('a1-b2-c3')).toBe(true);
  });

  it('rejects too short / too long', () => {
    expect(isValidSlug('ab')).toBe(false);
    expect(isValidSlug('a'.repeat(SLUG_MAX_LENGTH + 1))).toBe(false);
  });

  it('rejects bad characters and hyphen placement', () => {
    expect(isValidSlug('Eman-Events')).toBe(false); // uppercase
    expect(isValidSlug('-eman')).toBe(false); // leading hyphen
    expect(isValidSlug('eman-')).toBe(false); // trailing hyphen
    expect(isValidSlug('eman--events')).toBe(false); // double hyphen
    expect(isValidSlug('eman events')).toBe(false); // space
  });

  it('rejects reserved slugs', () => {
    expect(isValidSlug('settings')).toBe(false);
    expect(isValidSlug('admin')).toBe(false);
  });
});

describe('generateUniqueSlug', () => {
  const taken = (set: Set<string>) => (s: string) => set.has(s);

  it('returns the plain slug when free', () => {
    expect(generateUniqueSlug('Island Vibes', taken(new Set()))).toBe(
      'island-vibes'
    );
  });

  it('appends an incrementing suffix on collision', () => {
    expect(
      generateUniqueSlug('Island Vibes', taken(new Set(['island-vibes'])))
    ).toBe('island-vibes-2');
    expect(
      generateUniqueSlug(
        'Island Vibes',
        taken(new Set(['island-vibes', 'island-vibes-2']))
      )
    ).toBe('island-vibes-3');
  });

  it('lengthens a too-short root to satisfy the minimum', () => {
    const out = generateUniqueSlug('a', taken(new Set()));
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(isValidSlug(out)).toBe(true);
  });

  it('falls back when input slugifies to empty', () => {
    expect(generateUniqueSlug('!!!', taken(new Set()))).toBe('org');
  });

  it('skips reserved roots', () => {
    const out = generateUniqueSlug('settings', taken(new Set()));
    expect(out).toBe('settings-2');
  });

  it('keeps the suffixed slug within the max length', () => {
    const long = 'a'.repeat(SLUG_MAX_LENGTH + 10);
    const out = generateUniqueSlug(
      long,
      taken(new Set([long.slice(0, SLUG_MAX_LENGTH)]))
    );
    expect(out.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(out.endsWith('-2')).toBe(true);
  });
});
