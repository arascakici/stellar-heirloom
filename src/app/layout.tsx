import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono, Newsreader } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import { BalanceProvider } from "@/lib/stellar/BalanceProvider";
import { PlanProvider } from "@/lib/stellar/PlanProvider";
import { WalletProvider } from "@/lib/wallet/WalletProvider";

import "./globals.css";

/*
 * Fraunces for display: an old-style serif with enough weight to read as
 * engraved rather than typed. Newsreader for body, because a plan you sign for
 * the people after you should look like a document, not a dashboard. Mono is
 * reserved for what the chain wrote — addresses, hashes, the countdown.
 */
/*
 * `latin` only, deliberately. Nothing heirloom renders needs latin-ext: the
 * interface is English, and everything the chain writes is base32 or hex. The
 * subset was doubling the preloaded font payload for glyphs no page has ever
 * shown — measured at 200 KB across five files, which on a throttled phone is
 * what the largest paint was waiting for. If the interface is ever translated,
 * this is the line to change back.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
});

/*
 * Not preloaded. Mono is for addresses, hashes and the countdown — none of
 * which exist until a wallet is connected, and none of which appear on the
 * landing page at all. Preloading it made it compete for bandwidth with the
 * two faces that are on screen immediately.
 */
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "heirloom — a dead man's switch for Stellar",
  description:
    "Sign one transaction today. If your account goes quiet for a period you choose, a recipient you named takes it over. Your assets never leave your account.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${newsreader.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <WalletProvider>
          <BalanceProvider>
            <PlanProvider>
              <TopBar />
              {children}
            </PlanProvider>
          </BalanceProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
