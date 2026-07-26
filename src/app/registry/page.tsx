import type { Metadata } from "next";

import { RegistryFeed } from "@/components/RegistryFeed";
import { RegistryIdentity } from "@/components/RegistryIdentity";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "The registry — heirloom",
  description:
    "The record itself: every plan sealed, every clock wound, every package left and every one collected, read back off the Stellar testnet as it happens.",
};

export default function RegistryPage() {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <header className={styles.head}>
          <h1 className={styles.title}>The registry</h1>
          <p className={styles.lede}>
            Two contracts, and neither of them a bank. One writes down who named
            whom and how long a silence must pass; the other holds the signed
            transaction that hands the account over, in the open, where the chain
            refuses it until the wait is done. Neither holds a balance, moves an
            asset, or can take an account over on anyone&rsquo;s behalf. What
            follows is simply what they have witnessed.
          </p>
        </header>

        <RegistryIdentity />
        <RegistryFeed />
      </div>
    </main>
  );
}
