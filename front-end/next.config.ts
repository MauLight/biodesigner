import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The renderer ships inside Electron as plain files; there's no Next server
  // to render or optimize anything at runtime.
  output: "export",
  images: {
    // The default loader proxies remote images through the server, which a
    // static export doesn't have.
    unoptimized: true,
  },
};

export default nextConfig;
