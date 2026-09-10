/**
 * Card and email input: formatting, validation, and the wording of what went
 * wrong.
 *
 * Pure functions, no React. The rules about what a valid card looks like are
 * the kind of thing that gets quietly broken during a refactor, so they live
 * somewhere they can be tested directly.
 *
 * Nothing in this file logs. A card number must never reach a console, an error
 * report, or an analytics event, and the easiest way to guarantee that is for
 * the code holding card numbers to have no logging in it at all.
 */

export type CardBrand = "visa" | "mastercard" | "amex" | "unknown";

/** Where the spaces go, per brand. Amex is famously 4-6-5, not 4-4-4-4. */
const GROUPS: Record<CardBrand, readonly number[]> = {
  amex: [4, 6, 5],
  visa: [4, 4, 4, 4],
  mastercard: [4, 4, 4, 4],
  unknown: [4, 4, 4, 4],
};

const MAX_DIGITS: Record<CardBrand, number> = {
  amex: 15,
  visa: 16,
  mastercard: 16,
  unknown: 19,
};

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Identifies the brand from the leading digits.
 *
 * Only enough precision to drive formatting and the CVC length. Real brand
 * detection is a large table maintained by the networks, and getting it subtly
 * wrong is worse than not doing it, so this stays coarse and honest.
 */
export function detectBrand(value: string): CardBrand {
  const digits = digitsOnly(value);
  if (/^4/.test(digits)) return "visa";
  if (/^3[47]/.test(digits)) return "amex";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "mastercard";
  return "unknown";
}

/** Inserts brand-appropriate spacing as the customer types. */
export function formatCardNumber(value: string): string {
  const brand = detectBrand(value);
  const digits = digitsOnly(value).slice(0, MAX_DIGITS[brand]);

  const parts: string[] = [];
  let index = 0;
  for (const size of GROUPS[brand]) {
    if (index >= digits.length) break;
    parts.push(digits.slice(index, index + size));
    index += size;
  }
  if (index < digits.length) parts.push(digits.slice(index));

  return parts.join(" ");
}

/**
 * The Luhn check.
 *
 * A checksum, not a guarantee: it catches typos and transposed digits before
 * the customer waits on a round trip to find out. It says nothing about whether
 * the card exists or has money on it — only the issuer knows that.
 */
export function passesLuhn(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 12) return false;

  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function last4(value: string): string {
  return digitsOnly(value).slice(-4);
}

export interface Expiry {
  /** 1-12 */
  readonly month: number;
  /** Four digits. */
  readonly year: number;
}

/** Formats keystrokes into `MM / YY`, inserting the separator once. */
export function formatExpiry(value: string): string {
  const digits = digitsOnly(value).slice(0, 4);
  if (digits.length === 0) return "";

  /* A leading digit above 1 can only be a single-digit month, so "5" becomes
     "05" and the customer moves straight on to the year. */
  if (digits.length === 1) return /[2-9]/.test(digits) ? `0${digits} / ` : digits;
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)} / ${digits.slice(2)}`;
}

export function parseExpiry(value: string): Expiry | null {
  const digits = digitsOnly(value);
  if (digits.length !== 4) return null;

  const month = Number(digits.slice(0, 2));
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;

  /* Two-digit years are read as this century. A card expiring in 2099 is not a
     case worth designing for; a card expiring in 1926 is a typo. */
  const year = 2000 + Number(digits.slice(2));
  return { month, year };
}

/** A card is valid through the last day of its expiry month. */
export function isExpired(expiry: Expiry, now: Date = new Date()): boolean {
  const endOfMonth = new Date(expiry.year, expiry.month, 1);
  return endOfMonth <= new Date(now.getFullYear(), now.getMonth(), 1);
}

export function cvcLength(brand: CardBrand): number {
  return brand === "amex" ? 4 : 3;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * A deliberately loose email check.
 *
 * The only authority on whether an address works is whether mail arrives. A
 * strict regex here rejects real addresses — plus-addressing, new top-level
 * domains, unicode — and the customer cannot argue with it. This catches the
 * genuine mistakes, a missing @ or a trailing comma, and lets everything else
 * through to the receipt.
 */
export function isPlausibleEmail(value: string): boolean {
  return EMAIL.test(value.trim());
}

export type FieldName = "email" | "number" | "expiry" | "cvc";

export interface CardForm {
  readonly email: string;
  readonly number: string;
  readonly expiry: string;
  readonly cvc: string;
}

export const EMPTY_FORM: CardForm = { email: "", number: "", expiry: "", cvc: "" };

/**
 * Validates the whole form and returns per-field messages.
 *
 * Messages say what to do, not what is wrong with you. "Check the expiry date"
 * rather than "Invalid input", and never the word "error" — the customer is
 * trying to give someone money and does not need to be told off.
 */
export function validate(form: CardForm, now: Date = new Date()): Partial<Record<FieldName, string>> {
  const problems: Partial<Record<FieldName, string>> = {};

  if (form.email.trim().length === 0) {
    problems.email = "We need an email to send your receipt to.";
  } else if (!isPlausibleEmail(form.email)) {
    problems.email = "That does not look like an email address.";
  }

  const brand = detectBrand(form.number);
  const digits = digitsOnly(form.number);
  if (digits.length === 0) {
    problems.number = "Enter your card number.";
  } else if (digits.length < (brand === "amex" ? 15 : 16)) {
    problems.number = "This card number looks too short.";
  } else if (!passesLuhn(digits)) {
    problems.number = "Check this card number, a digit looks wrong.";
  }

  const expiry = parseExpiry(form.expiry);
  if (form.expiry.trim().length === 0) {
    problems.expiry = "Enter the expiry date.";
  } else if (!expiry) {
    problems.expiry = "Use the format shown on your card, MM / YY.";
  } else if (isExpired(expiry, now)) {
    problems.expiry = "This card has expired.";
  }

  const expectedCvc = cvcLength(brand);
  if (form.cvc.trim().length === 0) {
    problems.cvc = "Enter the security code.";
  } else if (digitsOnly(form.cvc).length !== expectedCvc) {
    problems.cvc =
      brand === "amex"
        ? "Amex security codes are four digits, on the front."
        : "The security code is three digits, on the back.";
  }

  return problems;
}

export function isComplete(form: CardForm, now: Date = new Date()): boolean {
  return Object.keys(validate(form, now)).length === 0;
}
