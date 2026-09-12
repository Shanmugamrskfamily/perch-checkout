/**
 * Who is allowed to embed the checkout.
 *
 * This is the security boundary, which is exactly why `assessEmbedding` is a
 * pure function sitting outside the component. A boundary that can only be
 * exercised by mounting React and faking a browser is a boundary nobody tests.
 */

import { assessEmbedding } from "./host-channel";
import { ALLOWED_HOST_ORIGINS, isAllowedHostOrigin } from "./config";

/**
 * A real entry from the shipped allowlist.
 *
 * Deliberately not localhost. Jest runs with `NODE_ENV=test`, so the defaults
 * in play are the production ones, and a fixture that assumed localhost was
 * trusted would quietly stop testing the thing it claims to test the moment
 * that assumption changed. It already did once.
 */
const ALLOWED = "https://perch-demo-store.vercel.app";

const framed = {
  isFramed: true,
  channel: "0123456789abcdef0123456789abcdef",
  claimedOrigin: ALLOWED,
  referrer: `${ALLOWED}/`,
};

describe("origin allowlist", () => {
  it("accepts an exact origin however it is written", () => {
    expect(isAllowedHostOrigin(ALLOWED, [ALLOWED])).toBe(true);
    expect(isAllowedHostOrigin(`${ALLOWED}/`, [ALLOWED])).toBe(true);
    expect(isAllowedHostOrigin(`${ALLOWED}/checkout?x=1`, [ALLOWED])).toBe(true);
  });

  it("refuses a lookalike that a startsWith check would let through", () => {
    /* The reason origins are compared as parsed origins rather than strings.
       The first of these begins with the allowed value; the rest differ only in
       a part a careless comparison would skip over. */
    expect(isAllowedHostOrigin(`${ALLOWED}.evil.com`, [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("https://evil-perch-demo-store.vercel.app", [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("http://perch-demo-store.vercel.app", [ALLOWED])).toBe(false);
  });

  it("treats a different port as a different origin", () => {
    /* It is, and forgetting that is how a checkout ends up trusting whatever
       else the visitor happens to be running. */
    expect(isAllowedHostOrigin("http://localhost:3000", ["http://localhost:3000"])).toBe(true);
    expect(isAllowedHostOrigin("http://localhost:30000", ["http://localhost:3000"])).toBe(false);
    expect(isAllowedHostOrigin("http://localhost:4000", ["http://localhost:3000"])).toBe(false);
  });

  it("refuses schemes that are not http or https", () => {
    expect(isAllowedHostOrigin("javascript:alert(1)", [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("file:///etc/passwd", [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("data:text/html,<h1>hi", [ALLOWED])).toBe(false);
  });

  it("refuses nonsense", () => {
    expect(isAllowedHostOrigin(undefined, [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("", [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("not a url", [ALLOWED])).toBe(false);
  });
});

describe("the shipped allowlist", () => {
  it("does not trust localhost outside development", () => {
    /* Jest runs with NODE_ENV=test, which is not development, so this is the
       list a deployed build would use. A production checkout that keeps
       localhost on its allowlist can be framed by anything a visitor happens to
       be running on that port on their own machine. */
    const isDevelopment = process.env.NODE_ENV === "development";
    expect(isDevelopment).toBe(false);

    for (const origin of ALLOWED_HOST_ORIGINS) {
      expect(origin).not.toMatch(/localhost|127\.0\.0\.1|^http:\/\//);
    }
  });

  it("carries every hostname the deployed store answers on", () => {
    /* One deployment answers on several names. Registering one of them is how
       a checkout ends up working for whoever tested it and refusing everyone
       who arrived by a different route. */
    expect(ALLOWED_HOST_ORIGINS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("assessing the page we are embedded in", () => {
  it("accepts an allowlisted origin whose referrer agrees", () => {
    expect(assessEmbedding(framed)).toEqual({ status: "waiting" });
  });

  it("knows when it is not embedded at all", () => {
    expect(assessEmbedding({ ...framed, isFramed: false })).toEqual({ status: "unframed" });
  });

  it("refuses a session with no channel", () => {
    const gate = assessEmbedding({ ...framed, channel: undefined });
    expect(gate.status).toBe("refused");
  });

  it("refuses an origin that is not on the list", () => {
    const gate = assessEmbedding({
      ...framed,
      claimedOrigin: "http://evil.example",
      referrer: "http://evil.example/",
    });
    expect(gate.status).toBe("refused");
  });

  it("refuses a forged origin whose referrer gives it away", () => {
    /* The query parameter is convenient and anyone can type it. The referrer is
       set by the browser and a framing page cannot invent it, so requiring the
       two to agree means a forged parameter alone gets nowhere. */
    const gate = assessEmbedding({ ...framed, referrer: "http://evil.example/" });
    expect(gate.status).toBe("refused");
  });

  it("still works where the referrer is stripped entirely", () => {
    /* Some privacy settings send no referrer. Treating absence as proof of
       guilt would break the checkout for those customers, so absence means
       "no corroboration" rather than "caught you". */
    expect(assessEmbedding({ ...framed, referrer: "" })).toEqual({ status: "waiting" });
  });

  it("says the same thing however the check failed", () => {
    const notListed = assessEmbedding({
      ...framed,
      claimedOrigin: "http://evil.example",
      referrer: "http://evil.example/",
    });
    const mismatched = assessEmbedding({ ...framed, referrer: "http://evil.example/" });

    /* Telling an attacker which check they failed is free help. */
    expect(notListed).toEqual(mismatched);
  });
});
