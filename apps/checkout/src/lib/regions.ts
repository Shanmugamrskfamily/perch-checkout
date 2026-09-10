/**
 * Where the customer is, and what that costs.
 *
 * This matters more here than it would for an ordinary shop. A Merchant of
 * Record is the legal seller, not the merchant behind it, so the tax owed is
 * decided by where the *customer* is, not where the shop is. An Indian business
 * selling to a buyer in Rotterdam owes Dutch VAT, and somebody has to collect
 * it. That is the whole product.
 *
 * Which is why the country field sits above the card fields: choosing it moves
 * the total, and nobody should be typing a card number against a figure that is
 * about to change.
 *
 * The rates below are single headline numbers per country. Real tax is
 * jurisdictional — American sales tax varies by state and by whether the thing
 * sold is a digital good at all — and a real implementation reads them from a
 * service that is somebody's full-time job to maintain. The shape of the
 * calculation is the part worth showing.
 */

import type { Money } from "./money";

export interface Region {
  /** ISO 3166-1 alpha-2. */
  readonly code: string;
  readonly name: string;
  /** What the tax is called where the customer lives. Words matter on a receipt. */
  readonly taxName: string;
  /**
   * Basis points, so 1800 is 18%.
   *
   * An integer for the same reason amounts are integers: a rate of `0.18` and a
   * price of 145000 will not always multiply to the number you expect.
   */
  readonly taxRateBp: number;
  /** Local currency, used only for the indicative conversion. */
  readonly currency: string;
  /**
   * Roughly how much of the local currency one rupee is worth.
   *
   * Deliberately approximate, and floating point is fine precisely because it
   * is approximate. It is never used to decide what to charge — only to show a
   * customer abroad a figure they can recognise. The authoritative amount stays
   * in integer paise. Real checkouts get a quoted rate with an expiry; this one
   * is a constant and says so on screen.
   */
  readonly approxPerRupee: number;
}

export const REGIONS: readonly Region[] = [
  { code: "IN", name: "India", taxName: "GST", taxRateBp: 1800, currency: "INR", approxPerRupee: 1 },
  { code: "GB", name: "United Kingdom", taxName: "VAT", taxRateBp: 2000, currency: "GBP", approxPerRupee: 0.0094 },
  { code: "US", name: "United States", taxName: "Sales tax", taxRateBp: 888, currency: "USD", approxPerRupee: 0.0119 },
  { code: "NL", name: "Netherlands", taxName: "BTW", taxRateBp: 2100, currency: "EUR", approxPerRupee: 0.011 },
  { code: "DE", name: "Germany", taxName: "VAT", taxRateBp: 1900, currency: "EUR", approxPerRupee: 0.011 },
  { code: "FR", name: "France", taxName: "VAT", taxRateBp: 2000, currency: "EUR", approxPerRupee: 0.011 },
  { code: "AE", name: "United Arab Emirates", taxName: "VAT", taxRateBp: 500, currency: "AED", approxPerRupee: 0.0437 },
  { code: "SG", name: "Singapore", taxName: "GST", taxRateBp: 900, currency: "SGD", approxPerRupee: 0.0154 },
  { code: "AU", name: "Australia", taxName: "GST", taxRateBp: 1000, currency: "AUD", approxPerRupee: 0.0182 },
  { code: "CA", name: "Canada", taxName: "GST", taxRateBp: 500, currency: "CAD", approxPerRupee: 0.0163 },
  /* Japan earns its place in the list: the yen has no minor unit, so it is the
     case that breaks any code assuming two decimal places everywhere. */
  { code: "JP", name: "Japan", taxName: "Consumption tax", taxRateBp: 1000, currency: "JPY", approxPerRupee: 1.78 },
];

export function findRegion(code: string): Region | undefined {
  return REGIONS.find((region) => region.code === code);
}

export interface Charge {
  readonly subtotal: Money;
  readonly tax: Money;
  readonly total: Money;
  readonly region: Region;
}

/**
 * Adds tax to a price.
 *
 * `Math.round` on the half, in the currency's smallest unit, once. Rounding at
 * each step of a longer calculation is how totals drift a paisa away from what
 * the customer was shown, and on a payment screen that difference is the only
 * thing anyone notices.
 */
export function priceWithTax(subtotal: Money, region: Region): Charge {
  const tax = Math.round((subtotal.amount * region.taxRateBp) / 10_000);
  return {
    subtotal,
    tax: { amount: tax, currency: subtotal.currency },
    total: { amount: subtotal.amount + tax, currency: subtotal.currency },
    region,
  };
}

/**
 * The same amount, roughly, in the customer's own currency.
 *
 * Returns null when there is nothing useful to say — the customer is already in
 * the charge currency, so a second identical figure would only add noise.
 */
export function approximateLocal(total: Money, region: Region): Money | null {
  if (region.currency === total.currency) return null;

  const rupees = total.amount / 100;
  const local = rupees * region.approxPerRupee;

  /* Yen has no minor unit, so its "minor" amount is the number itself. */
  const exponent = region.currency === "JPY" ? 0 : 2;
  return { amount: Math.round(local * 10 ** exponent), currency: region.currency };
}
