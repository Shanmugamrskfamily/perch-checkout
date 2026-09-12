"use client";

/**
 * Card network marks.
 *
 * These do more work than they look like they do. A row of card logos that
 * visibly reacts the moment you type your first digit is one of the strongest
 * trust signals a payment form has: it says the form has seen a card before,
 * and it confirms yours is welcome here before you have finished typing it.
 * Every serious checkout does this, and customers notice its absence without
 * being able to name what is missing.
 *
 * Drawn inline rather than loaded as images. A logo that arrives late, or not
 * at all on a bad connection, is worse than no logo: the customer sees a broken
 * box on the screen where they are about to type a card number. These cost no
 * request and cannot fail.
 *
 * Simple geometric and typographic renderings, not the networks' official
 * artwork, which requires a licence to reproduce.
 */

import type { CardBrand } from "@/lib/card";
import { DISPLAY_BRANDS, brandLabel } from "@/lib/card";

function Visa() {
  return (
    <text
      x="17"
      y="15"
      textAnchor="middle"
      fontSize="9"
      fontWeight="700"
      fontStyle="italic"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      fill="#1434cb"
      letterSpacing="0.3"
    >
      VISA
    </text>
  );
}

function Mastercard() {
  return (
    <g>
      <circle cx="13.5" cy="11" r="6" fill="#eb001b" />
      <circle cx="20.5" cy="11" r="6" fill="#f79e1b" fillOpacity="0.85" />
    </g>
  );
}

function Amex() {
  return (
    <g>
      <rect x="2" y="2" width="30" height="18" rx="3" fill="#0077c8" />
      <text
        x="17"
        y="14.5"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill="#ffffff"
        letterSpacing="0.2"
      >
        AMEX
      </text>
    </g>
  );
}

function RuPay() {
  return (
    <text
      x="17"
      y="14.5"
      textAnchor="middle"
      fontSize="8"
      fontWeight="700"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
      letterSpacing="-0.1"
    >
      <tspan fill="#097b3c">Ru</tspan>
      <tspan fill="#f6871f">Pay</tspan>
    </text>
  );
}

function Diners() {
  return (
    <g>
      <circle cx="17" cy="11" r="7.5" fill="#0079be" />
      <circle cx="17" cy="11" r="4" fill="#ffffff" />
    </g>
  );
}

function Discover() {
  /* No wordmark. At this size "DISCOVER" cannot be set legibly, and an
     abbreviation reads as a typo rather than a logo. The orange disc is the
     recognisable part, and colour alone separates it from the blue Diners ring
     sitting next to it. */
  return (
    <g>
      <circle cx="17" cy="11" r="7.5" fill="#ff6000" />
      <circle cx="17" cy="11" r="7.5" fill="none" stroke="#e05600" strokeWidth="0.8" />
    </g>
  );
}

function Jcb() {
  return (
    <g>
      <rect x="3" y="3" width="8" height="16" rx="1.5" fill="#0e4c96" />
      <rect x="13" y="3" width="8" height="16" rx="1.5" fill="#cc0000" />
      <rect x="23" y="3" width="8" height="16" rx="1.5" fill="#00a650" />
    </g>
  );
}

const ART: Record<Exclude<CardBrand, "unknown">, () => React.JSX.Element> = {
  visa: Visa,
  mastercard: Mastercard,
  amex: Amex,
  rupay: RuPay,
  diners: Diners,
  discover: Discover,
  jcb: Jcb,
};

/** A single mark, framed like the card it stands for. */
export function CardBrandMark({ brand }: { brand: CardBrand }) {
  if (brand === "unknown") return null;
  const Art = ART[brand];

  return (
    <svg width="34" height="22" viewBox="0 0 34 22" role="img" aria-label={brandLabel(brand)}>
      <rect
        x="0.5"
        y="0.5"
        width="33"
        height="21"
        rx="3.5"
        fill="#ffffff"
        stroke="rgba(16,21,27,0.14)"
      />
      <Art />
    </svg>
  );
}

/**
 * The accepted-cards row.
 *
 * Before anything is typed, every mark sits at rest. Once a network is
 * recognised, the others recede and the match is lifted. The unmatched marks
 * fade rather than disappear, because a row that reflows as you type draws the
 * eye away from the field you are trying to fill in.
 */
export function AcceptedCards({ detected }: { detected: CardBrand }) {
  const recognised = detected !== "unknown";

  return (
    <div
      className="flex shrink-0 items-center gap-1"
      /* One label for the group. Read out individually these are six
         meaningless logo names in the middle of a form. */
      role="img"
      aria-label={
        recognised
          ? `${brandLabel(detected)} card recognised`
          : "Visa, Mastercard, American Express, RuPay, Diners Club and Discover accepted"
      }
    >
      {DISPLAY_BRANDS.map((brand) => {
        const isMatch = brand === detected;
        return (
          <span
            key={brand}
            aria-hidden="true"
            className={[
              "transition-[opacity,filter] duration-200 ease-out",
              recognised && !isMatch ? "opacity-25 grayscale" : "opacity-100",
            ].join(" ")}
          >
            <CardBrandMark brand={brand} />
          </span>
        );
      })}
    </div>
  );
}
