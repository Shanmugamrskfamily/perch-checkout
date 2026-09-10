"use client";

/**
 * Phase 1 store front.
 *
 * Deliberately plain for now. What it proves is the integration: one script
 * tag, one call, and a log showing exactly which callbacks fired and when. The
 * real store, with product imagery and the test-mode panel, lands in phase 3.
 */

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import { PERCH_SCRIPT_URL, type PerchHandle } from "@/lib/perch";

interface LogEntry {
  readonly id: number;
  readonly at: string;
  readonly label: string;
  readonly detail: string;
}

export default function StorePage() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [scriptReady, setScriptReady] = useState(false);
  const handleRef = useRef<PerchHandle | null>(null);
  const nextId = useRef(0);

  const record = useCallback((label: string, detail: string) => {
    setLog((entries) => [
      {
        id: nextId.current++,
        at: new Date().toLocaleTimeString([], { hour12: false }),
        label,
        detail,
      },
      ...entries,
    ]);
  }, []);

  const buy = useCallback(() => {
    if (!window.Perch) {
      record("error", "perch.js has not loaded");
      return;
    }

    record("open", "Perch.open({ productId: 'prod_notebook' })");

    handleRef.current = window.Perch.open({
      productId: "prod_notebook",
      onSuccess: ({ sessionId }) => record("onSuccess", `sessionId: ${sessionId}`),
      onError: ({ code, message }) => record("onError", `${code} — ${message}`),
      onClose: ({ reason }) => record("onClose", `reason: ${reason}`),
    });
  }, [record]);

  return (
    <main className="mx-auto flex min-h-full w-full max-w-2xl flex-col gap-8 px-6 py-16">
      <Script
        src={PERCH_SCRIPT_URL}
        strategy="afterInteractive"
        onReady={() => setScriptReady(true)}
        onError={() => record("error", "perch.js failed to load")}
      />

      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">Demo store</h1>
        <p className="text-sm text-neutral-500">
          A pretend shop that embeds Perch through the public script tag.
        </p>
      </header>

      <button
        type="button"
        onClick={buy}
        disabled={!scriptReady}
        className="w-fit rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-40"
      >
        {scriptReady ? "Buy notebook" : "Loading checkout…"}
      </button>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Callbacks
        </h2>
        {log.length === 0 ? (
          <p className="text-sm text-neutral-400">Nothing yet.</p>
        ) : (
          <ol className="flex flex-col gap-1 font-mono text-xs">
            {log.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <span className="text-neutral-400">{entry.at}</span>
                <span className="font-medium">{entry.label}</span>
                <span className="text-neutral-500">{entry.detail}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
