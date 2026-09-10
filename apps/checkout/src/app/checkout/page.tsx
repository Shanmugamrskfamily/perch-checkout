import { HostChannelProvider } from "@/lib/host-channel";
import { CheckoutScreen } from "./checkout-screen";

/**
 * The document that loads inside the merchant's iframe.
 *
 * Reading `searchParams` opts this route into dynamic rendering, which is what
 * we want: a checkout is per-session by definition and must never be served
 * from a cache. In Next 16 `searchParams` is a promise — the synchronous form
 * was removed.
 */
export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <HostChannelProvider
      channel={single(params.channel)}
      claimedOrigin={single(params.origin)}
    >
      <CheckoutScreen />
    </HostChannelProvider>
  );
}

/** A repeated query parameter is a malformed request, not a list to pick from. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
