import type { NextConfig } from "next";
import path from "path";

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
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  turbopack: {
    root: path.resolve(__dirname, ".."),
  },
  async headers() {
    // Avoid mixed-content warnings and set baseline security headers
    const cspDirectives = [
      "upgrade-insecure-requests",
      "block-all-mixed-content",
    ].join("; ");

    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: cspDirectives },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
