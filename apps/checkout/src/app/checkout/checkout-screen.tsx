"use client";

/**
 * Phase 1 shell.
 *
 * This exists to prove the handshake end to end: origin checks, `ready`,
 * `init`, resize reporting, and each terminal callback reaching the merchant's
 * page. The payment flow replaces the `linked` branch in the next phase; the
 * refusal and unframed branches are already the real ones, because those are
 * the states a shell would otherwise never get around to building.
 */

import { useHostChannel } from "@/lib/host-channel";

export function CheckoutScreen() {
  const { link, reportSuccess, reportClosed } = useHostChannel();

  if (link.status === "unframed") {
    return (
      <Notice
        title="Nothing to pay for here"
        body="Perch checkouts open inside the store you were shopping on. Head back there and try again."
      />
    );
  }

  if (link.status === "refused") {
    return <Notice title="Checkout blocked" body={link.detail} />;
  }

  if (link.status === "waiting") {
    return (
      <Notice title="Connecting" body="Waiting for the store to hand over your order." />
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-8">
      <p className="text-sm text-neutral-500">Handshake complete</p>
      <p className="font-mono text-sm text-neutral-900">{link.productId}</p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm text-white"
          onClick={() => {
            reportSuccess("cs_placeholder");
            reportClosed("completed");
          }}
        >
          Simulate success
        </button>
        <button
          type="button"
          className="rounded-lg border border-neutral-200 px-4 py-2 text-sm"
          onClick={() => reportClosed("dismissed")}
        >
          Simulate dismiss
        </button>
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col gap-2 p-8 text-center">
      <h1 className="text-base font-semibold text-neutral-900">{title}</h1>
      <p className="text-sm leading-relaxed text-neutral-500">{body}</p>
    </div>
  );
}
