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

export type CardBrand =
  | "visa"
  | "mastercard"
  | "amex"
  | "rupay"
  | "diners"
  | "discover"
  | "jcb"
  | "unknown";

interface BrandSpec {
  /** Human name, used in labels and for assistive technology. */
  readonly label: string;
  /** Where the spaces go. Amex is famously 4-6-5, Diners 4-6-4. */
  readonly groups: readonly number[];
  /** How many digits a complete number has. */
  readonly length: number;
  /** Security code length. Amex is the odd one at four, on the front. */
  readonly cvc: number;
}

/**
 * The networks this checkout recognises.
 *
 * Recognition is for the customer's benefit, not the gateway's. A form that
 * visibly knows which card you are holding is a form that looks like it has
 * seen a card before, and that is most of what "trustworthy" means on a payment
 * screen. The prefixes below are the well-known ranges, not the exhaustive
 * tables the networks publish: being coarse and correct beats being detailed
 * and subtly wrong, because a card the form fails to recognise is a customer
 * who hesitates.
 */
const BRANDS: Record<Exclude<CardBrand, "unknown">, BrandSpec> = {
  visa: { label: "Visa", groups: [4, 4, 4, 4], length: 16, cvc: 3 },
  mastercard: { label: "Mastercard", groups: [4, 4, 4, 4], length: 16, cvc: 3 },
  amex: { label: "American Express", groups: [4, 6, 5], length: 15, cvc: 4 },
  rupay: { label: "RuPay", groups: [4, 4, 4, 4], length: 16, cvc: 3 },
  diners: { label: "Diners Club", groups: [4, 6, 4], length: 14, cvc: 3 },
  discover: { label: "Discover", groups: [4, 4, 4, 4], length: 16, cvc: 3 },
  jcb: { label: "JCB", groups: [4, 4, 4, 4], length: 16, cvc: 3 },
};

const UNKNOWN: BrandSpec = { label: "Card", groups: [4, 4, 4, 4], length: 16, cvc: 3 };

export function brandSpec(brand: CardBrand): BrandSpec {
  return brand === "unknown" ? UNKNOWN : BRANDS[brand];
}

export function brandLabel(brand: CardBrand): string {
  return brandSpec(brand).label;
}

/** Order shown in the accepted-cards row. Visa and Mastercard lead by volume. */
export const DISPLAY_BRANDS: readonly Exclude<CardBrand, "unknown">[] = [
  "visa",
  "mastercard",
  "amex",
  "rupay",
  "diners",
  "discover",
];

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
  /* Diners before JCB: both live in the 3 range and the 36/38/39 prefixes
     would otherwise be swallowed by a looser 3-digit test. */
  if (/^3(0[0-5]|095|6|8|9)/.test(digits)) return "diners";
  if (/^35(2[89]|[3-8][0-9])/.test(digits)) return "jcb";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "mastercard";
  /* RuPay and Discover overlap in the 60 and 65 ranges, so order matters and
     the more specific prefix has to be tested first. Discover's 6011 begins
     with 60, which a plain RuPay check would otherwise swallow. Beyond that,
     in a shop based in Bengaluru the domestic network is the likelier card in
     the customer's hand, so RuPay takes the ambiguous remainder. */
  if (/^6011/.test(digits)) return "discover";
  if (/^(60|6521|6522|81|82|508)/.test(digits)) return "rupay";
  if (/^(64[4-9]|65)/.test(digits)) return "discover";

  return "unknown";
}

/** Inserts brand-appropriate spacing as the customer types. */
export function formatCardNumber(value: string): string {
  const brand = detectBrand(value);
  const spec = brandSpec(brand);
  /* An unrecognised number is allowed to run to 19 digits, the longest a card
     number can be, rather than being truncated at 16 on a guess. */
  const limit = brand === "unknown" ? 19 : spec.length;
  const digits = digitsOnly(value).slice(0, limit);

  const parts: string[] = [];
  let index = 0;
  for (const size of spec.groups) {
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
  return brandSpec(brand).cvc;
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

export type FieldName = "email" | "country" | "number" | "expiry" | "cvc";

export interface CardForm {
  readonly email: string;
  /** ISO 3166-1 alpha-2. Decides the tax, so it is collected before the card. */
  readonly country: string;
  readonly number: string;
  readonly expiry: string;
  readonly cvc: string;
}

export const EMPTY_FORM: CardForm = {
  email: "",
  country: "",
  number: "",
  expiry: "",
  cvc: "",
};

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

  if (form.country.trim().length === 0) {
    problems.country = "Choose where you are, so we can work out the tax.";
  }

  const brand = detectBrand(form.number);
  const spec = brandSpec(brand);
  const digits = digitsOnly(form.number);
  if (digits.length === 0) {
    problems.number = "Enter your card number.";
  } else if (digits.length < spec.length) {
    problems.number =
      brand === "unknown"
        ? "This card number looks too short."
        : `A ${spec.label} number has ${spec.length} digits.`;
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

  if (form.cvc.trim().length === 0) {
    problems.cvc = "Enter the security code.";
  } else if (digitsOnly(form.cvc).length !== spec.cvc) {
    /* Amex prints four digits on the front; everyone else prints three on the
       back. Saying where to look is more useful than saying how many. */
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
