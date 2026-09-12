/**
 * The gateway's promises about not taking the money twice.
 *
 * Fake timers, because the pretend gateway has a pretend latency and a test
 * suite that waits it out honestly is a test suite nobody runs.
 */

import {
  ConnectionLost,
  charge,
  newIdempotencyKey,
  resetGateway,
  type ChargeRequest,
} from "./gateway";

const AMOUNT = { amount: 145000, currency: "INR" };

function request(overrides: Partial<ChargeRequest> = {}): ChargeRequest {
  return {
    idempotencyKey: newIdempotencyKey(),
    cardNumber: "4242 4242 4242 4242",
    email: "buyer@example.com",
    amount: AMOUNT,
    ...overrides,
  };
}

type Settled =
  | { readonly ok: true; readonly value: Awaited<ReturnType<typeof charge>> }
  | { readonly ok: false; readonly error: unknown };

/**
 * Starts a charge and runs the pretend network out to its answer.
 *
 * The handlers are attached before the clock is advanced, deliberately. A
 * charge that rejects while nothing is listening is an unhandled rejection, and
 * this gateway rejects on purpose for one of the test cards.
 */
async function run(request: ChargeRequest): Promise<Settled> {
  const settled: Promise<Settled> = charge(request).then(
    (value) => ({ ok: true, value }) as const,
    (error: unknown) => ({ ok: false, error }) as const,
  );
  await jest.advanceTimersByTimeAsync(2000);
  return settled;
}

/** Asserts the charge answered, and hands back the answer. */
async function succeed(request: ChargeRequest) {
  const result = await run(request);
  if (!result.ok) throw result.error;
  return result.value;
}

beforeEach(() => {
  jest.useFakeTimers();
  resetGateway();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("the test cards from the brief", () => {
  it("approves 4242 4242 4242 4242", async () => {
    const result = await succeed(request());
    expect(result.outcome).toBe("succeeded");
    if (result.outcome === "succeeded") {
      expect(result.last4).toBe("4242");
      expect(result.sessionId).toMatch(/^cs_[0-9a-f]{24}$/);
    }
  });

  it("declines 4000 0000 0000 0002", async () => {
    const result = await succeed(request({ cardNumber: "4000 0000 0000 0002" }));
    expect(result.outcome).toBe("declined");
    if (result.outcome === "declined") {
      /* Two things every decline message must do and most do neither: say who
         refused, and say whether money moved. */
      expect(result.message).toMatch(/bank/i);
      expect(result.message).toMatch(/nothing has been charged/i);
    }
  });

  it("drops the connection on 4000 0000 0000 0341, then succeeds on retry", async () => {
    const key = newIdempotencyKey();
    const card = "4000 0000 0000 0341";

    const first = await run(request({ idempotencyKey: key, cardNumber: card }));
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.error).toBeInstanceOf(ConnectionLost);

    /* Same key, because it is the same payment. A lost connection is an
       unknown, not a decision, so the retry has to be able to find out what
       actually happened rather than start something new. */
    const retry = await succeed(request({ idempotencyKey: key, cardNumber: card }));
    expect(retry.outcome).toBe("succeeded");
  });
});

describe("not charging twice", () => {
  it("replays the first answer when the same key comes back", async () => {
    const key = newIdempotencyKey();

    const first = await succeed(request({ idempotencyKey: key }));
    const second = await succeed(request({ idempotencyKey: key }));

    /* Identical, not merely equal: the second request never reached the
       issuer. This is the property that survives a customer refreshing the
       page or a network retrying underneath us. */
    expect(second).toBe(first);
  });

  it("coalesces two clicks on Pay into one charge", async () => {
    const key = newIdempotencyKey();

    const a = charge(request({ idempotencyKey: key }));
    const b = charge(request({ idempotencyKey: key }));
    await jest.advanceTimersByTimeAsync(2000);

    expect(await a).toBe(await b);
  });

  it("treats a different key as a different payment", async () => {
    const first = await succeed(request());
    const second = await succeed(request());

    expect(second).not.toBe(first);
    if (first.outcome === "succeeded" && second.outcome === "succeeded") {
      expect(second.sessionId).not.toBe(first.sessionId);
    }
  });

  it("does not record an answer for a charge that never got one", async () => {
    const key = newIdempotencyKey();
    const card = "4000 0000 0000 0341";

    const first = await run(request({ idempotencyKey: key, cardNumber: card }));
    expect(first.ok).toBe(false);

    /* Nothing cached, so the retry genuinely re-runs. Caching a failure that
       might have succeeded would be worse than not caching at all. */
    const retry = await succeed(request({ idempotencyKey: key, cardNumber: card }));
    expect(retry.outcome).toBe("succeeded");
  });
});

describe("every other well-formed card", () => {
  /* Anything reaching the gateway has already passed validation: right length
     for its network, passes Luhn, in date, security code the right size. An
     earlier version declined these on the grounds that approving a card it had
     never heard of was a kind of pretending. That was the wrong call — it
     taught whoever was trying the form that the form was broken. */
  it.each([
    ["5555 5555 5555 4444", "Mastercard"],
    ["3782 822463 10005", "Amex"],
    ["6521 0000 0000 0000", "RuPay"],
    ["3056 930902 5904", "Diners Club"],
    ["6011 1111 1111 1117", "Discover"],
  ])("approves %s (%s)", async (cardNumber) => {
    const result = await succeed(request({ cardNumber }));
    expect(result.outcome).toBe("succeeded");
  });

  it("still declines the one card the brief says declines", async () => {
    const result = await succeed(request({ cardNumber: "4000 0000 0000 0002" }));
    expect(result.outcome).toBe("declined");
  });
});
