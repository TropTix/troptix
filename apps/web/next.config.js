/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        // Share links in the wild still use the legacy /events/[id] path (ADR 0018).
        source: '/events/:eventId',
        destination: '/e/:eventId',
        permanent: true,
      },
      {
        source: '/events',
        destination: '/discover',
        permanent: true,
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: '/ingest/static/:path*',
        destination: 'https://us-assets.i.posthog.com/static/:path*',
      },
      {
        source: '/ingest/:path*',
        destination: 'https://us.i.posthog.com/:path*',
      },
      {
        source: '/ingest/decide',
        destination: 'https://us.i.posthog.com/decide',
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,

  experimental: {
    externalDir: true,
  },
  reactStrictMode: false,
  images: {
    imageSizes: [16, 32, 48, 64, 96, 128, 160, 256, 384],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'placehold.co',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
    ],
  },
  transpilePackages: ['@troptix/db', '@troptix/api', '@troptix/transactional'],
};

const withVercelToolbar = require('@vercel/toolbar/plugins/next')();
module.exports = withVercelToolbar(nextConfig);
