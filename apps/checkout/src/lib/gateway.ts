/**
 * A pretend payment gateway.
 *
 * There is no server in this assignment, so this stands in for one. What it
 * models is not the cryptography or the card networks — it is the *shape* of
 * the problem a checkout has to survive:
 *
 *   - a charge can succeed, be declined, or never get an answer at all, and
 *     those three are genuinely different for the customer;
 *   - the same charge submitted twice must not take the money twice;
 *   - a retry after a lost connection is the *same* charge, not a new one.
 *
 * Nothing here logs, and no card number is kept beyond the last four digits.
 */

import type { Money } from "./money";

/** The card numbers the brief specifies, plus what each one does. */
export const TEST_CARDS = [
  {
    number: "4242 4242 4242 4242",
    title: "Succeeds",
    detail: "Approved on the first attempt.",
  },
  {
    number: "4000 0000 0000 0002",
    title: "Declined",
    detail: "The issuer refuses it. Retrying the same card will not help.",
  },
  {
    number: "4000 0000 0000 0341",
    title: "Fails, then works",
    detail: "The first attempt loses the connection. Retry and it goes through.",
  },
] as const;

const SUCCESS_CARD = "4242424242424242";
const DECLINE_CARD = "4000000000000002";
const FLAKY_CARD = "4000000000000341";

export type DeclineReason = "issuer_declined" | "insufficient_funds";

export interface ChargeSucceeded {
  readonly outcome: "succeeded";
  readonly sessionId: string;
  readonly last4: string;
}

export interface ChargeDeclined {
  readonly outcome: "declined";
  readonly reason: DeclineReason;
  /**
   * Customer-facing wording.
   *
   * Two things every decline message must do, and most do neither: say who
   * refused, and say whether money moved. "Something went wrong" leaves a
   * person wondering whether they have just been charged.
   */
  readonly message: string;
}

export type ChargeResult = ChargeSucceeded | ChargeDeclined;

/**
 * Thrown when the charge gets no answer.
 *
 * Deliberately distinct from a decline. A decline is a decision — the issuer
 * said no, and trying the same card again is pointless. A lost connection is an
 * *unknown*: the charge may have gone through, may not have, and the only safe
 * response is to retry under the same idempotency key and let the gateway tell
 * us which it was.
 */
export class ConnectionLost extends Error {
  constructor() {
    super("The connection dropped before the payment was confirmed.");
    this.name = "ConnectionLost";
  }
}

export interface ChargeRequest {
  /**
   * Identifies this charge, not this request.
   *
   * Held steady across retries of the same payment so a retry can never become
   * a second charge, and regenerated when the customer changes the card,
   * because that is a different payment.
   */
  readonly idempotencyKey: string;
  readonly cardNumber: string;
  readonly email: string;
  readonly amount: Money;
}

/** Completed charges, by key. A repeat of a settled key replays its result. */
const settled = new Map<string, ChargeResult>();
/** Charges currently in the air, by key. A duplicate joins the same promise. */
const inFlight = new Map<string, Promise<ChargeResult>>();
/** How many times each card has been tried, to drive the flaky card. */
const attempts = new Map<string, number>();

/** Wipes gateway memory. Tests, and starting a fresh session. */
export function resetGateway(): void {
  settled.clear();
  inFlight.clear();
  attempts.clear();
}

const LATENCY_MS = 1400;

export async function charge(request: ChargeRequest): Promise<ChargeResult> {
  /* Already finished under this key: hand back exactly what happened the first
     time. This is what stops a customer being charged twice for one purchase. */
  const previous = settled.get(request.idempotencyKey);
  if (previous) return previous;

  /* Already in the air under this key: join it. Two fast clicks on Pay produce
     one charge and one answer, rather than a race. */
  const running = inFlight.get(request.idempotencyKey);
  if (running) return running;

  const pending = execute(request);
  inFlight.set(request.idempotencyKey, pending);

  try {
    const result = await pending;
    settled.set(request.idempotencyKey, result);
    return result;
  } finally {
    /* Cleared either way. On success the answer now lives in `settled`; on a
       lost connection nothing is recorded, so a retry genuinely re-runs and can
       reach the issuer this time. */
    inFlight.delete(request.idempotencyKey);
  }
}

async function execute(request: ChargeRequest): Promise<ChargeResult> {
  const digits = request.cardNumber.replace(/\D/g, "");
  const tail = digits.slice(-4);

  const attempt = (attempts.get(digits) ?? 0) + 1;
  attempts.set(digits, attempt);

  await sleep(LATENCY_MS);

  if (digits === FLAKY_CARD && attempt === 1) {
    throw new ConnectionLost();
  }

  if (digits === DECLINE_CARD) {
    return {
      outcome: "declined",
      reason: "issuer_declined",
      message: "Your bank turned this payment down. Nothing has been charged.",
    };
  }

  if (digits === SUCCESS_CARD || digits === FLAKY_CARD) {
    return { outcome: "succeeded", sessionId: newSessionId(), last4: tail };
  }

  /* Anything else is a card the test gateway has never heard of. Declining it
     is more honest than approving it and pretending. */
  return {
    outcome: "declined",
    reason: "insufficient_funds",
    message: "Your bank turned this payment down. Nothing has been charged.",
  };
}

/** `cs_` for checkout session, matching the shape merchants see elsewhere. */
function newSessionId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return `cs_${out}`;
}

/** A fresh idempotency key. One per payment, not one per button press. */
export function newIdempotencyKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return `idem_${out}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
