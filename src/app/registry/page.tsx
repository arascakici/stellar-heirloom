import type { Metadata } from "next";

import { RegistryFeed } from "@/components/RegistryFeed";
import { RegistryIdentity } from "@/components/RegistryIdentity";

import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "The registry — heirloom",
  description:
    "The notary's own record: every plan sealed, every clock wound and every seal broken, read back off the Stellar testnet as it happens.",
};

export default function RegistryPage() {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <header className={styles.head}>
          <h1 className={styles.title}>The registry</h1>
          <p className={styles.lede}>
            A notary, not a vault. The contract writes down who named whom and
            how long a silence must pass — and nothing else. It never holds a
            balance, never moves an asset, and cannot take an account over on
            anyone&rsquo;s behalf. What follows is simply what it has witnessed.
          </p>
        </header>

        <RegistryIdentity />
        <RegistryFeed />
      </div>
    </main>
  );
}
