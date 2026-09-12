import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { CHECKOUT_ORIGIN } from "@/lib/perch";

/** Where this store is served from, so social previews get absolute URLs. */
const SITE = process.env.NEXT_PUBLIC_SITE_ORIGIN
  ? new URL(process.env.NEXT_PUBLIC_SITE_ORIGIN)
  : new URL("https://perch-demo-store.vercel.app");

export const metadata: Metadata = {
  /* `metadataBase` is what turns the generated preview image into an absolute
     URL. Without it, a link pasted into a chat shows no image at all, which is
     the only place most people will ever form a first impression of this. */
  metadataBase: SITE,
  title: {
    default: "Kestrel Supply Co. — Field Notebook",
    template: "%s · Kestrel Supply Co.",
  },
  description:
    "A small Bengaluru shop that ships worldwide. It takes payment through Perch, an embeddable checkout that opens over the page without the card details ever touching it.",
  applicationName: "Kestrel Supply Co.",
  openGraph: {
    type: "website",
    siteName: "Kestrel Supply Co.",
    title: "Kestrel Supply Co. — Field Notebook",
    description:
      "A demo store for Perch, an embeddable checkout. Press Buy and the checkout opens over the page; the card details never touch this site.",
    url: SITE,
  },
  twitter: {
    card: "summary_large_image",
    title: "Kestrel Supply Co. — Field Notebook",
    description: "A demo store for Perch, an embeddable checkout.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/* The checkout lives on another origin and is fetched the moment
            someone presses Buy. Opening the connection now takes the DNS
            lookup and the TLS handshake out of the gap between the press and
            the form appearing, which is the gap where people wonder whether
            anything happened. Any merchant embedding Perch should do this. */}
        <link rel="preconnect" href={CHECKOUT_ORIGIN} />
        <link rel="dns-prefetch" href={CHECKOUT_ORIGIN} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
