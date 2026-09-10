/**
 * The rules the checkout actually promises.
 *
 * These are written against the reducer rather than the rendered form on
 * purpose. A guarantee that only holds because a button happened to be
 * disabled is not a guarantee; it is a coincidence that survives until someone
 * restyles the button.
 */

import { EMPTY_FORM } from "./card";
import { reduceAt, initialState, visibleProblems, SESSION_WINDOW_MS, type State } from "./payment-machine";
import type { Product } from "./catalog";

const NOW = new Date("2026-06-01T12:00:00Z");

const PRODUCT: Product = {
  id: "prod_notebook",
  name: "Field Notebook",
  summary: "Ninety-six pages",
  price: { amount: 145000, currency: "INR" },
  merchant: "Kestrel Supply Co.",
};

const GOOD_CARD = {
  email: "buyer@example.com",
  country: "IN",
  number: "4242 4242 4242 4242",
  expiry: "12 / 30",
  cvc: "123",
};

/** A checkout with the product loaded and a valid form, ready to pay. */
function ready(overrides: Partial<State> = {}): State {
  const loaded = reduceAt(initialState(), { type: "productLoaded", product: PRODUCT }, NOW);
  return { ...loaded, form: { ...EMPTY_FORM, ...GOOD_CARD }, ...overrides };
}

describe("paying twice", () => {
  it("refuses a second submit while a charge is in flight", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    expect(paying.phase.status).toBe("paying");

    /* The headline guarantee. Not "handled" — unrepresentable, because there is
       no transition out of `paying` for a submit. */
    const again = reduceAt(paying, { type: "submitted" }, NOW);
    expect(again).toBe(paying);
  });

  it("freezes the form while a charge is in flight", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    const tampered = reduceAt(
      paying,
      { type: "fieldChanged", field: "number", value: "4000 0000 0000 0002" },
      NOW,
    );
    /* Otherwise the receipt would name a card that was never charged. */
    expect(tampered).toBe(paying);
  });

  it("allows a retry once the charge has come back", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    const declined = reduceAt(paying, { type: "chargeDeclined", message: "No." }, NOW);
    const retry = reduceAt(declined, { type: "submitted" }, NOW);
    expect(retry.phase.status).toBe("paying");
  });
});

describe("idempotency keys", () => {
  it("keeps the key across a retry of the same card", () => {
    const start = ready();
    const paying = reduceAt(start, { type: "submitted" }, NOW);
    const dropped = reduceAt(paying, { type: "chargeDisconnected" }, NOW);
    const retry = reduceAt(dropped, { type: "submitted" }, NOW);

    /* This is what stops a retry after a lost connection becoming a second
       charge: same key, so the gateway replays the first answer. */
    expect(retry.idempotencyKey).toBe(start.idempotencyKey);
  });

  it("issues a new key when the card changes", () => {
    const start = ready();
    const changed = reduceAt(
      start,
      { type: "fieldChanged", field: "number", value: "4000 0000 0000 0002" },
      NOW,
    );
    /* A different card is a different payment, and must not inherit the
       previous one's answer. */
    expect(changed.idempotencyKey).not.toBe(start.idempotencyKey);
  });

  it("keeps the key when a field other than the card changes", () => {
    const start = ready();
    const changed = reduceAt(
      start,
      { type: "fieldChanged", field: "email", value: "other@example.com" },
      NOW,
    );
    expect(changed.idempotencyKey).toBe(start.idempotencyKey);
  });
});

describe("losing progress", () => {
  it("keeps every field after a decline", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    const declined = reduceAt(paying, { type: "chargeDeclined", message: "Declined." }, NOW);

    /* The product thesis, asserted. A failed payment that empties the form is
       the single biggest drop-off point in checkout. */
    expect(declined.form).toEqual({ ...EMPTY_FORM, ...GOOD_CARD });
  });

  it("clears the decline banner as soon as the customer edits something", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    const declined = reduceAt(paying, { type: "chargeDeclined", message: "Declined." }, NOW);
    const typing = reduceAt(
      declined,
      { type: "fieldChanged", field: "number", value: "4242 4242 4242 424" },
      NOW,
    );
    /* Leaving it up while they fix the thing it complained about is nagging. */
    expect(typing.phase.status).toBe("ready");
  });
});

describe("terminal states", () => {
  it("cannot be reopened by a late message", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    const paid = reduceAt(paying, { type: "chargeSucceeded", sessionId: "cs_1", last4: "4242" }, NOW);

    /* A charge that resolves after the session ended must not resurrect it. */
    expect(reduceAt(paid, { type: "submitted" }, NOW)).toBe(paid);
    expect(reduceAt(paid, { type: "chargeDeclined", message: "late" }, NOW)).toBe(paid);
    expect(reduceAt(paid, { type: "sessionExpired" }, NOW)).toBe(paid);
  });

  it("refuses an outcome that did not follow a charge", () => {
    const state = ready();
    expect(reduceAt(state, { type: "chargeSucceeded", sessionId: "cs_x", last4: "1" }, NOW)).toBe(
      state,
    );
  });
});

describe("session expiry", () => {
  it("starts the clock when the order loads, not when the frame mounts", () => {
    const loaded = reduceAt(initialState(), { type: "productLoaded", product: PRODUCT }, NOW);
    expect(loaded.expiresAt).toBe(NOW.getTime() + SESSION_WINDOW_MS);
  });

  it("expires an idle checkout", () => {
    const expired = reduceAt(ready(), { type: "sessionExpired" }, NOW);
    expect(expired.phase.status).toBe("expired");
  });

  it("never expires a charge that is already in flight", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    /* Expiring out from under a payment that may already have taken the money
       is the worst possible moment to lose track of it. */
    expect(reduceAt(paying, { type: "sessionExpired" }, NOW)).toBe(paying);
  });
});

describe("leaving mid-payment", () => {
  it("asks first while a charge is in flight", () => {
    const paying = reduceAt(ready(), { type: "submitted" }, NOW);
    expect(reduceAt(paying, { type: "exitRequested" }, NOW).confirmingExit).toBe(true);
  });

  it("does not ask when nothing is happening", () => {
    const state = ready();
    /* Confirmation prompts where there is nothing to lose are friction. */
    expect(reduceAt(state, { type: "exitRequested" }, NOW)).toBe(state);
  });
});

describe("showing problems", () => {
  it("says nothing about fields the customer has not finished with", () => {
    const state = reduceAt(
      { ...ready(), form: EMPTY_FORM },
      { type: "fieldChanged", field: "email", value: "not-an-email" },
      NOW,
    );
    expect(visibleProblems(state)).toEqual({});
  });

  it("reveals the problem once they leave the field", () => {
    let state = reduceAt(
      { ...ready(), form: EMPTY_FORM },
      { type: "fieldChanged", field: "email", value: "not-an-email" },
      NOW,
    );
    state = reduceAt(state, { type: "fieldBlurred", field: "email" }, NOW);
    expect(visibleProblems(state).email).toMatch(/email address/i);
  });

  it("reveals every remaining problem at once when Pay is pressed", () => {
    const state = reduceAt({ ...ready(), form: EMPTY_FORM }, { type: "submitted" }, NOW);

    /* Dripping them out one field at a time as the customer tabs through is how
       a form becomes exhausting. */
    expect(Object.keys(visibleProblems(state)).sort()).toEqual([
      "country",
      "cvc",
      "email",
      "expiry",
      "number",
    ]);
    expect(state.phase.status).toBe("ready");
  });

  it("does not start a charge while anything is invalid", () => {
    const state = reduceAt({ ...ready(), form: EMPTY_FORM }, { type: "submitted" }, NOW);
    expect(state.phase.status).not.toBe("paying");
  });
});
