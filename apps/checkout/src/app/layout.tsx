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

export const metadata: Metadata = {
  title: "Secure checkout",
  description: "Payment powered by Perch.",
  /* This document is only ever meant to be reached through a merchant's
     checkout. There is nothing here for a search engine to index, and an
     indexed payment page is a phishing template waiting to happen. */
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /* Nothing here stretches to the viewport. The host sizes the iframe from
       the height this document reports, so a `height: 100%` anywhere would make
       it report the frame's current height instead of the content's, and the
       panel could then only ever grow. */
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
