"use client";

/**
 * The checkout: product, email, card, pay.
 *
 * This component owns effects and rendering. Every decision about what is
 * allowed to happen next lives in `payment-machine.ts`, so the rules survive
 * changes to the markup and can be tested without a browser.
 */

import {
  useCallback,
  useEffect,
  useReducer,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { useHostChannel } from "@/lib/host-channel";
import { fetchProduct, UnknownProductError } from "@/lib/catalog";
import { formatMoney } from "@/lib/money";
import {
  ConnectionLost,
  charge,
  resetGateway,
} from "@/lib/gateway";
import {
  cvcLength,
  detectBrand,
  digitsOnly,
  formatCardNumber,
  formatExpiry,
} from "@/lib/card";
import { REGIONS, findRegion, priceWithTax } from "@/lib/regions";
import {
  COUNTDOWN_VISIBLE_MS,
  initialState,
  isTerminal,
  reduce,
  visibleProblems,
} from "@/lib/payment-machine";
import { Field, SelectField } from "./components/field";
import { AcceptedCards } from "./components/card-brand";
import { OrderSummary } from "./components/order-summary";
import { PayButton } from "./components/pay-button";
import { StatusNote } from "./components/status-note";
import { Receipt } from "./components/receipt";

export function CheckoutScreen() {
  const { link, reportSuccess, reportFailure, reportClosed, setCloseRequestHandler } =
    useHostChannel();
  const [state, dispatch] = useReducer(reduce, undefined, initialState);

  const linked = link.status === "linked";
  const productId = linked ? link.productId : null;
  const theme = linked ? link.theme : null;
  const { product, form, idempotencyKey, phase, confirmingExit } = state;

  // -- load the product ------------------------------------------------------

  useEffect(() => {
    if (!productId) return;

    /* A fresh session starts with a gateway that remembers nothing, so the
       flaky test card fails on its first attempt every time the checkout is
       reopened rather than only the very first time in a browser session. */
    resetGateway();

    const controller = new AbortController();
    fetchProduct(productId, controller.signal)
      .then((loaded) => dispatch({ type: "productLoaded", product: loaded }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        dispatch({
          type: "productFailed",
          message:
            error instanceof UnknownProductError
              ? "This product is not available."
              : "We could not load this order. Close the checkout and try again.",
        });
      });

    return () => controller.abort();
  }, [productId]);

  // -- run the charge --------------------------------------------------------

  const paying = phase.status === "paying";

  /**
   * What the customer actually owes.
   *
   * Null until they have chosen a country, because until then we genuinely do
   * not know: as a Merchant of Record the tax is decided by where they are, not
   * where the shop is. Showing a total before that would mean showing one we
   * might have to change.
   */
  const region = findRegion(form.country);
  const taxed = product && region ? priceWithTax(product.price, region) : null;
  const amountDue = taxed?.total ?? product?.price ?? null;

  useEffect(() => {
    if (!paying || !product) return;
    let live = true;

    /* Note what is *not* here: a guard against this effect running twice.
       React's strict mode double-invokes effects in development, and a second
       call with the same idempotency key joins the first charge rather than
       starting another. The gateway's own contract makes the duplicate
       harmless, which is the same property that protects a customer who
       double-clicks Pay. */
    charge({
      idempotencyKey,
      cardNumber: form.number,
      email: form.email,
      /* The amount that goes to the gateway is the one with tax on it, which is
         also the one printed on the button the customer pressed. Those two
         must never be computed in different places. */
      amount: amountDue ?? product.price,
    })
      .then((result) => {
        if (!live) return;
        if (result.outcome === "succeeded") {
          dispatch({
            type: "chargeSucceeded",
            sessionId: result.sessionId,
            last4: result.last4,
          });
        } else {
          dispatch({ type: "chargeDeclined", message: result.message });
        }
      })
      .catch((error: unknown) => {
        if (!live) return;
        if (error instanceof ConnectionLost) {
          dispatch({ type: "chargeDisconnected" });
          return;
        }
        dispatch({
          type: "chargeDeclined",
          message: "We could not reach the payment network. Nothing has been charged.",
        });
      });

    return () => {
      live = false;
    };
  }, [paying, product, idempotencyKey, form.number, form.email, amountDue]);

  // -- the session clock -----------------------------------------------------

  const [now, setNow] = useState(() => Date.now());
  const { expiresAt } = state;

  useEffect(() => {
    if (expiresAt === null || isTerminal(phase)) return;

    /* The dispatch happens in the timer callback rather than in the effect
       body. The effect subscribes to a clock; it does not itself decide that
       time has passed. */
    const id = window.setInterval(() => {
      if (Date.now() >= expiresAt) dispatch({ type: "sessionExpired" });
      else setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(id);
  }, [expiresAt, phase]);

  const remaining = expiresAt === null ? null : Math.max(0, expiresAt - now);

  /* Silent until the end is close. A timer counting down from three minutes
     while somebody types their card number is pressure, not information. It
     also stays hidden mid-charge, where there is nothing they could do about
     it anyway. */
  const countdown =
    remaining !== null && remaining <= COUNTDOWN_VISIBLE_MS && !isTerminal(phase) && !paying
      ? remaining
      : null;

  // -- tell the host about outcomes -----------------------------------------

  useEffect(() => {
    if (phase.status === "paid") reportSuccess(phase.sessionId);
  }, [phase, reportSuccess]);

  useEffect(() => {
    if (phase.status === "unavailable") reportFailure("unknown_product", phase.message);
  }, [phase, reportFailure]);

  useEffect(() => {
    if (phase.status === "expired") {
      reportFailure("session_expired", "The checkout timed out before the payment was made.");
    }
  }, [phase, reportFailure]);

  // -- closing ---------------------------------------------------------------

  const close = useCallback(() => {
    if (phase.status === "paid") reportClosed("completed");
    else if (phase.status === "expired") reportClosed("expired");
    else if (phase.status === "unavailable") reportClosed("error");
    else reportClosed("dismissed");
  }, [phase, reportClosed]);

  useEffect(() => {
    /* The host asks; this decides. Mid-charge the answer is "ask the customer
       first", because vanishing while money may be moving is the one thing a
       checkout must never do. */
    setCloseRequestHandler(() => {
      if (phase.status === "paying") {
        dispatch({ type: "exitRequested" });
        return;
      }
      close();
    });
    return () => setCloseRequestHandler(null);
  }, [phase.status, close, setCloseRequestHandler]);

  // -- rendering -------------------------------------------------------------

  const themeStyle: CSSProperties | undefined = theme?.accent
    ? ({
        "--perch-accent": theme.accent,
        "--perch-accent-strong": `color-mix(in oklab, ${theme.accent} 84%, black)`,
      } as CSSProperties)
    : undefined;

  if (link.status === "unframed") {
    return (
      <Message
        title="Nothing to pay for here"
        body="Perch checkouts open inside the shop you were buying from. Head back there and try again."
      />
    );
  }

  if (link.status === "refused") {
    return <Message title="Checkout blocked" body={link.detail} />;
  }

  const brand = detectBrand(form.number);
  const problems = visibleProblems(state);
  const busy = phase.status === "paying";

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    dispatch({ type: "submitted" });
  };

  return (
    <div data-perch-theme style={themeStyle} className="relative flex flex-col bg-surface">
      {phase.status === "loading" || link.status === "waiting" ? (
        <Skeleton />
      ) : phase.status === "unavailable" ? (
        <Message title="This order is not available" body={phase.message} onDismiss={close} />
      ) : phase.status === "expired" ? (
        <Message
          title="This checkout timed out"
          body="Nothing was charged. Head back to the shop and start again when you are ready."
          onDismiss={close}
        />
      ) : phase.status === "paid" && product ? (
        <Receipt
          amount={amountDue ?? product.price}
          last4={phase.last4}
          email={form.email}
          sessionId={phase.sessionId}
          onDone={close}
        />
      ) : product ? (
        <>
          <OrderSummary product={product} charge={taxed} />

          <form
            onSubmit={onSubmit}
            noValidate
            /* Tighter on a phone. Every pixel saved here is a pixel of form the
               customer does not have to scroll past to reach the Pay button. */
            className="flex flex-col gap-3.5 px-5 py-4 sm:gap-4 sm:px-6 sm:py-5"
          >
            {phase.status === "declined" ? (
              <StatusNote tone="critical" title="That card was declined">
                {phase.message} Your details are still here, so you can try another card.
              </StatusNote>
            ) : null}

            {phase.status === "disconnected" ? (
              <StatusNote tone="caution" title="We lost the connection">
                We could not confirm whether that payment went through, so we have not charged you
                again. Press Pay to check and finish safely.
              </StatusNote>
            ) : null}

            <Field
              label="Email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              disabled={busy}
              problem={problems.email}
              onChange={(e) => dispatch({ type: "fieldChanged", field: "email", value: e.target.value })}
              onBlur={() => dispatch({ type: "fieldBlurred", field: "email" })}
            />

            {/* Above the card fields on purpose: choosing it changes the total,
                and nobody should type a card number against a figure that is
                about to move. */}
            <SelectField
              label="Where are you?"
              autoComplete="country"
              value={form.country}
              disabled={busy}
              problem={problems.country}
              onChange={(e) =>
                dispatch({ type: "fieldChanged", field: "country", value: e.target.value })
              }
              onBlur={() => dispatch({ type: "fieldBlurred", field: "country" })}
            >
              <option value="">Choose a country</option>
              {REGIONS.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.name}
                </option>
              ))}
            </SelectField>

            <Field
              label="Card number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 1234 1234 1234"
              value={form.number}
              disabled={busy}
              problem={problems.number}
              /* The row reacts as the first digits land, which is the moment a
                 customer is deciding whether this form knows what it is doing. */
              aside={<AcceptedCards detected={brand} />}
              onChange={(e) =>
                dispatch({
                  type: "fieldChanged",
                  field: "number",
                  value: formatCardNumber(e.target.value),
                })
              }
              onBlur={() => dispatch({ type: "fieldBlurred", field: "number" })}
            />

            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Expires"
                inputMode="numeric"
                autoComplete="cc-exp"
                placeholder="MM / YY"
                value={form.expiry}
                disabled={busy}
                problem={problems.expiry}
                onChange={(e) =>
                  dispatch({
                    type: "fieldChanged",
                    field: "expiry",
                    value: formatExpiry(e.target.value),
                  })
                }
                onBlur={() => dispatch({ type: "fieldBlurred", field: "expiry" })}
              />

              <Field
                label="Security code"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder={brand === "amex" ? "1234" : "123"}
                value={form.cvc}
                disabled={busy}
                problem={problems.cvc}
                /* Where to look, not how many digits. People hunting for the
                   number on the wrong side of the card is the actual problem
                   this sentence solves. */
                hint={brand === "amex" ? "Four digits, front" : "Three digits, back"}
                onChange={(e) =>
                  dispatch({
                    type: "fieldChanged",
                    field: "cvc",
                    value: digitsOnly(e.target.value).slice(0, cvcLength(brand)),
                  })
                }
                onBlur={() => dispatch({ type: "fieldBlurred", field: "cvc" })}
              />
            </div>

            <PayButton
              busy={busy}
              label={
                /* Before a country is chosen there is no final amount, so the
                   button says what it can honestly say rather than quoting a
                   figure that is about to change. */
                amountDue === null || !taxed
                  ? "Continue"
                  : phase.status === "declined" || phase.status === "disconnected"
                    ? `Try again — ${formatMoney(amountDue)}`
                    : `Pay ${formatMoney(amountDue)}`
              }
            />

            {countdown !== null ? (
              <p
                /* Polite: it updates every second, and an assertive region
                   would interrupt a screen reader user once per second, which
                   is a special kind of cruelty on a payment form. */
                aria-live="polite"
                className="text-center text-[12px] text-caution"
              >
                This checkout expires in {formatCountdown(countdown)}.
              </p>
            ) : null}

            {/* Not a badge. A padlock and the word "secure" are wallpaper by now,
                and customers have learned to ignore them because anyone can draw
                one. Saying what actually protects them is both truer and more
                reassuring, and it names the shop so the claim is checkable. */}
            <div className="flex items-start gap-2.5 rounded-[10px] border border-positive/15 bg-positive/[0.045] px-3.5 py-3">
              <Padlock />
              <p className="text-[11.5px] leading-relaxed text-ink-soft">
                <span className="font-medium text-ink">
                  Encrypted, and your card stays with Perch.
                </span>{" "}
                You are typing into Perch, not into {product.merchant}, and their website cannot
                read this form.
              </p>
            </div>
          </form>
        </>
      ) : null}

      {confirmingExit ? <ExitConfirm onStay={() => dispatch({ type: "exitCancelled" })} /> : null}
    </div>
  );
}

/**
 * Shown when the customer tries to leave mid-charge.
 *
 * There is no "leave anyway" button. While a charge is in the air we do not
 * know whether the money moved, and closing the window is the one action that
 * guarantees the customer never finds out. Waiting takes a second or two.
 */
function ExitConfirm({ onStay }: { onStay: () => void }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Payment in progress"
      className="absolute inset-0 z-10 flex items-center justify-center bg-surface/85 px-8 backdrop-blur-[2px]"
    >
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-[14.5px] font-semibold text-ink">Hold on, we are taking the payment</p>
        <p className="text-[13px] leading-relaxed text-ink-soft">
          Closing now means you would not find out whether it went through. This only takes a
          moment.
        </p>
        <button
          type="button"
          onClick={onStay}
          autoFocus
          className="rounded-[10px] bg-accent px-4 py-2.5 text-[14px] font-medium text-white hover:bg-accent-strong"
        >
          Wait for it
        </button>
      </div>
    </div>
  );
}

/**
 * The padlock.
 *
 * Deep green, not signal green. Browsers retired the bright green padlock from
 * their address bars for a reason: it taught people that green means safe, and
 * phishing sites simply drew one. So the colour here is a quiet affirmation and
 * the actual claim stays in the sentence beside it, which says something a fake
 * cannot truthfully copy.
 */
function Padlock() {
  return (
    <span className="mt-px flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md bg-positive/10">
      <svg
        width="12"
        height="14"
        viewBox="0 0 13 15"
        aria-hidden="true"
        fill="none"
        stroke="var(--color-positive)"
        strokeWidth="1.6"
      >
        <rect x="1" y="6" width="11" height="8" rx="2" />
        <path d="M3.6 6V4a2.9 2.9 0 0 1 5.8 0v2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** Seconds only under a minute, minutes and seconds above it. */
function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  if (total < 60) return `${total} second${total === 1 ? "" : "s"}`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** The brief moment between the frame appearing and the order arriving. */
function Skeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5 px-6 py-6">
      <div className="flex flex-col gap-2">
        <Bar className="h-2.5 w-24" />
        <Bar className="h-4 w-40" />
        <Bar className="h-3 w-52" />
      </div>
      <div className="h-px bg-line" />
      <Bar className="h-11 w-full" />
      <Bar className="h-11 w-full" />
      <div className="grid grid-cols-2 gap-3">
        <Bar className="h-11" />
        <Bar className="h-11" />
      </div>
      <Bar className="h-12 w-full" />
    </div>
  );
}

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-sunken ${className}`} />;
}

function Message({
  title,
  body,
  onDismiss,
}: {
  title: string;
  body: string;
  onDismiss?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-12 text-center">
      <h1 className="text-[15.5px] font-semibold text-ink">{title}</h1>
      <p className="text-[13.5px] leading-relaxed text-ink-soft">{body}</p>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2 rounded-[10px] border border-line px-4 py-2 text-[13.5px] font-medium text-ink hover:bg-sunken"
        >
          Close
        </button>
      ) : null}
    </div>
  );
}
