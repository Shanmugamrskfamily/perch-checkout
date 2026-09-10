/**
 * The checkout's state machine.
 *
 * Every state the checkout can be in is named here, and every move between them
 * goes through one reducer. That is the whole point: the guarantees this
 * checkout makes are structural rather than remembered.
 *
 * The one that matters most: `submit` is only accepted from a state where no
 * charge is running. A second press of Pay while the first is in flight is not
 * "handled" — it is unrepresentable, because there is no transition for it.
 * Disabling the button is what you do so the customer can see that; the reducer
 * is what makes it true even if the button is missed, double-tapped, or
 * triggered by a keyboard repeat.
 *
 * The states are a discriminated union keyed on `status`. Each variant carries
 * exactly the data that state has and nothing else, so a declined state has a
 * message and no session id, a paid state has a session id and no message, and
 * the compiler refuses to let either be read as the other.
 */

import { EMPTY_FORM, validate, type CardForm, type FieldName } from "./card";
import { newIdempotencyKey } from "./gateway";
import type { Product } from "./catalog";

export type Phase =
  /** Fetching the product. Nothing to interact with yet. */
  | { readonly status: "loading" }
  /** The product could not be fetched. Terminal; the host is told. */
  | { readonly status: "unavailable"; readonly message: string }
  /** Form is editable and nothing is in flight. */
  | { readonly status: "ready" }
  /** A charge is in the air. The form is frozen and Pay is inert. */
  | { readonly status: "paying" }
  /** The issuer said no. Recoverable: the customer can try another card. */
  | { readonly status: "declined"; readonly message: string }
  /**
   * The charge got no answer.
   *
   * Distinct from declined on purpose. Here we genuinely do not know whether
   * the money moved, so the copy says so and the retry reuses the idempotency
   * key rather than starting a second charge.
   */
  | { readonly status: "disconnected" }
  /** Paid. */
  | { readonly status: "paid"; readonly sessionId: string; readonly last4: string }
  /** The session outlived its window before payment completed. */
  | { readonly status: "expired" };

export interface State {
  readonly phase: Phase;
  readonly product: Product | null;
  readonly form: CardForm;
  /** Fields the customer has finished with, so errors appear on leaving a field. */
  readonly touched: Readonly<Record<FieldName, boolean>>;
  /** Shown only for touched fields, or for every field once Pay is pressed. */
  readonly problems: Readonly<Partial<Record<FieldName, string>>>;
  /** True once Pay has been pressed, which reveals all remaining problems. */
  readonly submitted: boolean;
  /** Identifies this payment across retries. See gateway.ts. */
  readonly idempotencyKey: string;
  /** True while asking the customer to confirm leaving mid-payment. */
  readonly confirmingExit: boolean;
}

export type Event =
  | { readonly type: "productLoaded"; readonly product: Product }
  | { readonly type: "productFailed"; readonly message: string }
  | { readonly type: "fieldChanged"; readonly field: FieldName; readonly value: string }
  | { readonly type: "fieldBlurred"; readonly field: FieldName }
  | { readonly type: "submitted" }
  | { readonly type: "chargeSucceeded"; readonly sessionId: string; readonly last4: string }
  | { readonly type: "chargeDeclined"; readonly message: string }
  | { readonly type: "chargeDisconnected" }
  | { readonly type: "exitRequested" }
  | { readonly type: "exitCancelled" }
  | { readonly type: "sessionExpired" };

const NO_TOUCHES: Record<FieldName, boolean> = {
  email: false,
  country: false,
  number: false,
  expiry: false,
  cvc: false,
};

export function initialState(): State {
  return {
    phase: { status: "loading" },
    product: null,
    form: EMPTY_FORM,
    touched: NO_TOUCHES,
    problems: {},
    submitted: false,
    idempotencyKey: newIdempotencyKey(),
    confirmingExit: false,
  };
}

/** States from which a new charge may begin. */
function canSubmit(phase: Phase): boolean {
  return phase.status === "ready" || phase.status === "declined" || phase.status === "disconnected";
}

/** True once the checkout is finished and nothing more should change it. */
export function isTerminal(phase: Phase): boolean {
  return phase.status === "paid" || phase.status === "unavailable" || phase.status === "expired";
}

/**
 * The reducer React uses.
 *
 * `useReducer` requires exactly two parameters, so the injectable clock lives
 * on `reduceAt` below. Tests drive that one and pass a fixed date, which is the
 * only way to assert on expiry rules without waiting for a real month to pass.
 */
export function reduce(state: State, event: Event): State {
  return reduceAt(state, event, new Date());
}

export function reduceAt(state: State, event: Event, now: Date): State {
  /* Nothing reopens a finished checkout. A late message from a slow charge that
     resolves after the session expired must not resurrect the form. */
  if (isTerminal(state.phase) && event.type !== "exitRequested" && event.type !== "exitCancelled") {
    return state;
  }

  switch (event.type) {
    case "productLoaded":
      if (state.phase.status !== "loading") return state;
      return { ...state, product: event.product, phase: { status: "ready" } };

    case "productFailed":
      if (state.phase.status !== "loading") return state;
      return { ...state, phase: { status: "unavailable", message: event.message } };

    case "fieldChanged": {
      /* The form is frozen while a charge is in flight. Letting someone edit
         the card number mid-charge means the receipt would not match what was
         actually sent. */
      if (state.phase.status === "paying") return state;

      const form: CardForm = { ...state.form, [event.field]: event.value };

      /* Changing the card makes this a different payment, so it gets a
         different idempotency key. Retrying the same card after a dropped
         connection keeps the old one, which is what stops a double charge. */
      const idempotencyKey =
        event.field === "number" && event.value !== state.form.number
          ? newIdempotencyKey()
          : state.idempotencyKey;

      return {
        ...state,
        form,
        idempotencyKey,
        problems: validate(form, now),
        /* Typing clears a decline banner. Leaving it up while the customer
           corrects the thing it complained about is just nagging. */
        phase: state.phase.status === "declined" ? { status: "ready" } : state.phase,
      };
    }

    case "fieldBlurred":
      return {
        ...state,
        touched: { ...state.touched, [event.field]: true },
        problems: validate(state.form, now),
      };

    case "submitted": {
      if (!canSubmit(state.phase)) return state;

      const problems = validate(state.form, now);
      if (Object.keys(problems).length > 0) {
        /* Pressing Pay reveals every problem at once, including in fields the
           customer never visited. Revealing them one at a time as they tab
           through is how a form becomes exhausting. */
        return { ...state, submitted: true, problems, touched: { ...NO_TOUCHES } };
      }

      return { ...state, submitted: true, problems: {}, phase: { status: "paying" } };
    }

    case "chargeSucceeded":
      if (state.phase.status !== "paying") return state;
      return {
        ...state,
        confirmingExit: false,
        phase: { status: "paid", sessionId: event.sessionId, last4: event.last4 },
      };

    case "chargeDeclined":
      if (state.phase.status !== "paying") return state;
      return { ...state, confirmingExit: false, phase: { status: "declined", message: event.message } };

    case "chargeDisconnected":
      if (state.phase.status !== "paying") return state;
      return { ...state, confirmingExit: false, phase: { status: "disconnected" } };

    case "exitRequested":
      /* Only worth confirming while money might be moving. Anywhere else,
         asking "are you sure?" is friction for its own sake. */
      if (state.phase.status !== "paying") return state;
      return { ...state, confirmingExit: true };

    case "exitCancelled":
      return { ...state, confirmingExit: false };

    case "sessionExpired":
      if (isTerminal(state.phase)) return state;
      /* A charge already in flight is allowed to land. Expiring the session out
         from under a payment that may already have taken the money would be the
         worst possible moment to lose track of it. */
      if (state.phase.status === "paying") return state;
      return { ...state, confirmingExit: false, phase: { status: "expired" } };
  }
}

/**
 * Which problems the customer should actually see right now.
 *
 * Errors on fields nobody has finished typing in are noise; the same errors
 * after pressing Pay are the answer to "why did nothing happen".
 */
export function visibleProblems(state: State): Partial<Record<FieldName, string>> {
  if (state.submitted) return state.problems;

  const visible: Partial<Record<FieldName, string>> = {};
  for (const [field, message] of Object.entries(state.problems) as [FieldName, string][]) {
    if (state.touched[field]) visible[field] = message;
  }
  return visible;
}
