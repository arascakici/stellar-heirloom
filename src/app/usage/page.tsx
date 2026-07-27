import type { Metadata } from "next";

import { Feedback } from "@/components/Feedback";
import { UsageBoard } from "@/components/UsageBoard";

import styles from "../registry/page.module.css";

export const metadata: Metadata = {
  title: "Usage — heirloom",
  description:
    "How much heirloom has been used, counted from the two contracts' own events and from nothing else. No tracker, no dashboard, and every figure traceable to a transaction on the Stellar testnet.",
};

export default function UsagePage() {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <header className={styles.head}>
          <h1 className={styles.title}>Usage</h1>
          <p className={styles.lede}>
            Counted from what the two contracts have witnessed, and from nothing
            else. There is no tracker on this site and no analytics account
            behind it — measuring who visits by handing their wallet address to
            somebody else would contradict the only thing heirloom actually
            claims. So the figures come from the same public events the registry
            reads out one by one, and every one of them can be looked up on
            chain. A number you cannot go and check is worth nothing, whoever is
            showing it to you.
          </p>
        </header>

        <UsageBoard />
        <Feedback />
      </div>
    </main>
  );
}
