"use client";

/**
 * Kestrel Supply Co. — a shop that has installed Perch.
 *
 * It integrates the way any real site would: one script tag, one call, three
 * callbacks. Nothing here imports from the SDK's source or shares a build with
 * it. If this page can do something, so can any merchant.
 *
 * The callback log is the point of the page. It shows exactly what crosses back
 * from the checkout, which is also a demonstration of how little that is.
 */

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { PERCH_SCRIPT_URL, type PerchHandle } from "@/lib/perch";
import { TestCards } from "./test-cards";
import { CallbackLog, type LogEntry } from "./callback-log";

const PRODUCT_ID = "prod_notebook";

export default function StorePage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [ready, setReady] = useState(false);
  const handleRef = useRef<PerchHandle | null>(null);
  const nextId = useRef(0);

  const log = useCallback((kind: LogEntry["kind"], label: string, detail: string) => {
    setEntries((current) => [
      { id: nextId.current++, at: new Date(), kind, label, detail },
      ...current,
    ]);
  }, []);

  const buy = useCallback(() => {
    if (!window.Perch) {
      log("error", "perch.js", "The script has not loaded yet.");
      return;
    }

    log("call", "Perch.open", `productId: "${PRODUCT_ID}"`);

    handleRef.current = window.Perch.open({
      productId: PRODUCT_ID,

      onSuccess: ({ sessionId }) => {
        log("success", "onSuccess", sessionId);
        /* A real shop would NOT ship the goods here. This callback runs in the
           customer's browser and anyone can call it from a console. Fulfilment
           belongs on the server, when Perch's signed webhook arrives. Treated
           here as what it is: permission to update the interface. */
      },

      onError: ({ code, message }) => log("error", "onError", `${code} — ${message}`),

      onClose: ({ reason }) => log("close", "onClose", `reason: "${reason}"`),
    });
  }, [log]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-12 px-6 py-12 md:py-16">
      <Script
        src={PERCH_SCRIPT_URL}
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => log("error", "perch.js", "The script failed to load.")}
      />

      <header className="flex items-baseline justify-between border-b border-line pb-5">
        <span className="text-[15px] font-semibold tracking-tight">Kestrel Supply Co.</span>
        <span className="text-[12px] text-ink-faint">Est. 1974 · Sheffield</span>
      </header>

      <div className="grid gap-10 md:grid-cols-[1.1fr_1fr] md:gap-14">
        <section className="flex flex-col gap-6">
          <Notebook />

          <div className="flex flex-col gap-2">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
              Field Notebook
            </h1>
            <p className="max-w-sm text-[14.5px] leading-relaxed text-ink-soft">
              Ninety-six pages of dot grid on heavy cream paper, sewn so it opens flat and stays
              that way. Made a mile from where we pack it.
            </p>
            <p className="mt-1 text-[20px] font-semibold tabular-nums">£18.00</p>
          </div>

          <button
            type="button"
            onClick={buy}
            disabled={!ready}
            className="w-fit rounded-xl bg-ink px-7 py-3 text-[15px] font-medium text-paper transition-opacity duration-150 hover:opacity-90 disabled:opacity-40"
          >
            {ready ? "Buy now" : "Loading checkout…"}
          </button>
        </section>

        <aside className="flex flex-col gap-8">
          <TestCards />
          <CallbackLog entries={entries} />
        </aside>
      </div>
    </main>
  );
}

/** A drawn product image, so the demo carries no binary assets. */
function Notebook() {
  return (
    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-line bg-card">
      <svg width="150" height="190" viewBox="0 0 150 190" role="img" aria-label="A dot grid notebook">
        <rect x="14" y="10" width="122" height="168" rx="7" fill="#2c2721" />
        <rect x="22" y="16" width="120" height="164" rx="6" fill="#efe9dd" />
        <rect x="22" y="16" width="10" height="164" fill="#d9d1c2" />
        <g fill="#b9ae9a">
          {Array.from({ length: 9 }).map((_, row) =>
            Array.from({ length: 6 }).map((__, col) => (
              <circle key={`${row}-${col}`} cx={48 + col * 16} cy={40 + row * 16} r="1.4" />
            )),
          )}
        </g>
      </svg>
    </div>
  );
}
