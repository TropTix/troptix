import React from 'react';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication - TropTix',
  description:
    'Sign in or create a TropTix account to access your events and tickets.',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-linear-to-b from-gray-100 to-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="pt-32 pb-12 md:pt-40 md:pb-20">{children}</div>
      </div>
    </div>
  );
}
