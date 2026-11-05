import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Auth server actions receive passwords and CAPTCHA tokens. Keep them out
  // of the development terminal logs.
  logging: {
    serverFunctions: false,
  },
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
