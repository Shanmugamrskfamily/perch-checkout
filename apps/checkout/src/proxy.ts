import { NextResponse, type NextRequest } from "next/server";
import { ALLOWED_HOST_ORIGINS } from "@/lib/config";

/**
 * Security headers for the checkout document.
 *
 * The important line is `frame-ancestors`. Everything else here is good
 * hygiene; that one is the actual product requirement.
 *
 * The checkout already refuses to talk to a page it does not recognise — see
 * `assessEmbedding` — but that is a polite refusal *after* the document has
 * loaded inside the attacker's page. `frame-ancestors` makes the browser refuse
 * to render it there in the first place. A phishing site that frames a real
 * payment form to borrow its credibility should meet the second one, and never
 * get far enough to meet the first.
 *
 * Both exist on purpose. The header is enforcement; the in-page check is what
 * produces an explanation a human can read, and covers the case where a
 * merchant's own domain list and their deployment have drifted apart.
 *
 * Named `proxy` because Next 16 renamed the `middleware` convention. The
 * exported function name and the filename both changed; the older name is
 * deprecated rather than aliased.
 */
export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === "development";

  /* A fresh nonce per request. Next reads it back out of this header during
     rendering and stamps it onto its own script and style tags, so no inline
     script we did not put there can run — which is the difference between a
     policy and a formality. It requires dynamic rendering, which a checkout
     needs anyway: a cached payment page would be a bug of its own. */
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const frameAncestors =
    ALLOWED_HOST_ORIGINS.length > 0 ? ALLOWED_HOST_ORIGINS.join(" ") : "'none'";

  const policy = [
    "default-src 'self'",
    /* 'strict-dynamic' lets Next's own bundle load its chunks without every
       chunk URL being listed. In development React uses eval to rebuild server
       stack traces, which production does not. */
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${isDev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "img-src 'self' data:",
    "font-src 'self' data:",
    /* No plugins, no base tag hijacking, and forms cannot post anywhere else.
       A payment form that can be made to submit to another origin is the whole
       attack, so this line is not boilerplate. */
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    /* Who is allowed to embed the checkout. In production this list is
       per-merchant, from the domains they registered during onboarding. */
    `frame-ancestors ${frameAncestors}`,
    /* Nothing here is allowed to frame anything else. A checkout that can host
       a nested frame is a checkout that can be made to host a fake one. */
    "frame-src 'none'",
    "connect-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  /**
   * Only the checkout document.
   *
   * Deliberately not the whole app. A nonce-based policy forces dynamic
   * rendering, and applying it to a statically generated page would strip the
   * nonce from scripts that were rendered at build time and break them. The
   * checkout is dynamic regardless, so it is the one route where this is free.
   *
   * `perch.js` is excluded along with the rest of the static assets. A content
   * policy governs what a *document* may load, not who may load a script file,
   * so putting one on the embed script would restrict nothing and cost a
   * function invocation on every merchant page view.
   */
  matcher: ["/checkout"],
};
