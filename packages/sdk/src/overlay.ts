/**
 * The chrome around the checkout: backdrop, frame, loading state, motion, and
 * the small pile of host-page housekeeping that a modal on someone else's site
 * has to get right.
 *
 * Everything here lives in a **shadow root**. A merchant's stylesheet will
 * contain rules like `div { box-sizing: content-box }` or a `z-index` war with
 * their own header, and an embed rendered into the normal DOM inherits all of
 * it. A shadow root means their CSS cannot reach us and ours cannot leak into
 * their page.
 *
 * Deliberately `open`, not `closed`. Closed mode looks like the more secure
 * choice and is mostly theatre here: there is nothing secret in this tree —
 * the card fields live in the cross-origin iframe, where the browser protects
 * them whatever we do — and a host determined to interfere can remove the whole
 * element either way. What closed mode reliably does is stop a merchant, and
 * us, from inspecting the overlay when something looks wrong. That is a bad
 * trade for an embed that has to be debugged on other people's websites.
 *
 * ---
 *
 * One rule governs all the motion below, learned the hard way: **the resting
 * state is never the hidden one.**
 *
 * The obvious way to write an entrance is `opacity: 0` in CSS plus a class that
 * transitions it to 1. It is also a trap. If that transition never runs — a
 * throttled background tab, a compositor that never starts the animation clock,
 * a browser that decided not to paint — the element's resting state is
 * *invisible*, and the customer is looking at a payment form that never
 * appeared. So each element here rests in its final, visible state, and the
 * entrance animates *from* the hidden one. A failed animation then degrades to
 * no animation, which is a cosmetic problem rather than a broken checkout.
 *
 * The same reasoning applies to the loading cover: it is removed from the DOM
 * on a timer, and the fade is only decoration over the top of that.
 */

import type { FocusEdge } from "@perch/protocol";

/** How long to wait for the checkout to say `ready` before giving up on it. */
export const READY_TIMEOUT_MS = 12_000;

const ENTER_MS = 200;
const EXIT_MS = 160;
const REVEAL_MS = 140;

export interface OverlayOptions {
  /** Fully-qualified URL of the checkout document. */
  readonly src: string;
  /** Called when the customer dismisses the overlay from the host side. */
  readonly onDismiss: () => void;
  /**
   * Called when keyboard focus has tabbed out of the checkout.
   *
   * `first` means they went forward off the end, `last` that they went
   * backwards off the start. The session turns this into a message asking the
   * frame to take focus back.
   */
  readonly onFocusEscape: (edge: FocusEdge) => void;
}

export interface Overlay {
  readonly iframe: HTMLIFrameElement;
  /** Swap the loading cover for the frame. Called once, on `ready`. */
  reveal(): void;
  /** Match the iframe's height to the checkout's content. */
  setHeight(px: number): void;
  /** Replace the frame with a terminal message the customer can dismiss. */
  showFatal(message: string): void;
  /** Tear everything down and restore the host page. */
  destroy(): void;
}

const STYLES = `
:host { all: initial; }

.root {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow-y: auto;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  /* Stops iOS painting a grey rectangle over whatever the customer taps. */
  -webkit-tap-highlight-color: transparent;
}

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(12, 15, 18, 0.58);
  /* Safari only dropped the prefix in version 18, so an unprefixed declaration
     alone silently does nothing in Safari 16 and 17 — a large slice of iPhones
     in use. The colour underneath carries the separation on its own, so the
     blur is decoration, but it is one line to have it everywhere. */
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);
}

.panel {
  position: relative;
  width: 100%;
  max-width: 420px;
  margin: auto;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(12, 15, 18, 0.08), 0 24px 48px -12px rgba(12, 15, 18, 0.35);
  overflow: hidden;
}

iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: transparent;
}

/* Sits over the frame until the checkout has painted, so the customer never
   watches a white rectangle resolve into a form. Removed, not faded out — see
   the note at the top of this file. */
.loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
}

/* Focusable, and invisible. Not display:none or visibility:hidden, because
   neither of those can receive focus, which is the entire job. */
.sentinel {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.spinner {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(12, 15, 18, 0.12);
  border-top-color: rgba(12, 15, 18, 0.45);
  animation: spin 640ms linear infinite;
}

@keyframes spin { to { transform: rotate(360deg); } }

.fatal {
  padding: 32px 28px;
  text-align: center;
  color: #0c0f12;
}
.fatal h2 {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.fatal p {
  margin: 0 0 20px;
  font-size: 13.5px;
  line-height: 1.5;
  color: rgba(12, 15, 18, 0.62);
}
.fatal button {
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  padding: 9px 18px;
  border-radius: 9px;
  border: 1px solid rgba(12, 15, 18, 0.14);
  background: #ffffff;
  color: #0c0f12;
  cursor: pointer;
}
.fatal button:hover { background: rgba(12, 15, 18, 0.04); }
.fatal button:focus-visible {
  outline: 2px solid #0c0f12;
  outline-offset: 2px;
}

/**
 * Phones get a sheet, not a card.
 *
 * A centred card with margin all round is a desktop shape. On a narrow screen
 * it wastes the width, and its controls end up in the middle of the display,
 * far from the thumb actually holding the phone. Anchoring to the bottom edge
 * puts the Pay button where the hand already is, and it is the shape people
 * have learned to expect from every payment sheet their operating system shows
 * them.
 *
 * The breakpoint is on the viewport, not the device: a small window on a
 * desktop has the same problem and gets the same answer.
 */
@media (max-width: 540px) {
  .root {
    padding: 0;
    align-items: flex-end;
  }

  .panel {
    max-width: none;
    margin: 0;
    /* Square at the bottom, because that edge is against the screen. */
    border-radius: 16px 16px 0 0;
    /* Never taller than the screen. A longer form scrolls inside the overlay
       root rather than pushing its own buttons out of reach. */
    max-height: 94dvh;
  }
}
`;

/** True when the customer has asked their system for less movement. */
function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * Runs a decorative animation, and does not care whether it works.
 *
 * `element.animate` is used rather than a CSS class toggle because it leaves no
 * residue: when it finishes, or if it never starts, the element is left in its
 * ordinary CSS state, which is the visible one.
 */
function decorate(element: Element, frames: Keyframe[], duration: number): void {
  if (prefersReducedMotion()) return;
  try {
    element.animate(frames, { duration, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
  } catch {
    /* Web Animations unavailable. The element is already in its final state. */
  }
}

export function createOverlay(options: OverlayOptions): Overlay {
  const doc = document;

  /* Remember who had focus so it can be handed back on close. Skipping this is
     the classic embed bug: the customer dismisses the checkout and their focus
     is on <body>, so the next Tab starts from the top of the page. */
  const previouslyFocused = doc.activeElement as HTMLElement | null;

  const mount = doc.createElement("div");
  mount.setAttribute("data-perch", "");
  const shadow = mount.attachShadow({ mode: "open" });

  const style = doc.createElement("style");
  style.textContent = STYLES;

  const root = doc.createElement("div");
  root.className = "root";

  const backdrop = doc.createElement("div");
  backdrop.className = "backdrop";

  const panel = doc.createElement("div");
  panel.className = "panel";
  panel.style.height = "560px";
  /* Dialog semantics on the panel, not the iframe. The iframe carries a title
     for the frame itself; this is what tells assistive technology that the page
     behind is out of scope while the checkout is open. */
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Secure checkout");

  const iframe = doc.createElement("iframe");
  iframe.src = options.src;
  iframe.title = "Secure checkout";
  /* The iframe is cross-origin, so `allow-same-origin` here means "keep your
     own origin", not "share the merchant's". Without it the checkout loses
     crypto and storage; with it, the merchant still cannot read inside, because
     the two documents remain different origins. */
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms");
  iframe.setAttribute("referrerpolicy", "strict-origin");
  iframe.setAttribute("allow", "payment");

  let loading: HTMLDivElement | null = doc.createElement("div");
  loading.className = "loading";
  const spinner = doc.createElement("div");
  spinner.className = "spinner";
  spinner.setAttribute("role", "status");
  spinner.setAttribute("aria-label", "Loading checkout");
  loading.appendChild(spinner);

  /**
   * The two halves of the focus trap.
   *
   * A modal normally traps focus by watching it inside a single document. This
   * modal is a different document, so the host cannot see focus move inside the
   * frame and the frame cannot see it leave. What the host *can* see is focus
   * arriving on a sentinel placed either side of the iframe, which only happens
   * when the customer has tabbed off one end of the checkout. That is the
   * signal, and the frame is then asked to take focus back at the other end.
   *
   * Without this, Tab from the last field lands on the merchant's page behind
   * the overlay, which is the classic broken-modal bug.
   */
  const sentinelBefore = doc.createElement("div");
  sentinelBefore.className = "sentinel";
  sentinelBefore.tabIndex = 0;
  sentinelBefore.setAttribute("aria-hidden", "true");

  const sentinelAfter = sentinelBefore.cloneNode() as HTMLDivElement;

  /* Tabbing backwards past the start should wrap to the end, and vice versa. */
  sentinelBefore.addEventListener("focus", () => options.onFocusEscape("last"));
  sentinelAfter.addEventListener("focus", () => options.onFocusEscape("first"));

  panel.append(sentinelBefore, iframe, loading, sentinelAfter);
  root.append(backdrop, panel);
  shadow.append(style, root);

  // -- host page housekeeping ------------------------------------------------

  const body = doc.body;
  const previousOverflow = body.style.overflow;
  const previousPaddingRight = body.style.paddingRight;

  /* Locking scroll without compensating for the scrollbar makes the whole page
     jump sideways the instant the checkout opens. */
  const scrollbarWidth = window.innerWidth - doc.documentElement.clientWidth;
  body.style.overflow = "hidden";
  if (scrollbarWidth > 0) {
    const current = parseFloat(window.getComputedStyle(body).paddingRight) || 0;
    body.style.paddingRight = `${current + scrollbarWidth}px`;
  }

  let dismissed = false;
  const dismissOnce = () => {
    if (dismissed) return;
    dismissed = true;
    options.onDismiss();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    dismissOnce();
  };

  backdrop.addEventListener("click", dismissOnce);
  /* Capture phase, so a merchant page that swallows Escape for its own modal
     cannot trap the customer inside our checkout. */
  doc.addEventListener("keydown", onKeyDown, true);

  body.appendChild(mount);

  /**
   * Everything else on the page is switched off while the checkout is open.
   *
   * `inert` does in one attribute what a pile of `aria-hidden` and click
   * blocking does badly: the content behind stops being focusable, stops
   * receiving clicks, and disappears from the accessibility tree, so a screen
   * reader cannot wander into the merchant's page while a card is being typed.
   *
   * It complements the sentinels rather than replacing them. `inert` stops
   * focus landing behind the overlay; the sentinels are what send it back into
   * the frame instead of out to the browser's own chrome.
   *
   * Only elements we actually changed are recorded, so a merchant who had their
   * own inert content still has it when the checkout closes.
   */
  const inerted: Element[] = [];
  for (const sibling of Array.from(body.children)) {
    if (sibling === mount || sibling.hasAttribute("inert")) continue;
    sibling.setAttribute("inert", "");
    inerted.push(sibling);
  }

  decorate(backdrop, [{ opacity: 0 }, { opacity: 1 }], ENTER_MS);
  decorate(
    panel,
    [
      { opacity: 0, transform: "translateY(10px) scale(0.985)" },
      { opacity: 1, transform: "none" },
    ],
    ENTER_MS,
  );

  let destroyed = false;
  let revealed = false;

  return {
    iframe,

    reveal() {
      if (revealed || !loading) return;
      revealed = true;

      const cover = loading;
      loading = null;

      /* The cover comes out on a timer. The fade is layered over the top and is
         allowed to fail; the removal is not. */
      decorate(cover, [{ opacity: 1 }, { opacity: 0 }], REVEAL_MS);
      window.setTimeout(() => cover.remove(), prefersReducedMotion() ? 0 : REVEAL_MS);

      /* Move focus into the checkout. Keeping it there is the sentinels' job:
         focus is perfectly capable of tabbing out of a cross-origin frame and
         landing on the page behind, and nothing about the origin boundary
         prevents it. */
      iframe.focus();
    },

    setHeight(px: number) {
      panel.style.height = `${px}px`;
    },

    showFatal(message: string) {
      iframe.remove();
      loading?.remove();
      loading = null;
      panel.style.height = "auto";

      const box = doc.createElement("div");
      box.className = "fatal";
      box.setAttribute("role", "alert");

      const heading = doc.createElement("h2");
      heading.textContent = "Checkout could not open";

      const detail = doc.createElement("p");
      /* textContent, never innerHTML. This string originates outside the SDK,
         and building DOM from a string is how an embed becomes an XSS vector
         on every site that installed it. */
      detail.textContent = message;

      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = "Close";
      button.addEventListener("click", dismissOnce);

      box.append(heading, detail, button);
      panel.appendChild(box);
      button.focus();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;

      backdrop.removeEventListener("click", dismissOnce);
      doc.removeEventListener("keydown", onKeyDown, true);

      for (const sibling of inerted) sibling.removeAttribute("inert");

      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPaddingRight;

      decorate(backdrop, [{ opacity: 1 }, { opacity: 0 }], EXIT_MS);
      decorate(
        panel,
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(6px) scale(0.99)" },
        ],
        EXIT_MS,
      );

      /* Same principle on the way out: the timer removes the element whether or
         not the exit animation ran, so a frozen animation cannot leave a dead
         overlay covering the merchant's page. */
      window.setTimeout(() => mount.remove(), prefersReducedMotion() ? 0 : EXIT_MS);

      /* Hand focus back where it came from, but only if that element is still
         in the document — a merchant page may well have re-rendered underneath
         us while the checkout was open. */
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      }
    },
  };
}
