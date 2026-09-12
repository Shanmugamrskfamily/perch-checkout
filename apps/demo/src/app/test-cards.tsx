"use client";

/**
 * Test cards, on the page rather than in a README.
 *
 * A reviewer with ten minutes should be able to reach every state without
 * reading anything first, so the numbers are here, one tap to copy, with a line
 * each on what they do. This is the same instinct a payment company applies to
 * its own test mode: the fastest path to seeing the edge cases is the one that
 * gets them seen.
 */

import { useCallback, useState } from "react";

const CARDS = [
  {
    number: "4242 4242 4242 4242",
    title: "Goes through",
    detail: "Approved first time.",
  },
  {
    number: "4000 0000 0000 0002",
    title: "Declined",
    detail: "The issuer says no. Trying it again will not help.",
  },
  {
    number: "4000 0000 0000 0341",
    title: "Drops, then works",
    detail: "First attempt loses the connection. Press Pay again and it completes.",
  },
] as const;

export function TestCards() {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = useCallback(async (number: string) => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(number);
      window.setTimeout(() => setCopied((c) => (c === number ? null : c)), 1600);
    } catch {
      /* Clipboard access can be refused. The number is on screen either way. */
    }
  }, []);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        Test cards
      </h2>

      <ul className="flex flex-col gap-1.5">
        {CARDS.map((card) => (
          <li key={card.number}>
            <button
              type="button"
              onClick={() => copy(card.number)}
              className="flex w-full flex-col gap-1 rounded-xl border border-line bg-card px-3.5 py-3 text-left transition-colors duration-150 hover:border-ink-faint"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="font-mono text-[13px] tabular-nums">{card.number}</span>
                <span className="text-[11px] text-ink-faint">
                  {copied === card.number ? "Copied" : "Copy"}
                </span>
              </span>
              <span className="text-[12.5px] font-medium">{card.title}</span>
              <span className="text-[12px] leading-snug text-ink-soft">{card.detail}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-[11.5px] leading-relaxed text-ink-faint">
        Any expiry in the future and a security code of the right length will do. Any other
        well-formed card number is approved, so Visa, Mastercard, Amex, RuPay, Diners Club and
        Discover test numbers all work and the checkout will recognise each one as you type.
      </p>
    </section>
  );
}
