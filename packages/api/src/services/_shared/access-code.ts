export function normalizeAccessCode(
  raw: string | null | undefined
): string | null {
  const code = raw?.trim().toUpperCase() ?? '';
  return code === '' ? null : code;
}

/** Public ticket types, plus every one the buyer's code unlocks (ADR 0035). */
export function accessibleTicketTypesWhere(code: string | null | undefined) {
  const normalized = normalizeAccessCode(code);
  return normalized === null
    ? { accessCode: null }
    : { OR: [{ accessCode: null }, { accessCode: normalized }] };
}
