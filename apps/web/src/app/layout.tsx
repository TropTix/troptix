import React from 'react';
import { Analytics } from '@vercel/analytics/react';
import { VercelToolbar } from '@vercel/toolbar/next';
import { Metadata } from 'next';
import { Inter } from 'next/font/google';

import Providers from './providers';
import '../styles/globals.css';
import Toaster from '@/components/toaster';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
export const metadata: Metadata = {
  title: 'Troptix',
  description: 'Troptix is a better way to get tickets',
  icons: {
    icon: '/logos/TroptixLetter.png',
  },
  openGraph: {
    images: '/logos/TroptixWord.png',
    type: 'website',
    siteName: 'TropTix',
    title: 'TropTix',
    description: 'TropTix is a better way to get tickets',
    url: 'https://usetroptix.com',
    locale: 'en_US',
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const shouldInjectToolbar = process.env.NODE_ENV === 'development';

  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>
          {children}
          <Toaster />
          <Analytics />
          {shouldInjectToolbar && <VercelToolbar />}
        </Providers>
      </body>
    </html>
  );
}
