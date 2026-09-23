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
  },
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
