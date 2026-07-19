"use client";

import { useState } from "react";

import { fundAccount } from "@/lib/stellar/friendbot";

import styles from "./FundAccount.module.css";

type Props = {
  address: string;
  onFunded: () => void;
};

export function FundAccount({ address, onFunded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFund() {
    setBusy(true);
    setError(null);

    const result = await fundAccount(address);
    if (result.ok) {
      onFunded();
    } else {
      setError(result.message);
    }

    setBusy(false);
  }

  return (
    <div className={styles.wrap}>
      <p className={styles.explain}>
        This address has never been funded, so the network does not yet know it
        as an account. Testnet gives out coins freely.
      </p>
      <button
        type="button"
        className={styles.button}
        onClick={handleFund}
        disabled={busy}
      >
        {busy ? "Asking the faucet…" : "Fund with test XLM"}
      </button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
