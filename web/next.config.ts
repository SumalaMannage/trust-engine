import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // FastAPI serves the built site from web/out (see app/main.py mount_web), so this must stay a static export.
  output: "export",
  // Emit /check/index.html instead of /check.html: FastAPI's StaticFiles only finds the former on reload.
  trailingSlash: true,
  // No image optimization server in a static export.
  images: { unoptimized: true },
  // cacheComponents / partialPrefetching (create-next-app defaults) are left off: they need PPR, which static export rejects.
};

export default nextConfig;
