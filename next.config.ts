import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

let supabaseConnect = "https://*.supabase.co wss://*.supabase.co";

if (supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).host;
    supabaseConnect = `https://${host} wss://${host}`;
  } catch {
    // Keep the wildcard fallback when the URL is not parseable.
  }
}

// Report-Only while we roll out: browsers send violation reports but do not
// enforce. Candidate for enforcement once the report data is reviewed.
// External hosts in use: Turnstile (script/frame/connect), Supabase (connect),
// the upload host (img/media), embed iframes (frame). Fonts are self-hosted
// via next/font.
const contentSecurityPolicyReportOnly = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://files.catbox.moe",
  "media-src 'self' https://files.catbox.moe",
  "font-src 'self'",
  `connect-src 'self' ${supabaseConnect} https://challenges.cloudflare.com`,
  // Embeds are limited to the providers whitelisted in src/lib/embeds.ts.
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://www.redditmedia.com https://www.facebook.com https://platform.twitter.com https://www.instagram.com https://www.tiktok.com https://open.spotify.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "report-uri /api/csp-reports",
].join("; ");

const nextConfig: NextConfig = {
  // Auth server actions receive passwords and CAPTCHA tokens. Keep them out
  // of the development terminal logs.
  logging: {
    serverFunctions: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  // The proxy (src/proxy.ts) buffers request bodies up to 10 MB by default,
  // which would truncate a video upload before /api/uploads could validate it.
  // Keep this above MEDIA_MAX_VIDEO_MB (50) plus multipart overhead; the route
  // still enforces the real per-type limits while streaming.
  experimental: {
    proxyClientMaxBodySize: "52mb",
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicyReportOnly,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
