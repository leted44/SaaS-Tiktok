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
  // The carousel renderer reads its fonts from disk at request time, which the
  // bundler cannot see — list them so they are copied into that function.
  outputFileTracingIncludes: {
    "/api/carousels/[projectId]/slides/[index]": ["./src/assets/fonts/**"],
    // With the local render engine, this route bundles src/remotion at request
    // time, and those sources import across src/ through the "@" alias.
    "/api/jobs/process": ["./src/**", "./tsconfig.json"],
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
