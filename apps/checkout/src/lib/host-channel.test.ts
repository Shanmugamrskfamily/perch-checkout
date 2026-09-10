/**
 * Who is allowed to embed the checkout.
 *
 * This is the security boundary, which is exactly why `assessEmbedding` is a
 * pure function sitting outside the component. A boundary that can only be
 * exercised by mounting React and faking a browser is a boundary nobody tests.
 */

import { assessEmbedding } from "./host-channel";
import { isAllowedHostOrigin } from "./config";

const ALLOWED = "http://localhost:3000";

const framed = {
  isFramed: true,
  channel: "0123456789abcdef0123456789abcdef",
  claimedOrigin: ALLOWED,
  referrer: `${ALLOWED}/`,
};

describe("origin allowlist", () => {
  it("accepts an exact origin however it is written", () => {
    expect(isAllowedHostOrigin("http://localhost:3000", [ALLOWED])).toBe(true);
    expect(isAllowedHostOrigin("http://localhost:3000/", [ALLOWED])).toBe(true);
    expect(isAllowedHostOrigin("http://localhost:3000/checkout?x=1", [ALLOWED])).toBe(true);
  });

  it("refuses a lookalike that a startsWith check would let through", () => {
    /* The reason origins are compared as parsed origins rather than strings.
       Every one of these begins with the allowed value. */
    expect(isAllowedHostOrigin("http://localhost:3000.evil.com", [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("http://localhost:30000", [ALLOWED])).toBe(false);
    expect(isAllowedHostOrigin("https://localhost:3000", [ALLOWED])).toBe(false);
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
