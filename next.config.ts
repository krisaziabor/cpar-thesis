import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include the yt-dlp binary in Vercel's serverless function bundle.
  // Output file tracing traces JS imports but not binaries downloaded by postinstall.
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/yt-dlp-exec/bin/**"],
  },

  // Native addon packages (.node binaries) must not be bundled — they must be
  // required at runtime by Node.js directly.
  serverExternalPackages: [
    "@napi-rs/canvas",
    "canvas",
    "mupdf",
    "pdf-parse",
    "pdfjs-dist",
    "@distube/ytdl-core",
    // Ships a real yt-dlp binary under bin/ — must not be bundled or __dirname breaks (ENOENT).
    "yt-dlp-exec",
  ],

  // Turbopack (dev default in Next.js 16) handles native modules without
  // explicit config. The empty object satisfies the "turbopack config present"
  // check and silences the warning.
  turbopack: {},

  // webpack config is still used for `next build` (production).
  webpack: (config, { isServer }) => {
    if (isServer) {
      // canvas is a native module — tell webpack to require() it at runtime
      // rather than trying to bundle it.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        { canvas: "commonjs canvas" },
      ];
    }
    return config;
  },
};

export default nextConfig;
