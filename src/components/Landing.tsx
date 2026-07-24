"use client";

import { useWallet } from "@/lib/wallet/WalletProvider";

import { Chest } from "./Chest";
import styles from "./Landing.module.css";

/**
 * The promise, made once. It belongs to the moment before a wallet is
 * connected — after that the person is here to do something, and a page that
 * keeps restating its pitch above the work is a page they have to scroll past.
 */
export function Landing() {
  const { address } = useWallet();
  if (address) return null;

  return (
    <div className={styles.landing}>
      <div className={styles.emblem}>
        <Chest phase="shut" />
      </div>
      <h1 className={styles.wordmark}>heirloom</h1>
      <div className={styles.rule} aria-hidden />
      <p className={styles.promise}>
        Sign one transaction today. If your account goes quiet for a period you
        choose, someone you named takes it over.
      </p>
      <p className={styles.footnote}>
        Your assets never leave your account. Nothing is held in escrow, and no
        one — including us — can move them early. The network itself does the
        refusing.
      </p>
    </div>
  );
}
