import type { NextConfig } from "next";

/**
 * Headers that apply to everything this origin serves.
 *
 * The content policy is not here. It carries a per-request nonce and so lives
 * in `src/proxy.ts`, scoped to the checkout document. These are the static ones
 * that are safe to set everywhere, including on the embed script itself.
 */
const BASE_HEADERS = [
  /* Stops a browser second-guessing a Content-Type. An asset served as text
     that a browser decides to run as script is a classic way in. */
  { key: "X-Content-Type-Options", value: "nosniff" },
  /* Other origins learn we were the referrer, and nothing else. Checkout URLs
     carry a session channel, and that has no business in anyone's logs. */
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  /* A payment form needs none of these. Turning them off means a compromised
     dependency cannot quietly ask for them either. */
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  reactCompiler: true,

  /* The wire contract ships as TypeScript source rather than a built package,
     so both sides always compile the same file and cannot drift apart. Next
     needs telling to compile it along with the app. */
  transpilePackages: ["@perch/protocol"],

  /* This app exists to be framed. Advertising the framework version to every
     merchant page that embeds it buys nothing. */
  poweredByHeader: false,

  async headers() {
    return [
      { source: "/:path*", headers: BASE_HEADERS },
      {
        /* The embed script is meant to be fetched by other origins, so it says
           so explicitly rather than relying on a default. It is also immutable
           per deployment, hence the long cache with revalidation. */
        source: "/perch.js",
        headers: [
          ...BASE_HEADERS,
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "Cache-Control", value: "public, max-age=300, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
