"use client";

import { formatXlm } from "@/lib/stellar/amount";
import { useBalance } from "@/lib/stellar/useBalance";
import { useWallet } from "@/lib/wallet/WalletProvider";

import styles from "./Balance.module.css";

export function Balance() {
  const { address } = useWallet();
  const { balance, loading, error } = useBalance(address);

  if (!address) return null;

  if (loading && !balance) {
    return <p className={styles.status}>Reading the ledger…</p>;
  }

  if (error) {
    return (
      <p className={styles.status} role="alert">
        {error}
      </p>
    );
  }

  if (!balance) return null;

  if (!balance.funded) {
    return (
      <p className={styles.status}>
        This account holds nothing yet — it has never been funded.
      </p>
    );
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.figure}>
        <span className={`${styles.amount} mono`}>
          {formatXlm(balance.total)}
        </span>
        <span className={styles.unit}>XLM</span>
      </p>
      <p className={styles.breakdown}>
        <span className="mono">{formatXlm(balance.reserved)}</span> held in
        reserve by the network — <span className="mono">
          {formatXlm(balance.available)}
        </span>{" "}
        can pay fees.
      </p>
    </div>
  );
}
