/**
 * The frame boundary is the security surface, so these are the tests that
 * matter most in the repo.
 *
 * `postMessage` will deliver anything: another script on the merchant's page,
 * a browser extension, a stray broadcast from an unrelated library. Every one
 * of those must be dropped in silence rather than crash a payment form on
 * somebody else's website.
 */

import { PROTOCOL_NAME, PROTOCOL_VERSION, envelope } from "./messages";
import {
  MAX_FRAME_HEIGHT,
  createChannelId,
  isProductId,
  parseFrameMessage,
  parseHostMessage,
  sanitiseTheme,
} from "./parse";

const CHANNEL = "0123456789abcdef0123456789abcdef";

/** Anything the browser might hand us that is not one of our messages. */
const JUNK: unknown[] = [
  undefined,
  null,
  0,
  "",
  "perch",
  [],
  {},
  { protocol: "perch" },
  { protocol: "other", version: 1, channel: CHANNEL, message: { type: "ready" } },
];

describe("envelope handling", () => {
  it.each(JUNK)("drops junk: %p", (value) => {
    expect(parseFrameMessage(value, CHANNEL)).toBeNull();
    expect(parseHostMessage(value, CHANNEL)).toBeNull();
  });

  it("drops a message addressed to a different channel", () => {
    const other = envelope("a-different-channel", { type: "ready" });
    expect(parseFrameMessage(other, CHANNEL)).toBeNull();
  });

  it("drops a message from a different protocol version", () => {
    const stale = {
      protocol: PROTOCOL_NAME,
      version: PROTOCOL_VERSION + 1,
      channel: CHANNEL,
      message: { type: "ready" },
    };
    expect(parseFrameMessage(stale, CHANNEL)).toBeNull();
  });

  it("drops an unknown message type", () => {
    expect(parseFrameMessage(envelope(CHANNEL, { type: "drop-tables" }), CHANNEL)).toBeNull();
    expect(parseHostMessage(envelope(CHANNEL, { type: "drop-tables" }), CHANNEL)).toBeNull();
  });
});

describe("frame to host messages", () => {
  it("accepts ready", () => {
    expect(parseFrameMessage(envelope(CHANNEL, { type: "ready" }), CHANNEL)).toEqual({
      type: "ready",
    });
  });

  it("accepts a plausible height and rounds it", () => {
    const parsed = parseFrameMessage(envelope(CHANNEL, { type: "resize", height: 412.6 }), CHANNEL);
    expect(parsed).toEqual({ type: "resize", height: 413 });
  });

  it.each([NaN, Infinity, -Infinity, 0, -50, MAX_FRAME_HEIGHT + 1, "500", null])(
    "refuses an implausible height: %p",
    (height) => {
      expect(parseFrameMessage(envelope(CHANNEL, { type: "resize", height }), CHANNEL)).toBeNull();
    },
  );

  it("refuses an empty session id on success", () => {
    expect(
      parseFrameMessage(envelope(CHANNEL, { type: "succeeded", sessionId: "" }), CHANNEL),
    ).toBeNull();
  });

  it("refuses an error code that is not one of ours", () => {
    const forged = envelope(CHANNEL, { type: "failed", code: "card_declined", message: "hi" });
    expect(parseFrameMessage(forged, CHANNEL)).toBeNull();
  });

  it("accepts a deferred close", () => {
    /* The message that tells the host the checkout is alive and deliberately
       holding, so its force-close backstop stands down. */
    expect(parseFrameMessage(envelope(CHANNEL, { type: "closeDeferred" }), CHANNEL)).toEqual({
      type: "closeDeferred",
    });
  });

  it("refuses a close reason that is not one of ours", () => {
    const forged = envelope(CHANNEL, { type: "closed", reason: "whatever" });
    expect(parseFrameMessage(forged, CHANNEL)).toBeNull();
  });
});

describe("host to frame messages", () => {
  it("accepts init with a well-formed product id", () => {
    const message = envelope(CHANNEL, { type: "init", productId: "prod_abc", theme: null });
    expect(parseHostMessage(message, CHANNEL)).toEqual({
      type: "init",
      productId: "prod_abc",
      theme: null,
    });
  });

  it.each(["", "abc", "prod_", "prod_" + "x".repeat(65), "prod_a b", 42, null])(
    "refuses a malformed product id: %p",
    (productId) => {
      const message = envelope(CHANNEL, { type: "init", productId, theme: null });
      expect(parseHostMessage(message, CHANNEL)).toBeNull();
    },
  );

  it("re-sanitises the theme rather than trusting what the SDK sent", () => {
    /* The SDK runs on the merchant's page and is therefore under the merchant's
       control. What it sends is an assertion, not a fact. */
    const message = envelope(CHANNEL, {
      type: "init",
      productId: "prod_abc",
      theme: { accent: "red; position:fixed", radius: "soft" },
    });
    expect(parseHostMessage(message, CHANNEL)).toEqual({
      type: "init",
      productId: "prod_abc",
      theme: { radius: "soft" },
    });
  });

  it("accepts a focus edge and refuses anything else", () => {
    expect(parseHostMessage(envelope(CHANNEL, { type: "focus", edge: "first" }), CHANNEL)).toEqual({
      type: "focus",
      edge: "first",
    });
    expect(
      parseHostMessage(envelope(CHANNEL, { type: "focus", edge: "sideways" }), CHANNEL),
    ).toBeNull();
  });
});

describe("theme allowlist", () => {
  it("accepts six-digit hex and normalises the case", () => {
    expect(sanitiseTheme({ accent: "#0E5B62" })).toEqual({
      theme: { accent: "#0e5b62" },
      dropped: [],
    });
  });

  it.each([
    "red",
    "rgb(1,2,3)",
    "#fff",
    "#0e5b6",
    "#0e5b62;",
    "url(javascript:alert(1))",
    "#0e5b62 !important",
    "var(--x)",
  ])("refuses anything that is not plain hex: %p", (accent) => {
    /* Not squeamishness. An accent colour is interpolated into a stylesheet,
       and CSS is a language: an unvalidated value can close one declaration and
       open another. Allowing three syntaxes means writing three parsers, and
       the third is where the bug lives. */
    const { theme, dropped } = sanitiseTheme({ accent });
    expect(theme).toBeNull();
    expect(dropped).toContain("accent");
  });

  it("drops unknown keys and names them", () => {
    const { theme, dropped } = sanitiseTheme({
      accent: "#0e5b62",
      backgroundImage: "url(x)",
      fontFamily: "Comic Sans",
    });
    expect(theme).toEqual({ accent: "#0e5b62" });
    expect(dropped.sort()).toEqual(["backgroundImage", "fontFamily"]);
  });

  it("refuses a radius outside the fixed set", () => {
    const { theme } = sanitiseTheme({ radius: "9999px" });
    expect(theme).toBeNull();
  });

  it("treats a non-object as no theme at all", () => {
    expect(sanitiseTheme("accent:#fff")).toEqual({ theme: null, dropped: [] });
  });
});

describe("product ids", () => {
  it("accepts the documented shape", () => {
    expect(isProductId("prod_notebook")).toBe(true);
    expect(isProductId("prod_A-1_b")).toBe(true);
  });

  it("refuses everything else", () => {
    expect(isProductId("notebook")).toBe(false);
    expect(isProductId(undefined)).toBe(false);
  });
});

describe("channel ids", () => {
  it("is 32 hex characters and does not repeat", () => {
    const a = createChannelId();
    const b = createChannelId();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toEqual(b);
  });
});
