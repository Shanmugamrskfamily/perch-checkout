/**
 * One checkout session: the iframe, the conversation with it, and the promises
 * the SDK makes to the merchant about when their callbacks run.
 *
 * The callback guarantees are the API's whole contract, so they are stated
 * plainly and enforced in one place rather than assumed:
 *
 *   - `onClose` fires exactly once, and always last. A merchant can re-enable
 *     their Buy button there without tracking which other callback ran.
 *   - `onSuccess` fires at most once, before `onClose`.
 *   - `onError` fires at most once, before `onClose`, and only for terminal
 *     failures. A declined card is not one: that is recoverable inside the
 *     checkout and is none of the merchant page's business.
 *   - Nothing fires synchronously from `open()`, so `const h = Perch.open(…)`
 *     is always assigned before any callback can reference it.
 */

import {
  createChannelId,
  envelope,
  parseFrameMessage,
  type CheckoutTheme,
  type CloseReason,
  type ErrorCode,
  type HostMessage,
} from "@perch/protocol";
import { READY_TIMEOUT_MS, createOverlay, type Overlay } from "./overlay";

/**
 * How long to wait for a polite close before forcing it.
 *
 * This is a backstop for a frame that has stopped answering, not a race against
 * the checkout's own confirmation dialog: a checkout that is deliberately
 * holding says so, and that stands the timer down.
 */
const CLOSE_GRACE_MS = 4_000;

export interface SessionCallbacks {
  readonly onSuccess?: ((result: { sessionId: string }) => void) | undefined;
  readonly onClose?: ((result: { reason: CloseReason }) => void) | undefined;
  readonly onError?: ((result: { code: ErrorCode; message: string }) => void) | undefined;
}

export interface SessionConfig extends SessionCallbacks {
  readonly checkoutOrigin: string;
  readonly productId: string;
  readonly theme: CheckoutTheme | null;
  /** Called once the session is finished, so the SDK can drop its reference. */
  readonly onFinished: () => void;
}

export interface Session {
  /** Ask the checkout to close. It may decline while a payment is in flight. */
  requestClose(): void;
  readonly isOpen: boolean;
}

/**
 * Runs a merchant-supplied callback without letting it take the SDK down.
 *
 * A merchant's `onSuccess` throwing must not prevent us restoring their page's
 * scroll position and removing our overlay. Their bug, our mess to avoid.
 */
function safely(label: string, run: (() => void) | undefined): void {
  if (!run) return;
  try {
    run();
  } catch (error) {
    console.error(`[perch] merchant ${label} callback threw:`, error);
  }
}

export function startSession(config: SessionConfig): Session {
  const channel = createChannelId();

  const url = new URL("/checkout", config.checkoutOrigin);
  url.searchParams.set("channel", channel);
  /* The checkout is told which origin claims to be embedding it. It is a claim,
     not proof, so the checkout verifies it against the referrer and its own
     allowlist before answering. Passing it explicitly keeps the checkout
     working in Firefox, which has no `location.ancestorOrigins`. */
  url.searchParams.set("origin", window.location.origin);

  let ready = false;
  let finished = false;
  let outcomeReported = false;

  let readyTimer: number | undefined;
  let closeTimer: number | undefined;

  const overlay: Overlay = createOverlay({
    src: url.toString(),
    onDismiss: () => requestClose(),
    onFocusEscape: (edge) => {
      /* Only meaningful once the checkout is live. Before that there is nothing
         inside the frame to give focus to. */
      if (!ready || finished) return;
      send({ type: "focus", edge });
    },
  });

  function send(message: HostMessage): void {
    const target = overlay.iframe.contentWindow;
    if (!target) return;
    /* Always addressed to the checkout's exact origin, never `"*"`. A wildcard
       target means the message is delivered to whatever document happens to
       occupy that frame, which after a redirect need not be ours. */
    target.postMessage(envelope(channel, message), config.checkoutOrigin);
  }

  function onMessage(event: MessageEvent): void {
    /* Three checks, in cheapest-first order, before the payload is trusted at
       all. The `source` check is the one people forget: without it any document
       able to reach this window can impersonate the checkout simply by knowing
       its origin. */
    if (event.source !== overlay.iframe.contentWindow) return;
    if (event.origin !== config.checkoutOrigin) return;

    const message = parseFrameMessage(event.data, channel);
    if (!message) return;

    switch (message.type) {
      case "ready": {
        if (ready) return;
        ready = true;
        window.clearTimeout(readyTimer);
        overlay.reveal();
        send({ type: "init", productId: config.productId, theme: config.theme });
        return;
      }

      case "resize":
        overlay.setHeight(message.height);
        return;

      case "succeeded": {
        if (outcomeReported) return;
        outcomeReported = true;
        safely("onSuccess", () => config.onSuccess?.({ sessionId: message.sessionId }));
        return;
      }

      case "failed": {
        if (outcomeReported) return;
        outcomeReported = true;
        const { code, message: text } = message;
        safely("onError", () => config.onError?.({ code, message: text }));
        return;
      }

      case "closeDeferred":
        /* The checkout is asking the customer to confirm rather than ignoring
           us, so the force-close backstop stands down. It only exists for a
           frame that has stopped answering. */
        window.clearTimeout(closeTimer);
        return;

      case "closed":
        finish(message.reason);
        return;
    }
  }

  function finish(reason: CloseReason): void {
    if (finished) return;
    finished = true;

    window.clearTimeout(readyTimer);
    window.clearTimeout(closeTimer);
    window.removeEventListener("message", onMessage);

    overlay.destroy();
    config.onFinished();

    safely("onClose", () => config.onClose?.({ reason }));
  }

  function fail(code: ErrorCode, text: string): void {
    if (!outcomeReported) {
      outcomeReported = true;
      safely("onError", () => config.onError?.({ code, message: text }));
    }
    overlay.showFatal(text);
  }

  function requestClose(): void {
    if (finished) return;

    /* If the checkout never loaded there is nobody to ask, so close at once
       rather than making the customer wait out a grace period. */
    if (!ready) {
      finish("dismissed");
      return;
    }

    send({ type: "requestClose" });

    /* The checkout gets to decide what dismissal means right now — mid-payment
       it may want to confirm rather than vanish. But an unresponsive frame must
       never trap the customer, so a forced close backstops the request. */
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => finish("dismissed"), CLOSE_GRACE_MS);
  }

  window.addEventListener("message", onMessage);

  readyTimer = window.setTimeout(() => {
    if (ready) return;
    fail(
      "checkout_unavailable",
      "The checkout did not load. Check your connection and try again.",
    );
  }, READY_TIMEOUT_MS);

  return {
    requestClose,
    get isOpen() {
      return !finished;
    },
  };
}
