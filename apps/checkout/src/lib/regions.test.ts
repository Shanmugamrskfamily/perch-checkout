/**
 * Money and tax.
 *
 * The arithmetic here decides what a customer is charged, so it is integer
 * arithmetic in the currency's smallest unit, and these tests exist mostly to
 * keep it that way.
 */

import { formatMoney } from "./money";
import { approximateLocal, findRegion, priceWithTax, REGIONS } from "./regions";

const PRICE = { amount: 145000, currency: "INR" };

function region(code: string) {
  const found = findRegion(code);
  if (!found) throw new Error(`missing test region ${code}`);
  return found;
}

describe("tax", () => {
  it("adds Indian GST at eighteen percent", () => {
    const charge = priceWithTax(PRICE, region("IN"));
    expect(charge.tax.amount).toBe(26100);
    expect(charge.total.amount).toBe(171100);
  });

  it("adds Dutch BTW at twenty-one percent and calls it BTW", () => {
    const charge = priceWithTax(PRICE, region("NL"));
    expect(charge.tax.amount).toBe(30450);
    expect(charge.total.amount).toBe(175450);
    /* The local name, because "tax" on a Dutch receipt reads like a mistake. */
    expect(charge.region.taxName).toBe("BTW");
  });

  it("keeps every amount an integer", () => {
    /* A rate that does not divide evenly is where floating point would show
       up, and a total ending .00000000004 is not a total. */
    const charge = priceWithTax({ amount: 99999, currency: "INR" }, region("US"));
    expect(Number.isInteger(charge.tax.amount)).toBe(true);
    expect(Number.isInteger(charge.total.amount)).toBe(true);
    expect(charge.total.amount).toBe(charge.subtotal.amount + charge.tax.amount);
  });

  it("never loses or invents a unit", () => {
    for (const r of REGIONS) {
      const charge = priceWithTax(PRICE, r);
      expect(charge.total.amount).toBe(charge.subtotal.amount + charge.tax.amount);
      expect(charge.total.currency).toBe("INR");
    }
  });
});

describe("the indicative local figure", () => {
  it("says nothing when the customer is already in the charge currency", () => {
    const charge = priceWithTax(PRICE, region("IN"));
    /* A second identical number would be noise, not reassurance. */
    expect(approximateLocal(charge.total, charge.region)).toBeNull();
  });

  it("converts for a customer abroad", () => {
    const charge = priceWithTax(PRICE, region("GB"));
    const local = approximateLocal(charge.total, charge.region);
    expect(local?.currency).toBe("GBP");
    expect(local?.amount).toBeGreaterThan(0);
  });

  it("handles a currency with no minor unit", () => {
    /* Yen is in the country list precisely because it breaks code that assumes
       two decimal places everywhere. */
    const charge = priceWithTax(PRICE, region("JP"));
    const local = approximateLocal(charge.total, charge.region);
    expect(local?.currency).toBe("JPY");
    expect(formatMoney(local!)).not.toMatch(/\./);
  });
});

describe("formatting", () => {
  it("puts the symbol where the locale expects it", () => {
    expect(formatMoney({ amount: 145000, currency: "INR" }, "en-IN")).toContain("1,450.00");
    expect(formatMoney({ amount: 1800, currency: "GBP" }, "en-GB")).toBe("£18.00");
  });

  it("gives a zero-decimal currency no decimals", () => {
    /* Asserting on the digits, not the symbol. A British locale disambiguates
       yen as "JP¥" and a Japanese one does not, and pinning the symbol would
       make this test a statement about ICU rather than about our arithmetic. */
    const formatted = formatMoney({ amount: 2839, currency: "JPY" }, "en-GB");
    expect(formatted).toContain("2,839");
    expect(formatted).not.toMatch(/\./);
  });
});
