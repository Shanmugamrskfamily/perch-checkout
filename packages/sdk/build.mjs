/**
 * Builds the Perch embed script.
 *
 * Two things about this build are deliberate:
 *
 * 1. The output is an IIFE with no module wrapper and no runtime dependencies.
 *    This file gets dropped into a stranger's website with a plain <script> tag,
 *    so it cannot assume a bundler, a module loader, or any global beyond the
 *    browser's own. It also must not collide with whatever the host page already
 *    has loaded.
 *
 * 2. It is emitted into the checkout app's `public/` directory as well as the
 *    package's own `dist/`. The script and the checkout iframe are served from
 *    the same origin on purpose: the script can then derive the checkout URL
 *    from its own <script> tag rather than having it hardcoded or configured,
 *    which is how real payment SDKs are distributed.
 */

import { build, context } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** Where the checkout app serves static files from. */
const checkoutPublic = resolve(repoRoot, "apps", "checkout", "public", "perch.js");
const packageDist = resolve(here, "dist", "perch.js");

const watch = process.argv.includes("--watch");

/** @type {import("esbuild").BuildOptions} */
const shared = {
  entryPoints: [resolve(here, "src", "index.ts")],
  bundle: true,
  format: "iife",
  target: ["es2020"],
  platform: "browser",
  // No `globalName`. The script installs its own single global explicitly so
  // that the property is non-enumerable and non-writable — see src/index.ts.
  legalComments: "none",
  logLevel: "info",
};

async function run() {
  const targets = [
    { ...shared, outfile: packageDist, minify: true, sourcemap: true },
    { ...shared, outfile: checkoutPublic, minify: !watch, sourcemap: true },
  ];

  if (watch) {
    const contexts = await Promise.all(targets.map((options) => context(options)));
    await Promise.all(contexts.map((ctx) => ctx.watch()));
    console.log("[perch/sdk] watching for changes…");
    return;
  }

  await Promise.all(targets.map((options) => build(options)));
  console.log("[perch/sdk] built perch.js");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
