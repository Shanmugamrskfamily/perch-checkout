"use client";

/**
 * The banner shown when a payment does not go through.
 *
 * Two tones, because two situations. A decline is a decision that has been made
 * and the money definitely did not move. A lost connection is an unknown, and
 * the copy has to admit that while still telling the customer the one thing
 * they actually want to know, which is whether they have been charged.
 *
 * "Something went wrong" appears nowhere in this file.
 */

import type { ReactNode } from "react";

export type NoteTone = "critical" | "caution";

export function StatusNote({
  tone,
  title,
  children,
}: {
  tone: NoteTone;
  title: string;
  children: ReactNode;
}) {
  const palette =
    tone === "critical"
      ? "border-critical/25 bg-critical-tint text-critical"
      : "border-caution/25 bg-caution-tint text-caution";

  return (
    <div
      /* `alert` rather than `status`: this interrupts, because the customer is
         about to press Pay again and needs to know why the last one failed. */
      role="alert"
      className={`flex flex-col gap-1 rounded-[10px] border px-3.5 py-3 ${palette}`}
    >
      <p className="text-[13px] font-semibold leading-snug">{title}</p>
      <p className="text-[12.5px] leading-relaxed text-ink-soft">{children}</p>
    </div>
  );
}
