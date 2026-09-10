/**
 * Jest is configured with two projects rather than one, because the two halves
 * of this repo are tested for different reasons.
 *
 * - `sdk` covers the embed script: the message contract, origin checking, and
 *   the guarantees the public API makes to a host page. These are the tests
 *   that matter most, because the SDK is the part running on someone else's
 *   website.
 * - `checkout` covers the payment state machine, the fake gateway, and input
 *   validation. Pure logic, deliberately kept free of React so it can be
 *   tested directly rather than through the DOM.
 */

/** ts-jest needs CommonJS output; the source tsconfigs target ESM for the browser. */
const tsJestTransform = {
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
        strict: true,
      },
    },
  ],
};

/** @type {import("jest").Config} */
export default {
  projects: [
    {
      displayName: "sdk",
      rootDir: "./packages/sdk",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/**/*.test.ts"],
      transform: tsJestTransform,
    },
    {
      displayName: "checkout",
      rootDir: "./apps/checkout",
      testEnvironment: "jsdom",
      testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
      transform: tsJestTransform,
      setupFilesAfterEnv: ["<rootDir>/../../jest.setup.ts"],
      moduleNameMapper: {
        "^@/(.*)$": "<rootDir>/src/$1",
      },
    },
  ],
  collectCoverageFrom: [
    "packages/sdk/src/**/*.ts",
    "apps/checkout/src/**/*.{ts,tsx}",
    "!**/*.test.{ts,tsx}",
    "!**/*.d.ts",
  ],
};
