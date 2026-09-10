/**
 * The promises the SDK makes to a merchant.
 *
 * These are the contract, so they are tested as the contract: through the
 * public surface, with nothing reached into. The iframe never loads under jsdom
 * and does not need to — everything here is about what happens on the host page
 * before and around the frame.
 */

import type Perch from "./index";

type Sdk = typeof Perch;

/**
 * Loads the SDK fresh, with a script tag in place so it can work out where it
 * came from. Fresh each time because the module holds the one-checkout-at-a-time
 * state, and a test that inherited it from the previous test would be lying.
 */
async function loadSdk(): Promise<Sdk> {
  document.head.innerHTML = "";
  document.body.innerHTML = "";

  const tag = document.createElement("script");
  tag.src = "https://checkout.perch.test/perch.js";
  document.head.appendChild(tag);

  let sdk!: Sdk;
  await jest.isolateModulesAsync(async () => {
    sdk = (await import("./index")).default;
  });
  return sdk;
}

/** Lets queued callbacks run. Nothing fires synchronously from open(). */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.spyOn(console, "warn").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("the shape of the API", () => {
  it("is one function", async () => {
    const sdk = await loadSdk();
    expect(Object.keys(sdk)).toEqual(["open"]);
  });

  it("returns a handle that is safe to use whatever happened", async () => {
    const sdk = await loadSdk();
    const handle = sdk.open({ productId: "not-a-product-id" });

    /* Even a call that could not start anything gives back something with the
       same shape, so a merchant never has to null-check us. */
    expect(typeof handle.close).toBe("function");
    expect(() => handle.close()).not.toThrow();
    expect(() => handle.close()).not.toThrow();
    await flush();
  });
});

describe("callbacks", () => {
  it("never fires anything synchronously from open()", async () => {
    const sdk = await loadSdk();
    const seen: string[] = [];

    /* Otherwise `const h = Perch.open({ onError: () => h.close() })` would run
       a callback referencing a variable that has not been assigned yet. */
    const handle = sdk.open({
      productId: "nope",
      onError: () => seen.push("error"),
      onClose: () => seen.push("close"),
    });

    expect(seen).toEqual([]);
    expect(handle).toBeDefined();

    await flush();
    expect(seen).toEqual(["error", "close"]);
  });

  it("reports a malformed product id rather than opening anything", async () => {
    const sdk = await loadSdk();
    const errors: { code: string; message: string }[] = [];

    sdk.open({ productId: "prod id with spaces", onError: (e) => errors.push(e) });
    await flush();

    expect(errors).toHaveLength(1);
    expect(errors[0]?.code).toBe("invalid_options");
    /* The message names what was actually passed, because the merchant reading
       it at four in the morning needs to know which call was wrong. */
    expect(errors[0]?.message).toContain("prod id with spaces");
    expect(document.querySelector("[data-perch]")).toBeNull();
  });

  it("closes with reason error when it could not start", async () => {
    const sdk = await loadSdk();
    const reasons: string[] = [];

    sdk.open({ productId: "bad", onClose: ({ reason }) => reasons.push(reason) });
    await flush();

    /* onClose always fires, whatever went wrong, so a merchant can re-enable
       their Buy button in one place. */
    expect(reasons).toEqual(["error"]);
  });

  it("survives a merchant callback that throws", async () => {
    const sdk = await loadSdk();
    const reasons: string[] = [];

    sdk.open({
      productId: "bad",
      onError: () => {
        throw new Error("merchant bug");
      },
      onClose: ({ reason }) => reasons.push(reason),
    });
    await flush();

    /* Their bug must not stop our teardown, or the customer is left with an
       overlay nobody can remove. */
    expect(reasons).toEqual(["error"]);
  });
});

describe("pressing Buy twice", () => {
  it("does not open a second checkout", async () => {
    const sdk = await loadSdk();

    const first = sdk.open({ productId: "prod_notebook" });
    const second = sdk.open({ productId: "prod_notebook" });

    /* One overlay, and the second call hands back the checkout already open
       rather than a second one to pay for. Making this the SDK's behaviour
       means every integration gets it right, including the ones that forget to
       disable their button. */
    expect(document.querySelectorAll("[data-perch]")).toHaveLength(1);
    expect(second.isOpen).toBe(true);
    expect(first.isOpen).toBe(true);

    first.close();
  });

  it("says so on the console rather than failing silently", async () => {
    const sdk = await loadSdk();
    const warn = jest.spyOn(console, "warn");

    const handle = sdk.open({ productId: "prod_notebook" });
    sdk.open({ productId: "prod_notebook" });

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("already open"));
    handle.close();
  });
});

describe("theming", () => {
  it("names the options it ignored", async () => {
    const sdk = await loadSdk();
    const warn = jest.spyOn(console, "warn");

    const handle = sdk.open({
      productId: "prod_notebook",
      // @ts-expect-error deliberately passing something outside the allowlist
      theme: { accent: "#0e5b62", backgroundImage: "url(evil)", fontFamily: "Comic Sans" },
    });

    /* Silence would leave a merchant wondering why their theme did nothing. */
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("backgroundImage"));
    handle.close();
  });
});

describe("the global", () => {
  it("installs under both names and cannot be replaced", async () => {
    await loadSdk();

    expect(typeof window.Perch?.open).toBe("function");
    /* The brief sketches the API as DodoCheckout.open, so that name keeps
       working rather than being argued with. */
    expect(window.DodoCheckout).toBe(window.Perch);

    const before = window.Perch;
    try {
      // @ts-expect-error deliberately attempting to overwrite the global
      window.Perch = { open: () => ({ close() {}, isOpen: false }) };
    } catch {
      /* Strict mode throws instead of silently failing; either is a pass. */
    }

    /* A later script must not be able to swap us for a look-alike that
       collects card numbers on the host page. */
    expect(window.Perch).toBe(before);
  });
});
