/**
 * The product catalogue.
 *
 * Stands in for the API call a real checkout would make. It is deliberately
 * asynchronous and deliberately able to fail, because "the product did not
 * load" is a state the customer can end up in and therefore a state the
 * checkout has to have a design for.
 */

import type { Money } from "./money";

export interface Product {
  readonly id: string;
  readonly name: string;
  /** One line under the name. Kept short: a checkout is not a product page. */
  readonly summary: string;
  readonly price: Money;
  /** Shown as the party being paid. Customers check this before typing a card. */
  readonly merchant: string;
}

/**
 * Prices are in paise, and the shop is in Bengaluru.
 *
 * That is the interesting case rather than a convenient one: an Indian business
 * selling to customers anywhere is precisely what a Merchant of Record exists
 * to make possible. The charge is in rupees wherever the customer happens to
 * be, and the tax owed is decided by where they are, not where the shop is.
 */
const CATALOG: Readonly<Record<string, Product>> = {
  prod_notebook: {
    id: "prod_notebook",
    name: "Field Notebook",
    summary: "Ninety-six pages, dot grid, sewn binding",
    price: { amount: 145000, currency: "INR" },
    merchant: "Kestrel Supply Co.",
  },
  prod_pen: {
    id: "prod_pen",
    name: "Machined Pen",
    summary: "Solid brass, refillable, ages beautifully",
    price: { amount: 340000, currency: "INR" },
    merchant: "Kestrel Supply Co.",
  },
  prod_bundle: {
    id: "prod_bundle",
    name: "Desk Set",
    summary: "Notebook and pen together, in a card sleeve",
    price: { amount: 450000, currency: "INR" },
    merchant: "Kestrel Supply Co.",
  },
};

export class UnknownProductError extends Error {
  constructor(productId: string) {
    super(`No product matches ${productId}`);
    this.name = "UnknownProductError";
  }
}

/**
 * Looks up a product, with the latency a real network call would have.
 *
 * The delay is not decoration. Without it the loading state never renders
 * during development, so it never gets designed, and the first person to meet
 * it is a customer on a train.
 */
export async function fetchProduct(productId: string, signal?: AbortSignal): Promise<Product> {
  await delay(320, signal);
  const product = CATALOG[productId];
  if (!product) throw new UnknownProductError(productId);
  return product;
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}
