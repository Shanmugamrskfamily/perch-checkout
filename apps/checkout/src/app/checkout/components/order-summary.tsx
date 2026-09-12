"use client";

/**
 * What the customer is paying for, who is being paid, and what it comes to.
 *
 * The merchant's name gets equal weight to the product. Somebody about to type
 * a card number wants to confirm they are paying who they think they are, and
 * on an embedded checkout the surrounding page is exactly the thing that cannot
 * be trusted to tell them.
 *
 * Tax appears as its own line rather than being folded into one number. A
 * customer who is charged more than the price they clicked deserves to see
 * where the difference went, and "GST" or "VAT" by its local name is the
 * difference between a total that makes sense and one that looks like a
 * mistake.
 */

import { formatMoney, type Money } from "@/lib/money";
import { approximateLocal, type Charge } from "@/lib/regions";
import type { Product } from "@/lib/catalog";

export function OrderSummary({
  product,
  charge,
  onClose,
}: {
  product: Product;
  /** Null until the customer has said where they are. */
  charge: Charge | null;
  /** Leaves without paying. See the note on the button below. */
  onClose: () => void;
}) {
  const local = charge ? approximateLocal(charge.total, charge.region) : null;

  return (
    <div className="flex flex-col gap-3.5 border-b border-line px-5 pb-4 pt-5 sm:gap-4 sm:px-6 sm:pb-5 sm:pt-6">
      <div className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-faint">
            {product.merchant}
          </p>

          {/*
            A visible way out.

            On a desktop you can press Escape or click the backdrop. On a phone
            the sheet fills the screen, there is no Escape key, and the backdrop
            is a strip at the top that nothing advertises — so without this a
            customer who changed their mind is stuck in a payment form. Being
            trapped in a checkout is a good way to never be trusted with a card
            again.

            It routes through the same decision point as every other way of
            leaving, so mid-payment it asks rather than vanishing.
          */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close checkout"
            className="-mr-2 -mt-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-faint transition-colors duration-150 hover:bg-sunken hover:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
              <path
                d="M3.5 3.5l8 8M11.5 3.5l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-[16px] font-semibold leading-tight text-ink">{product.name}</h1>
            <p className="text-[13px] leading-snug text-ink-soft">{product.summary}</p>
          </div>
          <p className="shrink-0 text-[16px] font-semibold tabular-nums text-ink">
            {formatMoney(product.price)}
          </p>
        </div>
      </div>

      {charge ? (
        <dl className="flex flex-col gap-1.5 border-t border-line pt-3.5 text-[13px]">
          <Row label="Subtotal" value={formatMoney(charge.subtotal)} />
          <Row
            label={`${charge.region.taxName} · ${charge.region.name}`}
            value={formatMoney(charge.tax)}
          />
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-line pt-2.5">
            <dt className="text-[13.5px] font-semibold text-ink">Total</dt>
            <dd className="text-[15px] font-semibold tabular-nums text-ink">
              {formatMoney(charge.total)}
            </dd>
          </div>

          {local ? (
            /* Shown, and labelled as indicative, because a customer abroad
               reads a rupee figure and cannot tell whether it is ten pounds or
               a hundred. What is actually charged stays in rupees, and saying
               so here is more honest than quietly converting. */
            <p className="pt-1 text-right text-[11.5px] leading-relaxed text-ink-faint">
              About {formatMoney(local)}. Charged in {charge.total.currency} at your bank&rsquo;s
              rate on the day.
            </p>
          ) : null}
        </dl>
      ) : (
        <p className="border-t border-line pt-3.5 text-[12.5px] text-ink-faint">
          Tax is added once you tell us where you are.
        </p>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums text-ink">{value}</dd>
    </div>
  );
}

export type { Money };
