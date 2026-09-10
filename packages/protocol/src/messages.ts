/**
 * The wire contract between the embed script (running on the merchant's page)
 * and the checkout (running in a cross-origin iframe).
 *
 * Both sides compile against this file, so the contract cannot drift. It is
 * deliberately small: every message added here is another thing the host page
 * can see or influence, and the design goal is that the host learns outcomes
 * and nothing else.
 */

/** Bumped only on a breaking change. Mismatched versions are ignored, not coerced. */
export const PROTOCOL_VERSION = 1 as const;

/** Marks a message as ours so unrelated postMessage traffic is cheap to reject. */
export const PROTOCOL_NAME = "perch" as const;

// ---------------------------------------------------------------------------
// Outcomes the host is allowed to know about
// ---------------------------------------------------------------------------

/**
 * Why the checkout went away.
 *
 * `onClose` always fires exactly once, and always last, so a host can rely on
 * it to re-enable a Buy button without tracking which other callback ran.
 */
export type CloseReason =
  /** Payment succeeded and the customer dismissed the receipt. */
  | "completed"
  /** Customer backed out: escape key, close button, or overlay click. */
  | "dismissed"
  /** The session outlived its window before payment completed. */
  | "expired"
  /** The merchant's own code called `close()` on the handle. */
  | "host"
  /** A terminal error ended the session; `onError` fired first with detail. */
  | "error";

/**
 * Terminal failures only.
 *
 * A declined card is *not* in this list. A decline is recoverable inside the
 * checkout — the customer tries another card — and telling the merchant's page
 * about it would leak the customer's payment troubles to a party that cannot
 * act on them anyway. Merchants learn about declines server-side, from the
 * webhook, where the information is both trustworthy and useful.
 */
export type ErrorCode =
  /** The product id does not resolve. Almost always a merchant integration bug. */
  | "unknown_product"
  /** `open()` was called with something the SDK refuses to send. */
  | "invalid_options"
  /** The checkout iframe never became ready. */
  | "checkout_unavailable"
  /** The session window closed before payment completed. */
  | "session_expired";

/**
 * The subset of appearance a merchant may control.
 *
 * Deliberately tiny. A merchant who can restyle the checkout freely can make it
 * look like something it is not, and the customer's only defence against a
 * spoofed payment form is that it looks consistent everywhere they meet it.
 * Anything outside this shape is dropped rather than sanitised, because a
 * silently-corrected value is a value someone will come to depend on.
 */
export interface CheckoutTheme {
  /** Six-digit hex, used for the primary action and focus rings. */
  accent?: string;
  /** Corner treatment, chosen from a fixed set rather than free-form pixels. */
  radius?: "sharp" | "soft" | "round";
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/**
 * Which end of the checkout's tab order to move focus to.
 *
 * `first` when the customer tabbed forward off the end of the form, `last`
 * when they shift-tabbed backwards off the start.
 */
export type FocusEdge = "first" | "last";

/** Sent by the embed script on the merchant's page, into the iframe. */
export type HostMessage =
  /** Answers the frame's `ready`. Carries everything the checkout needs to start. */
  | { readonly type: "init"; readonly productId: string; readonly theme: CheckoutTheme | null }
  /** The merchant called `close()`, or the customer hit escape outside the frame. */
  | { readonly type: "requestClose" }
  /**
   * Focus has tabbed out of the checkout; put it back.
   *
   * A modal normally traps focus by keeping it inside one document. Here the
   * modal *is* a different document, and neither side can see or move focus in
   * the other, so the trap has to be a conversation: the host notices focus
   * leaving and asks the frame to take it back.
   */
  | { readonly type: "focus"; readonly edge: FocusEdge };

/** Sent by the checkout, out of the iframe, to the merchant's page. */
export type FrameMessage =
  /** The checkout has mounted and is waiting for `init`. */
  | { readonly type: "ready" }
  /** The checkout's natural height changed; the host resizes the iframe to match. */
  | { readonly type: "resize"; readonly height: number }
  /** Payment completed. Not proof of payment — see the README on webhooks. */
  | { readonly type: "succeeded"; readonly sessionId: string }
  /** Terminal failure. Recoverable problems never reach the host. */
  | { readonly type: "failed"; readonly code: ErrorCode; readonly message: string }
  /** The checkout is finished and can be torn down. */
  | { readonly type: "closed"; readonly reason: CloseReason };

/**
 * Every message travels inside this wrapper.
 *
 * `channel` is a per-session random id. Both sides refuse messages carrying a
 * different one, which keeps two checkouts open on the same page from hearing
 * each other and makes a stray broadcast harmless.
 */
export interface Envelope<M> {
  readonly protocol: typeof PROTOCOL_NAME;
  readonly version: typeof PROTOCOL_VERSION;
  readonly channel: string;
  readonly message: M;
}

/** Wraps a message for sending. */
export function envelope<M>(channel: string, message: M): Envelope<M> {
  return { protocol: PROTOCOL_NAME, version: PROTOCOL_VERSION, channel, message };
}
