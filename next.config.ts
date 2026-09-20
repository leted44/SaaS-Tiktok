import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Kept out of the bundle but still traced into every serverless function
  // that imports them, which is what copies them into the deployment.
  serverExternalPackages: ["@remotion/bundler", "@remotion/renderer", "@remotion/cli", "@remotion/lambda", "@remotion/lambda-client", "esbuild"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
