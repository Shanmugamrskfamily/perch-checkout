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
}

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(12, 15, 18, 0.58);
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

  panel.append(iframe, loading);
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

      /* Move focus into the checkout. From here the browser's own focus
         handling keeps the customer inside the frame, because focus cannot
         escape a cross-origin document by keyboard. */
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
