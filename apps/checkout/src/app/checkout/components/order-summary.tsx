"use client";

/**
 * What the customer is paying for, and who is being paid.
 *
 * The merchant's name is given equal weight to the product. A customer about to
 * type a card number wants to confirm they are paying who they think they are,
 * and on an embedded checkout that is the one fact the surrounding page cannot
 * be trusted to tell them.
 */

import { formatMoney } from "@/lib/money";
import type { Product } from "@/lib/catalog";

export function OrderSummary({ product }: { product: Product }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line px-6 pb-5 pt-6">
      <p className="text-[12px] font-medium uppercase tracking-[0.07em] text-ink-faint">
        {product.merchant}
      </p>

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
  );
}
