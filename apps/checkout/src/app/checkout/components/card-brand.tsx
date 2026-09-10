"use client";

/**
 * A small brand mark inside the card field.
 *
 * Its job is confirmation, not decoration: it tells the customer the form
 * understood what they typed, which is quiet reassurance at the exact moment
 * people are most inclined to double-check themselves. Drawn inline so it costs
 * no request and cannot fail to load.
 */

import type { CardBrand } from "@/lib/card";

export function CardBrandMark({ brand }: { brand: CardBrand }) {
  if (brand === "unknown") return null;

  if (brand === "mastercard") {
    return (
      <svg width="30" height="20" viewBox="0 0 30 20" aria-label="Mastercard" role="img">
        <circle cx="12" cy="10" r="6.5" fill="#e94d3c" />
        <circle cx="18" cy="10" r="6.5" fill="#f0a02a" fillOpacity="0.9" />
      </svg>
    );
  }

  return (
    <span
      aria-label={brand === "visa" ? "Visa" : "American Express"}
      role="img"
      className="select-none text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-soft"
    >
      {brand === "visa" ? "Visa" : "Amex"}
    </span>
  );
}
