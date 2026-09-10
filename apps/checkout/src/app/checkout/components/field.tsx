"use client";

/**
 * One labelled input.
 *
 * The accessibility wiring here is not garnish. A payment form is the worst
 * place to discover that an error message was never announced, so the error is
 * tied to the input with `aria-describedby`, marked `aria-invalid`, and given
 * `role="alert"` so a screen reader says it when it appears rather than only
 * when somebody happens to tab back.
 *
 * The `autoComplete` values are the real ones — `cc-number`, `cc-exp`,
 * `cc-csc`. Getting them right is the difference between a customer filling
 * this in with one tap from their browser's saved card and typing sixteen
 * digits on a phone.
 */

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export interface FieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "className"> {
  readonly label: string;
  readonly problem?: string | undefined;
  /** Rendered inside the field's right edge, e.g. a card brand mark. */
  readonly adornment?: ReactNode;
}

export function Field({ label, problem, adornment, ...input }: FieldProps) {
  const id = useId();
  const problemId = `${id}-problem`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-ink-soft">
        {label}
      </label>

      <div className="relative">
        <input
          {...input}
          id={id}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? problemId : undefined}
          className={[
            "w-full rounded-[10px] border bg-surface px-3 py-2.5 text-[15px] text-ink",
            "placeholder:text-ink-faint",
            "transition-[border-color,box-shadow] duration-150",
            "disabled:cursor-not-allowed disabled:bg-sunken disabled:text-ink-faint",
            adornment ? "pr-14" : "",
            problem
              ? "border-critical focus-visible:outline-critical"
              : "border-line hover:border-line-strong",
          ].join(" ")}
        />
        {adornment ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            {adornment}
          </span>
        ) : null}
      </div>

      {problem ? (
        <p id={problemId} role="alert" className="text-[12.5px] leading-snug text-critical">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
