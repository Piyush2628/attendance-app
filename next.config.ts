import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // "Workers" was renamed to "Employees"; keep old bookmarks working.
    return [
      { source: "/admin/workers", destination: "/admin/employees", permanent: true },
      // Advances (khata) now live on the Payroll page.
      { source: "/admin/khata", destination: "/admin/payroll", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // The punch screen must never be framed by another site (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
      {
        // Always fetch the newest service worker.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
