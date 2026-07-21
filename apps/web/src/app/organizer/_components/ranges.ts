import type { DashboardRange } from '@troptix/api';

/**
 * Shared by the server page and the client selector, so it lives outside the
 * `'use client'` boundary — exports of a client module become client-reference
 * stubs in the server graph, and a lookup against one silently yields undefined.
 */
export const RANGE_LABELS: Record<DashboardRange, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'Past week',
  month: 'Past month',
};
