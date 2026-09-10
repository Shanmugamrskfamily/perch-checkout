/**
 * Perch — the embed script.
 *
 * A merchant adds one tag and calls one function:
 *
 *     <script src="https://checkout.perch.dev/perch.js"></script>
 *     <script>
 *       Perch.open({
 *         productId: "prod_123",
 *         onSuccess: ({ sessionId }) => {},
 *         onClose:   ({ reason })    => {},
 *         onError:   ({ code, message }) => {},
 *       });
 *     </script>
 *
 * The API is one function and one handle, on purpose. Every option is another
 * thing a merchant can get wrong at four in the morning, and every one that
 * touches appearance is another way a payment form can be made to look like
 * something it is not.
 */

import { isProductId, sanitiseTheme, type CheckoutTheme, type CloseReason, type ErrorCode } from "@perch/protocol";
import { startSession, type Session } from "./session";

export interface CheckoutResult {
  readonly sessionId: string;
}

export interface CheckoutClosed {
  readonly reason: CloseReason;
}

export interface CheckoutError {
  readonly code: ErrorCode;
  readonly message: string;
}

export interface OpenOptions {
  /** The product to charge for. Looks like `prod_` followed by an id. */
  productId: string;
  /** Optional, and deliberately narrow. See `CheckoutTheme`. */
  theme?: CheckoutTheme;
  /**
   * Payment completed.
   *
   * This is a user-interface signal, not proof of payment. Anyone can open a
   * console and call it. Fulfil orders from the server-side webhook, which is
   * signed and cannot be forged by the customer's browser.
   */
  onSuccess?: (result: CheckoutResult) => void;
  /** The checkout went away. Always fires, exactly once, last. */
  onClose?: (result: CheckoutClosed) => void;
  /** A terminal failure. Declined cards do not appear here. */
  onError?: (error: CheckoutError) => void;
}

export interface CheckoutHandle {
  /** Ask the checkout to close. Safe to call more than once, and after close. */
  close(): void;
  /** False once the checkout has finished, for any reason. */
  readonly isOpen: boolean;
}

/**
 * Where the checkout lives.
 *
 * Derived from this script's own `src` rather than configured, so a merchant
 * cannot point the SDK at a different checkout by editing an attribute, and so
 * there is no origin to keep in sync between the tag and the call.
 *
 * `document.currentScript` is only meaningful while the script is evaluating,
 * so it is read once at load. It is also null whenever the script did not
 * arrive as a plain tag — bundled by the merchant, injected dynamically, run
 * from a module — so there is a fallback that finds the tag by its filename.
 * Between them, every reasonable way of loading this file is covered.
 */
const ORIGIN_AT_LOAD = originOf((document.currentScript as HTMLScriptElement | null)?.src);

function originOf(src: string | undefined): string | null {
  if (!src) return null;
  try {
    return new URL(src, window.location.href).origin;
  } catch {
    return null;
  }
}

function checkoutOrigin(): string | null {
  if (ORIGIN_AT_LOAD) return ORIGIN_AT_LOAD;

  const tags = Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"));
  for (const tag of tags) {
    if (/\/perch\.js(\?|$)/.test(tag.src)) return originOf(tag.src);
  }
  return null;
}

/** At most one checkout at a time, page-wide. See `open()` for why. */
let active: Session | null = null;

/** A handle for a session that never started. `close()` on it is a no-op. */
function inertHandle(): CheckoutHandle {
  return {
    close() {},
    get isOpen() {
      return false;
    },
  };
}

/**
 * Reports a failure the way a real session would, so a merchant's error path is
 * the same whether the checkout failed to start or failed later.
 *
 * Deferred to a task rather than called inline, because callbacks must never
 * run before `open()` has returned its handle.
 */
function reportStartupFailure(
  options: OpenOptions,
  code: ErrorCode,
  message: string,
): CheckoutHandle {
  console.error(`[perch] ${message}`);
  setTimeout(() => {
    try {
      options.onError?.({ code, message });
    } catch (error) {
      console.error("[perch] merchant onError callback threw:", error);
    }
    try {
      options.onClose?.({ reason: "error" });
    } catch (error) {
      console.error("[perch] merchant onClose callback threw:", error);
    }
  }, 0);
  return inertHandle();
}

/**
 * Opens the checkout.
 *
 * Calling it again while a checkout is already open returns the handle to the
 * existing one instead of opening a second. This is the answer to "what happens
 * if someone hits Buy twice": nothing visible, because the second click cannot
 * produce a second session to pay for. Making this the SDK's behaviour rather
 * than the merchant's problem means every integration gets it right, including
 * the ones that forget to disable their button.
 */
function open(options: OpenOptions): CheckoutHandle {
  if (!options || typeof options !== "object") {
    console.error("[perch] open() needs an options object with a productId.");
    return inertHandle();
  }

  const origin = checkoutOrigin();
  if (!origin) {
    return reportStartupFailure(
      options,
      "checkout_unavailable",
      "Perch could not work out where it was loaded from. Include perch.js with a normal <script src> tag.",
    );
  }

  if (!isProductId(options.productId)) {
    return reportStartupFailure(
      options,
      "invalid_options",
      `Expected a product id like "prod_123", received ${JSON.stringify(options.productId)}.`,
    );
  }

  if (active?.isOpen) {
    console.warn("[perch] A checkout is already open; ignoring this call.");
    return handleFor(active);
  }

  const { theme, dropped } = sanitiseTheme(options.theme);
  if (dropped.length > 0) {
    /* Loud in development, harmless in production: the merchant gets a working
       checkout in the house style and a console message naming exactly what was
       ignored, rather than silence and a theme that mysteriously did nothing. */
    console.warn(
      `[perch] Ignored unsupported theme ${dropped.length === 1 ? "option" : "options"}: ${dropped.join(", ")}.`,
    );
  }

  const session = startSession({
    checkoutOrigin: origin,
    productId: options.productId,
    theme,
    onSuccess: options.onSuccess,
    onClose: options.onClose,
    onError: options.onError,
    onFinished: () => {
      if (active === session) active = null;
    },
  });

  active = session;
  return handleFor(session);
}

function handleFor(session: Session): CheckoutHandle {
  return {
    close() {
      session.requestClose();
    },
    get isOpen() {
      return session.isOpen;
    },
  };
}

const Perch = Object.freeze({ open });

/**
 * Installs a global without letting it be replaced.
 *
 * Non-writable and non-configurable so a script that loads after us cannot swap
 * `Perch.open` for a look-alike that collects card numbers on the host page.
 * That is a real attack against embedded payment scripts and the defence costs
 * one property descriptor.
 *
 * If the name is already taken — usually the tag included twice — we leave the
 * first copy alone rather than fight over it.
 */
function install(name: string, value: unknown): void {
  if (name in window) return;
  Object.defineProperty(window, name, {
    value,
    writable: false,
    configurable: false,
    enumerable: false,
  });
}

install("Perch", Perch);
/* The assignment brief sketches the API as `DodoCheckout.open({ … })`. The
   product is called Perch, but a published example should keep working, so the
   name is aliased rather than argued with. */
install("DodoCheckout", Perch);

declare global {
  interface Window {
    readonly Perch: typeof Perch;
    readonly DodoCheckout: typeof Perch;
  }
}

export type { CheckoutTheme };
export default Perch;
