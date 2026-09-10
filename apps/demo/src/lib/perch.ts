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

/** Where the checkout is served from. Same origin that serves `perch.js`. */
export const CHECKOUT_ORIGIN =
  process.env.NEXT_PUBLIC_CHECKOUT_ORIGIN ?? "http://localhost:3001";

export const PERCH_SCRIPT_URL = `${CHECKOUT_ORIGIN}/perch.js`;
