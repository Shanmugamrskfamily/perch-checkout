/**
 * Which sites are allowed to embed this checkout.
 *
 * In a real Merchant of Record this list is per-merchant and comes from the
 * domains they registered during onboarding: a merchant's checkout may only be
 * framed by the merchant's own site. Verifying it matters because framing is
 * how a phishing page borrows a real payment form — the form is genuine, the
 * page around it is not, and the customer cannot tell the difference.
 *
 * Here it is an environment variable, because there is no database. The shape
 * of the check is the part worth showing.
 */

const DEFAULT_ORIGINS = ["http://localhost:3000"];

function parse(raw: string | undefined): string[] {
  if (!raw) return DEFAULT_ORIGINS;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export const ALLOWED_HOST_ORIGINS: readonly string[] = parse(
  process.env.NEXT_PUBLIC_ALLOWED_HOST_ORIGINS,
);

/**
 * True if `candidate` is a well-formed origin on the allowlist.
 *
 * Compared as parsed origins rather than as strings, so a trailing slash or a
 * default port written out in full does not create a false mismatch — and, more
 * importantly, so `https://store.example.evil.com` cannot pass a check that was
 * written with `startsWith`.
 */
export function isAllowedHostOrigin(
  candidate: string | undefined | null,
  allowed: readonly string[] = ALLOWED_HOST_ORIGINS,
): boolean {
  if (!candidate) return false;

  let normalised: string;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return false;
    normalised = url.origin;
  } catch {
    return false;
  }

  return allowed.some((entry) => {
    try {
      return new URL(entry).origin === normalised;
    } catch {
      return false;
    }
  });
}
