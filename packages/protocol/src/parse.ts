/**
 * Validation for everything crossing the frame boundary.
 *
 * `postMessage` will hand you literally anything: any script on the merchant's
 * page can address the iframe, browser extensions chatter on the same channel,
 * and `event.data` is typed `any` by the DOM lib, which is exactly the kind of
 * lie that turns into a runtime crash on someone else's website.
 *
 * So nothing here trusts a shape. Every field is checked, every unknown message
 * is dropped silently, and the return type is a real union the compiler can
 * narrow. Origin checking is *not* done here — that belongs to the side holding
 * the window reference, and both sides do it before calling in.
 */

import {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  type CheckoutTheme,
  type CloseReason,
  type ErrorCode,
  type FrameMessage,
  type HostMessage,
} from "./messages";

/**
 * A checkout taller than this is either a layout bug or a hostile frame trying
 * to make the host page unusable. Either way, refuse it rather than obey it.
 */
export const MAX_FRAME_HEIGHT = 4000;
const MIN_FRAME_HEIGHT = 1;

/** Product ids are opaque to the SDK, but they still have to look like ids. */
const PRODUCT_ID = /^prod_[A-Za-z0-9_-]{1,64}$/;

/**
 * Six-digit hex only.
 *
 * This one matters more than it looks. An accent colour is interpolated into a
 * stylesheet, and CSS is a language: an unvalidated string there can close the
 * declaration and open a new one. Named colours and `rgb()` are refused not
 * because they are dangerous but because allowing three syntaxes means writing
 * three parsers, and the third is where the bug lives.
 */
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;

const RADIUS_VALUES = ["sharp", "soft", "round"] as const;
const FOCUS_EDGES = ["first", "last"] as const;
const CLOSE_REASONS = ["completed", "dismissed", "expired", "host", "error"] as const;
const ERROR_CODES = [
  "unknown_product",
  "invalid_options",
  "checkout_unavailable",
  "session_expired",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOneOf<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): value is T[number] {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

/** True for a product id the SDK is willing to put on the wire. */
export function isProductId(value: unknown): value is string {
  return typeof value === "string" && PRODUCT_ID.test(value);
}

/**
 * Reduces whatever a merchant passed as a theme down to the allowlist.
 *
 * Unknown keys and malformed values are dropped rather than rejected, so a
 * merchant who mistypes one property still gets a working checkout in the house
 * style instead of no checkout at all. The SDK reports the dropped keys on the
 * console so the mistake is visible during development.
 */
export function sanitiseTheme(value: unknown): {
  theme: CheckoutTheme | null;
  dropped: string[];
} {
  if (!isRecord(value)) return { theme: null, dropped: [] };

  const theme: { accent?: string; radius?: "sharp" | "soft" | "round" } = {};
  const dropped: string[] = [];

  for (const key of Object.keys(value)) {
    if (key === "accent") {
      const accent = value["accent"];
      if (typeof accent === "string" && HEX_COLOUR.test(accent)) {
        theme.accent = accent.toLowerCase();
      } else {
        dropped.push("accent");
      }
    } else if (key === "radius") {
      const radius = value["radius"];
      if (isOneOf(radius, RADIUS_VALUES)) {
        theme.radius = radius;
      } else {
        dropped.push("radius");
      }
    } else {
      dropped.push(key);
    }
  }

  return {
    theme: Object.keys(theme).length > 0 ? theme : null,
    dropped,
  };
}

/**
 * Unwraps the envelope, or returns null.
 *
 * The channel comparison is what stops one checkout hearing another's traffic
 * on a page running two of them, and makes an unaddressed broadcast a no-op.
 */
function openEnvelope(data: unknown, expectedChannel: string): unknown {
  if (!isRecord(data)) return null;
  if (data["protocol"] !== PROTOCOL_NAME) return null;
  if (data["version"] !== PROTOCOL_VERSION) return null;
  if (typeof data["channel"] !== "string") return null;
  if (data["channel"] !== expectedChannel) return null;
  return data["message"] ?? null;
}

/** Parses a message sent by the host page into the checkout. */
export function parseHostMessage(data: unknown, channel: string): HostMessage | null {
  const message = openEnvelope(data, channel);
  if (!isRecord(message)) return null;

  switch (message["type"]) {
    case "init": {
      if (!isProductId(message["productId"])) return null;
      // The host's theme is re-sanitised here rather than trusted from the SDK.
      // The SDK runs on the merchant's page and is therefore under the
      // merchant's control; anything it sends is an assertion, not a fact.
      const { theme } = sanitiseTheme(message["theme"]);
      return { type: "init", productId: message["productId"], theme };
    }
    case "requestClose":
      return { type: "requestClose" };

    case "focus": {
      const edge = message["edge"];
      if (!isOneOf(edge, FOCUS_EDGES)) return null;
      return { type: "focus", edge };
    }

    default:
      return null;
  }
}

/** Parses a message sent by the checkout out to the host page. */
export function parseFrameMessage(data: unknown, channel: string): FrameMessage | null {
  const message = openEnvelope(data, channel);
  if (!isRecord(message)) return null;

  switch (message["type"]) {
    case "ready":
      return { type: "ready" };

    case "resize": {
      const height = message["height"];
      if (typeof height !== "number" || !Number.isFinite(height)) return null;
      const rounded = Math.round(height);
      if (rounded < MIN_FRAME_HEIGHT || rounded > MAX_FRAME_HEIGHT) return null;
      return { type: "resize", height: rounded };
    }

    case "succeeded": {
      const sessionId = message["sessionId"];
      if (typeof sessionId !== "string" || sessionId.length === 0) return null;
      return { type: "succeeded", sessionId };
    }

    case "failed": {
      const code = message["code"];
      const text = message["message"];
      if (!isOneOf(code, ERROR_CODES)) return null;
      if (typeof text !== "string") return null;
      return { type: "failed", code: code as ErrorCode, message: text };
    }

    case "closeDeferred":
      return { type: "closeDeferred" };

    case "closed": {
      const reason = message["reason"];
      if (!isOneOf(reason, CLOSE_REASONS)) return null;
      return { type: "closed", reason: reason as CloseReason };
    }

    default:
      return null;
  }
}

/**
 * A random channel id.
 *
 * `crypto.getRandomValues` rather than `Math.random` because the channel is a
 * weak capability: guessing it is one of the few things a script on the host
 * page could do to interfere with a session it does not own.
 */
export function createChannelId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}
