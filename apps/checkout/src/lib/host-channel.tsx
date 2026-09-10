"use client";

/**
 * The checkout's half of the conversation with the merchant's page.
 *
 * Mirror image of the SDK: it validates the origin before it will speak, it
 * addresses every reply to one exact origin rather than `"*"`, and it drops
 * anything that does not parse. The difference is who is being protected. On
 * the SDK side the concern is a hostile frame; here the concern is a hostile
 * *page* — a phishing site that frames a genuine payment form so the padlock
 * and the card fields are real while everything around them is not.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  envelope,
  parseHostMessage,
  type CheckoutTheme,
  type CloseReason,
  type ErrorCode,
  type FrameMessage,
} from "@perch/protocol";
import { isAllowedHostOrigin } from "./config";

export type HostLink =
  /** Somebody opened the checkout URL directly. There is no merchant here. */
  | { readonly status: "unframed" }
  /** The embedding page is not allowed to frame this checkout. */
  | { readonly status: "refused"; readonly detail: string }
  /** Origin accepted, `ready` sent, waiting for the merchant's `init`. */
  | { readonly status: "waiting" }
  /** Handshake complete. */
  | {
      readonly status: "linked";
      readonly productId: string;
      readonly theme: CheckoutTheme | null;
    };

interface HostChannel {
  readonly link: HostLink;
  readonly reportSuccess: (sessionId: string) => void;
  readonly reportFailure: (code: ErrorCode, message: string) => void;
  readonly reportClosed: (reason: CloseReason) => void;
  /**
   * Registers what should happen when the merchant's page asks to close.
   *
   * The screen decides, not the transport: mid-payment, "close" should mean
   * "ask first", and only the screen knows whether a charge is in flight.
   */
  readonly setCloseRequestHandler: (handler: (() => void) | null) => void;
}

const Context = createContext<HostChannel | null>(null);

export function useHostChannel(): HostChannel {
  const channel = useContext(Context);
  if (!channel) throw new Error("useHostChannel must be used inside <HostChannelProvider>");
  return channel;
}

export interface HostChannelProviderProps {
  /** Per-session id from the query string; must match on every message. */
  readonly channel: string | undefined;
  /** The origin the embedding page claims to be. A claim, not evidence. */
  readonly claimedOrigin: string | undefined;
  readonly children: ReactNode;
}

export function HostChannelProvider({
  channel,
  claimedOrigin,
  children,
}: HostChannelProviderProps) {
  const [link, setLink] = useState<HostLink>({ status: "waiting" });

  /** The verified parent origin. Null until the checks below pass. */
  const parentOriginRef = useRef<string | null>(null);
  const closeHandlerRef = useRef<(() => void) | null>(null);
  const sentTerminalRef = useRef(false);

  const send = useCallback(
    (message: FrameMessage) => {
      const parentOrigin = parentOriginRef.current;
      if (!parentOrigin || !channel) return;
      window.parent.postMessage(envelope(channel, message), parentOrigin);
    },
    [channel],
  );

  /**
   * The single decision point for "the customer wants out".
   *
   * A screen registers a handler when closing needs care — mid-payment it
   * should confirm rather than vanish. With no handler registered, closing is
   * unremarkable and we simply tell the host.
   */
  const handleCloseRequest = useCallback(() => {
    const handler = closeHandlerRef.current;
    if (handler) handler();
    else send({ type: "closed", reason: "dismissed" });
  }, [send]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const gate = assessEmbedding({
      isFramed: window.parent !== window,
      channel,
      claimedOrigin,
      referrer: document.referrer,
    });

    /* eslint-disable-next-line react-hooks/set-state-in-effect --
       `window.parent` and `document.referrer` only exist in the browser, so
       this is a read of an external system after mount, which is the case the
       rule's own guidance allows. Computing it during render would emit
       different markup on the server than on the client and hydrate wrong. It
       runs once and settles. */
    setLink(gate);

    /* The channel test is already part of the gate; repeating it here is how
       the compiler learns that `channel` is a string from this point on. */
    if (gate.status !== "waiting" || !channel) return;

    parentOriginRef.current = safeOrigin(claimedOrigin);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== parentOriginRef.current) return;
      if (event.source !== window.parent) return;

      const message = parseHostMessage(event.data, channel);
      if (!message) return;

      if (message.type === "init") {
        setLink((current) =>
          /* `init` is answered once. A second one would let the merchant swap
             the product out from under a customer who has already read it. */
          current.status === "waiting"
            ? { status: "linked", productId: message.productId, theme: message.theme }
            : current,
        );
        return;
      }

      if (message.type === "requestClose") {
        handleCloseRequest();
      }
    };

    /**
     * Escape has to be handled *here*, inside the frame.
     *
     * Once the checkout is revealed, focus is inside this document, so keyboard
     * events go to this window and the embed script's own Escape listener never
     * sees them. Without this, a customer presses Escape and nothing happens —
     * which reads as a frozen payment form, on someone else's website.
     *
     * It routes through the same decision point as a close request from the
     * host, so there is exactly one place that decides what closing means.
     */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleCloseRequest();
    };

    window.addEventListener("message", onMessage);
    window.addEventListener("keydown", onKeyDown);
    send({ type: "ready" });

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [channel, claimedOrigin, handleCloseRequest, send]);

  /* Report the document's natural height so the host can size the iframe to the
     content. Measured rather than guessed, because the checkout's height
     changes as errors appear and receipts replace forms. */
  useEffect(() => {
    if (typeof window === "undefined" || !("ResizeObserver" in window)) return;
    const target = document.documentElement;
    const observer = new ResizeObserver(() => {
      send({ type: "resize", height: Math.ceil(target.getBoundingClientRect().height) });
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [send]);

  const value = useMemo<HostChannel>(
    () => ({
      link,
      reportSuccess(sessionId) {
        if (sentTerminalRef.current) return;
        sentTerminalRef.current = true;
        send({ type: "succeeded", sessionId });
      },
      reportFailure(code, message) {
        if (sentTerminalRef.current) return;
        sentTerminalRef.current = true;
        send({ type: "failed", code, message });
      },
      reportClosed(reason) {
        send({ type: "closed", reason });
      },
      setCloseRequestHandler(handler) {
        closeHandlerRef.current = handler;
      },
    }),
    [link, send],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export interface EmbeddingFacts {
  /** False when someone opened the checkout URL directly. */
  readonly isFramed: boolean;
  /** Per-session id from the query string. */
  readonly channel: string | undefined;
  /** The origin the SDK says is embedding us. */
  readonly claimedOrigin: string | undefined;
  /** `document.referrer`, which the framing page cannot forge. */
  readonly referrer: string | undefined;
}

/**
 * Decides whether this checkout is willing to talk to the page framing it.
 *
 * Pure, and separated from the component on purpose: this is the security
 * boundary, and a boundary that can only be exercised by mounting React and
 * faking a browser is a boundary nobody tests.
 *
 * Two independent signals must agree. `claimedOrigin` is what the SDK put in
 * the URL — convenient, and forgeable by anyone who can type a URL. `referrer`
 * is set by the browser and a framing page cannot invent it, though our
 * `strict-origin` policy trims it to the bare origin. Requiring agreement means
 * a forged query parameter on its own gets nowhere.
 *
 * The refusal message is identical in every case. Telling an attacker *which*
 * check they failed is free help.
 */
export function assessEmbedding(facts: EmbeddingFacts): HostLink {
  if (!facts.isFramed) return { status: "unframed" };

  const refused = {
    status: "refused",
    detail: "This site is not authorised to take payments through Perch.",
  } as const;

  if (!facts.channel) {
    return {
      status: "refused",
      detail: "This checkout was opened without a session. Return to the store and try again.",
    };
  }

  if (!isAllowedHostOrigin(facts.claimedOrigin)) return refused;

  const referrerOrigin = safeOrigin(facts.referrer);
  if (referrerOrigin && referrerOrigin !== safeOrigin(facts.claimedOrigin)) return refused;

  return { status: "waiting" };
}

function safeOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}
