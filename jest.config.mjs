/**
 * Three projects, because three different things are worth proving.
 *
 * - `protocol` covers everything crossing the frame boundary. It is the
 *   security surface, and it is all pure functions, so there is no excuse for
 *   it to be untested.
 * - `sdk` covers the embed script's own behaviour on a host page.
 * - `checkout` covers the payment state machine, the gateway's idempotency, the
 *   money arithmetic and input validation. Deliberately no React: the rules
 *   worth testing were kept out of components precisely so they could be
 *   exercised directly rather than through the DOM.
 */

/** ts-jest needs CommonJS; the sources target ESM for the browser. */
const transform = {
  "^.+\\.tsx?$": [
    "ts-jest",
    {
      tsconfig: {
        module: "CommonJS",
        moduleResolution: "node",
        verbatimModuleSyntax: false,
        isolatedModules: false,
        jsx: "react-jsx",
        esModuleInterop: true,
        target: "ES2020",
        lib: ["ES2020", "DOM"],
        strict: true,
      },
    },
  ],
};

/**
 * The protocol package ships TypeScript source rather than a build, so Jest has
 * to be told to compile it. By default nothing under node_modules is
 * transformed, and the workspace symlink puts it there.
 */
const transformIgnorePatterns = ["/node_modules/(?!@perch/)"];

const protocolAlias = {
  "^@perch/protocol$": "<rootDir>/../../packages/protocol/src/index.ts",
};

/** @type {import("jest").Config} */
export default {
  projects: [
    {
      displayName: "protocol",
      rootDir: "./packages/protocol",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
      transform,
    },
    {
      displayName: "sdk",
      rootDir: "./packages/sdk",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
      transform,
      transformIgnorePatterns,
      moduleNameMapper: protocolAlias,
    },
    {
      displayName: "checkout",
      rootDir: "./apps/checkout",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
      transform,
      transformIgnorePatterns,
      setupFilesAfterEnv: ["<rootDir>/../../jest.setup.ts"],
      moduleNameMapper: {
        ...protocolAlias,
        "^@/(.*)$": "<rootDir>/src/$1",
      },
    },
  ],
  collectCoverageFrom: [
    "packages/*/src/**/*.ts",
    "apps/checkout/src/**/*.{ts,tsx}",
    "!**/*.test.{ts,tsx}",
    "!**/*.d.ts",
  ],
};
