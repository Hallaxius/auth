import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    skipProxyUrlNormalize: true,
  },
};

export default nextConfig;