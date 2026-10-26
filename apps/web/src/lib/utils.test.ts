import { formatOrderNumber } from './utils';

describe('formatOrderNumber', () => {
  it('takes the first eight hex characters of the id, uppercased', () => {
    expect(formatOrderNumber('ab12c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d')).toBe(
      'TT-AB12C3D4'
    );
  });

  it('tells apart ids that share their first six characters', () => {
    const a = formatOrderNumber('ab12c3d4-0000-4000-8000-000000000000');
    const b = formatOrderNumber('ab12c3ff-0000-4000-8000-000000000000');
    expect(a).not.toBe(b);
  });
});
