import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,

  /* The wire contract ships as TypeScript source rather than a built package,
     so both sides always compile the same file and cannot drift apart. Next
     needs telling to compile it along with the app. */
  transpilePackages: ["@perch/protocol"],

  /* This app exists to be framed. Advertising the framework version to every
     merchant page that embeds it buys nothing. */
  poweredByHeader: false,
};

export default nextConfig;
