import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.devtool = false;
    }
    return config;
  },
};

export default nextConfig;
