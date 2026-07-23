import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono, Newsreader } from "next/font/google";
import { TopBar } from "@/components/TopBar";
import { BalanceProvider } from "@/lib/stellar/BalanceProvider";
import { WalletProvider } from "@/lib/wallet/WalletProvider";

import "./globals.css";

/*
 * Fraunces for display: an old-style serif with enough weight to read as
 * engraved rather than typed. Newsreader for body, because a plan you sign for
 * the people after you should look like a document, not a dashboard. Mono is
 * reserved for what the chain wrote — addresses, hashes, the countdown.
 */
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin"],
  display: "swap",
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
            <TopBar />
            {children}
          </BalanceProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
