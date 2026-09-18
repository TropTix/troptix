import type { DashboardRange } from '@troptix/api';

// Kept outside the `'use client'` boundary: a client module's exports become
// client-reference stubs in the server graph — lookups silently yield undefined.
export const RANGE_LABELS: Record<DashboardRange, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Past week',
  month: 'Past month',
};
