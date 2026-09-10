"use client";

/**
 * Everything the checkout tells this page, as it happens.
 *
 * Worth reading for what is absent as much as what is present. No email
 * address, no card details, no decline reasons, no record of how many times the
 * customer tried. The merchant's page learns that a payment succeeded and that
 * the window closed, and that is the whole of it.
 */

export interface LogEntry {
  readonly id: number;
  readonly at: Date;
  readonly kind: "call" | "success" | "error" | "close";
  readonly label: string;
  readonly detail: string;
}

const TONE: Record<LogEntry["kind"], string> = {
  call: "text-ink-faint",
  success: "text-[#1d6b3f]",
  error: "text-[#a4291f]",
  close: "text-ink-soft",
};

export function CallbackLog({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        Callbacks
      </h2>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-3.5 py-4 text-[12.5px] leading-relaxed text-ink-faint">
          Nothing yet. Press Buy now and this fills in as the checkout reports back.
        </p>
      ) : (
        <ol
          /* Polite, not assertive: a reviewer using a screen reader hears the
             callbacks arrive without it interrupting whatever they are doing. */
          aria-live="polite"
          className="flex flex-col divide-y divide-line overflow-hidden rounded-xl border border-line bg-card"
        >
          {entries.map((entry) => (
            <li key={entry.id} className="flex flex-col gap-0.5 px-3.5 py-2.5">
              <span className="flex items-baseline gap-2">
                <span className={`font-mono text-[12.5px] font-medium ${TONE[entry.kind]}`}>
                  {entry.label}
                </span>
                <span className="ml-auto font-mono text-[11px] tabular-nums text-ink-faint">
                  {entry.at.toLocaleTimeString([], { hour12: false })}
                </span>
              </span>
              <span className="break-all font-mono text-[11.5px] leading-snug text-ink-soft">
                {entry.detail}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
