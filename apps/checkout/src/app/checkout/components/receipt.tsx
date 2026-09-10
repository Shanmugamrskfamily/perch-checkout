"use client";

/**
 * The paid state.
 *
 * It shows the amount, the card it went on, and where the receipt is going,
 * because those are the three things a person checks before they close the
 * window. The session reference is there in small print for when they later
 * need to quote it to someone.
 *
 * There is no automatic redirect. A checkout that closes itself the instant it
 * succeeds takes the confirmation away before it has been read, and then the
 * customer has no idea whether it worked.
 */

import { formatMoney, type Money } from "@/lib/money";

export function Receipt({
  amount,
  last4,
  email,
  sessionId,
  onDone,
}: {
  amount: Money;
  last4: string;
  email: string;
  sessionId: string;
  onDone: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-10 text-center">
      <Tick />

      <div className="flex flex-col gap-1.5">
        <h1 className="text-[17px] font-semibold tracking-tight text-ink">
          Paid {formatMoney(amount)}
        </h1>
        <p className="text-[13.5px] leading-relaxed text-ink-soft">
          Charged to the card ending {last4}. A receipt is on its way to{" "}
          <span className="text-ink">{email}</span>.
        </p>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="w-full rounded-[10px] border border-line px-4 py-2.5 text-[14px] font-medium text-ink transition-colors duration-150 hover:bg-sunken"
      >
        Done
      </button>

      <p className="font-mono text-[11px] text-ink-faint">{sessionId}</p>
    </div>
  );
}

function Tick() {
  return (
    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-positive/10">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <path
          d="M4.5 10.5l3.5 3.5 7.5-8"
          fill="none"
          stroke="var(--color-positive)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
