const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Canonical row-id generator (alphanum upper, 12 chars) — the format used for
 * every primary key in the schema. Mirrors `apps/web`'s `generateId`; the two
 * should be consolidated when the app moves onto the service layer.
 *
 * CSPRNG id over a 36-symbol uppercase-alphanumeric alphabet (same format as
 * before). Web Crypto is available in Node 18+, the browser, the edge runtime,
 * and the jsdom test env. Rejection sampling keeps the distribution uniform
 * (256 % 36 != 0, so a naive modulo would bias toward earlier symbols). The
 * reservation id is the checkout's authorization token — all commit mutations
 * are `publicProcedure`, so it must not be predictable from prior ids.
 */
export function generateId(): string {
  const len = 12;
  const max = 256 - (256 % ALPHABET.length); // reject bytes >= 252 (avoid modulo bias)
  const out: string[] = [];
  while (out.length < len) {
    const bytes = new Uint8Array(len - out.length);
    globalThis.crypto.getRandomValues(bytes);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b < max) out.push(ALPHABET[b % ALPHABET.length]);
    }
  }
  return out.join('');
}
