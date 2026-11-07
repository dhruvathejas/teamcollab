import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev` only blocks its live-reload and dev assets for origins other
  // than localhost. Allow private-network addresses (and .local names) so the
  // dev server also works when opened as http://<this computer's IP>:3000,
  // e.g. from a phone on the same Wi-Fi. No effect on production builds.
  allowedDevOrigins: ["10.*.*.*", "172.*.*.*", "192.168.*.*", "*.local"],
  cacheComponents: true,
  partialPrefetching: true,
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
