import type { NextConfig } from "next";

/** Keeps Turbopack scoped to this app when the folder still lives inside another repo. */
const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
