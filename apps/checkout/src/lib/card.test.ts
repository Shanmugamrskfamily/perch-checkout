/**
 * Input handling. Boring, and the part a customer actually touches.
 */

import {
  detectBrand,
  formatCardNumber,
  formatExpiry,
  isExpired,
  isPlausibleEmail,
  parseExpiry,
  passesLuhn,
  validate,
  EMPTY_FORM,
  cvcLength,
} from "./card";

const NOW = new Date("2026-06-15T00:00:00Z");

describe("card brands", () => {
  it.each([
    ["4242424242424242", "visa"],
    ["378282246310005", "amex"],
    ["371449635398431", "amex"],
    ["5555555555554444", "mastercard"],
    ["2223003122003222", "mastercard"],
    /* RuPay is the domestic network in India, where this shop is. A customer
       whose card the form does not appear to recognise is one who hesitates. */
    ["6521000000000000", "rupay"],
    ["8100000000000000", "rupay"],
    ["9999999999999999", "unknown"],
  ])("reads %s as %s", (number, brand) => {
    expect(detectBrand(number)).toBe(brand);
  });
});

describe("formatting a card number", () => {
  it("groups most cards in fours", () => {
    expect(formatCardNumber("4242424242424242")).toBe("4242 4242 4242 4242");
  });

  it("groups amex four-six-five, as printed on the card", () => {
    expect(formatCardNumber("378282246310005")).toBe("3782 822463 10005");
  });

  it("ignores anything that is not a digit", () => {
    expect(formatCardNumber("4242-4242 4242.4242")).toBe("4242 4242 4242 4242");
  });

  it("stops at the brand's length rather than accepting forever", () => {
    expect(formatCardNumber("42424242424242429999")).toBe("4242 4242 4242 4242");
  });
});

describe("the Luhn check", () => {
  it("passes the real test numbers", () => {
    expect(passesLuhn("4242424242424242")).toBe(true);
    expect(passesLuhn("4000000000000002")).toBe(true);
    expect(passesLuhn("378282246310005")).toBe(true);
  });

  it("catches a single mistyped digit", () => {
    expect(passesLuhn("4242424242424243")).toBe(false);
  });

  it("catches two transposed digits", () => {
    expect(passesLuhn("4242424242422442")).toBe(false);
  });
});

describe("expiry", () => {
  it("moves straight past the month when it cannot be anything else", () => {
    /* Typing 5 can only mean May, so it becomes 05 and the caret moves on. */
    expect(formatExpiry("5")).toBe("05 / ");
    expect(formatExpiry("1")).toBe("1");
  });

  it("inserts the separator once", () => {
    expect(formatExpiry("1230")).toBe("12 / 30");
    expect(formatExpiry("12 / 30")).toBe("12 / 30");
  });

  it("reads a four digit expiry", () => {
    expect(parseExpiry("12 / 30")).toEqual({ month: 12, year: 2030 });
  });

  it.each(["", "1", "123", "13 / 30", "00 / 30"])("refuses %p", (value) => {
    expect(parseExpiry(value)).toBeNull();
  });

  it("treats a card as valid through the last day of its month", () => {
    expect(isExpired({ month: 6, year: 2026 }, NOW)).toBe(false);
    expect(isExpired({ month: 5, year: 2026 }, NOW)).toBe(true);
    expect(isExpired({ month: 7, year: 2026 }, NOW)).toBe(false);
  });
});

describe("email", () => {
  it.each(["a@b.co", "first.last+tag@sub.example.org"])("accepts %p", (value) => {
    /* Deliberately loose. The only authority on whether an address works is
       whether mail arrives, and a strict pattern rejects real addresses the
       customer cannot argue with. */
    expect(isPlausibleEmail(value)).toBe(true);
  });

  it.each(["", "nope", "a@b", "a b@c.com", "a@b.c"])("refuses %p", (value) => {
    expect(isPlausibleEmail(value)).toBe(false);
  });
});

describe("security code length", () => {
  it("is four on amex and three elsewhere", () => {
    expect(cvcLength("amex")).toBe(4);
    expect(cvcLength("visa")).toBe(3);
    expect(cvcLength("rupay")).toBe(3);
  });
});

describe("validation messages", () => {
  it("names every empty field", () => {
    const problems = validate(EMPTY_FORM, NOW);
    expect(Object.keys(problems).sort()).toEqual(["country", "cvc", "email", "expiry", "number"]);
  });

  it("tells the customer what to do rather than what is wrong with them", () => {
    const problems = validate({ ...EMPTY_FORM, number: "4242424242424243" }, NOW);
    expect(problems.number).toMatch(/check this card number/i);
    /* Nowhere in this file does a message say "invalid" or "error". Someone is
       trying to give us money; they do not need telling off. */
    for (const message of Object.values(problems)) {
      expect(message.toLowerCase()).not.toMatch(/invalid|error/);
    }
  });

  it("asks for four digits on an amex and three otherwise", () => {
    const amex = validate({ ...EMPTY_FORM, number: "378282246310005", cvc: "123" }, NOW);
    expect(amex.cvc).toMatch(/four digits/i);

    const visa = validate({ ...EMPTY_FORM, number: "4242424242424242", cvc: "1234" }, NOW);
    expect(visa.cvc).toMatch(/three digits/i);
  });

  it("passes a complete, valid form", () => {
    const problems = validate(
      {
        email: "buyer@example.com",
        country: "IN",
        number: "4242 4242 4242 4242",
        expiry: "12 / 30",
        cvc: "123",
      },
      NOW,
    );
    expect(problems).toEqual({});
  });
});
