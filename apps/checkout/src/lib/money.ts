/**
 * Money.
 *
 * Amounts are integers in the currency's minor unit — pence, cents, paise —
 * and never floating point. `0.1 + 0.2` is `0.30000000000000004` in JavaScript,
 * and a checkout that adds tax to a price in floats will eventually charge
 * somebody a penny more than it displayed. Every payment API worth using takes
 * integer minor units for exactly this reason.
 */

export interface Money {
  /** Integer. 1999 means £19.99 in a currency with two decimal places. */
  readonly amount: number;
  /** ISO 4217, e.g. "GBP", "USD", "INR". */
  readonly currency: string;
}

/**
 * Formats for display in the customer's own locale.
 *
 * `Intl` knows where the symbol goes, which separator to use, and how many
 * decimal places a currency actually has — yen has none, dinar has three. A
 * hand-rolled `"£" + (amount / 100).toFixed(2)` is wrong in most of the world.
 */
export function formatMoney(money: Money, locale?: string): string {
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currency,
  });

  /* `minimumFractionDigits` tells us the currency's exponent, so the same code
     handles two-decimal, zero-decimal and three-decimal currencies. */
  const digits = formatter.resolvedOptions().minimumFractionDigits ?? 2;
  return formatter.format(money.amount / 10 ** digits);
}
