import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: process.env.NEXT_PUBLIC_SUPABASE_URL
    ? {
        remotePatterns: [
          {
            protocol: "https",
            hostname: new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host,
            pathname: "/storage/v1/object/**",
          },
        ],
        // Allow optimized loading from our local proxy endpoint (any subpath)
        localPatterns: [
          {
            pathname: '/api/images/proxy/**',
          },
        ],
        // Enable image optimization for better performance and cost savings
        formats: ['image/avif', 'image/webp'],
        minimumCacheTTL: 12600, // 3.5 hours (slightly less than signed URL expiry)
        // Allow unoptimized for same-origin API routes (they'll be optimized by Next.js)
        unoptimized: false,
      }
    : undefined,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
