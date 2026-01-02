import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: true,
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
