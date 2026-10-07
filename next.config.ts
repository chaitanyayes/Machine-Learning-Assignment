import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Prompts are read from /prompts at runtime; make sure they ship with the server functions.
  outputFileTracingIncludes: {
    "/api/**": ["./prompts/**/*.md"],
    "/**": ["./prompts/**/*.md"],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
