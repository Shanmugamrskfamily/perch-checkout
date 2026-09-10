"use client";

/**
 * The Pay button.
 *
 * It states the amount rather than saying "Continue". The last thing a customer
 * touches before money moves should say how much money, so nobody can claim
 * afterwards that they did not know.
 *
 * While a charge is in flight the button is disabled *and* the reducer refuses
 * a second submit. The disabled attribute is the part the customer can see; the
 * reducer is the part that is actually true.
 */

export interface PayButtonProps {
  readonly label: string;
  readonly busy: boolean;
  readonly disabled?: boolean;
}

export function PayButton({ label, busy, disabled }: PayButtonProps) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      /* Announces the change from "Pay £18.00" to "Taking payment" without
         stealing focus from wherever the customer left it. */
      aria-live="polite"
      className={[
        "relative flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-3",
        "text-[15px] font-medium text-white",
        "bg-accent hover:bg-accent-strong",
        "transition-[background-color,opacity] duration-150",
        "disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:bg-accent",
      ].join(" ")}
    >
      {busy ? <Spinner /> : null}
      <span>{busy ? "Taking payment" : label}</span>
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white"
    />
  );
}
