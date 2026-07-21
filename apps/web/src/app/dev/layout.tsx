import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

// Dev pages render locally and on Vercel preview deployments (where copy
// review happens), never in production.
const isProduction =
  process.env.VERCEL_ENV === 'production' ||
  (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');

export default function DevLayout({ children }: { children: ReactNode }) {
  if (isProduction) notFound();
  return children;
}
