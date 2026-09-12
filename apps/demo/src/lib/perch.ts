/**
 * The merchant's view of Perch.
 *
 * A real store would get these types from a published package. Declaring them
 * here keeps the demo honest: it consumes the global exactly as any site would,
 * through the script tag, with no shared build and no private access.
 */

export type PerchCloseReason = "completed" | "dismissed" | "expired" | "host" | "error";

export type PerchErrorCode =
  | "unknown_product"
  | "invalid_options"
  | "checkout_unavailable"
  | "session_expired";

export interface PerchOpenOptions {
  productId: string;
  theme?: { accent?: string; radius?: "sharp" | "soft" | "round" };
  onSuccess?: (result: { sessionId: string }) => void;
  onClose?: (result: { reason: PerchCloseReason }) => void;
  onError?: (error: { code: PerchErrorCode; message: string }) => void;
}

export interface PerchHandle {
  close(): void;
  readonly isOpen: boolean;
}

export interface PerchGlobal {
  open(options: PerchOpenOptions): PerchHandle;
}

declare global {
  interface Window {
    Perch?: PerchGlobal;
  }
}

/** The deployed checkout. Overridden by the environment variable when set. */
const HOSTED_CHECKOUT = "https://perch-checkout-app.vercel.app";

/**
 * Where the checkout is served from. The same origin serves `perch.js`.
 *
 * The fallback keys off `NODE_ENV` rather than inspecting `window.location`,
 * because it is inlined at build time and so resolves to the same string on the
 * server and in the browser. Deciding this from the hostname at runtime would
 * render one value during server rendering and a different one on hydration,
 * which React would rightly complain about.
 */
export const CHECKOUT_ORIGIN =
  process.env.NEXT_PUBLIC_CHECKOUT_ORIGIN ??
  (process.env.NODE_ENV === "production" ? HOSTED_CHECKOUT : "http://localhost:3001");

export const PERCH_SCRIPT_URL = `${CHECKOUT_ORIGIN}/perch.js`;
