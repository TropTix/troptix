/**
 * Unit tests for the row-id generator. The reservation id doubles as the
 * checkout's only authorization token (all commit mutations are
 * `publicProcedure`), so the format contract (12-char uppercase alphanum)
 * and the uniqueness of the underlying CSPRNG both matter here — pure, no DB.
 */
import { describe, expect, it } from 'vitest';
import { generateId } from './ids';

describe('generateId', () => {
  it('returns a 12-char uppercase-alphanumeric id', () => {
    expect(generateId()).toMatch(/^[0-9A-Z]{12}$/);
  });

  it('produces 1000 distinct ids across 1000 calls', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});
