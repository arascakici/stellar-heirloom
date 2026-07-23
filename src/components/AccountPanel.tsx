"use client";

import { useAccountBalance } from "@/lib/stellar/BalanceProvider";
import { useWallet } from "@/lib/wallet/WalletProvider";

import { FundAccount } from "./FundAccount";
import { PlanSetup } from "./PlanSetup";
import styles from "./AccountPanel.module.css";

/**
 * The centre of the page is about the plan. The account itself — balance,
 * heartbeat, disconnect — lives in the menu up top; here we only get in the way
 * of funding an empty account, then naming an heir.
 */
export function AccountPanel() {
  const { address } = useWallet();
  const { balance, loading, refreshing, error, refresh } = useAccountBalance();

  if (!address) {
    return <p className={styles.prompt}>Connect your wallet above to begin.</p>;
  }

  if (loading) {
    return <p className={styles.status}>Reading the ledger…</p>;
  }

  if (error) {
    return (
      <div className={styles.errorBox} role="alert">
        <p className={styles.status}>{error}</p>
        <button
          type="button"
          className={styles.retry}
          onClick={refresh}
          disabled={refreshing}
        >
          {refreshing ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (!balance) return null;

  return (
    <div className={styles.panel}>
      {balance.funded ? (
        <PlanSetup owner={address} onSealed={refresh} />
      ) : (
        <FundAccount address={address} onFunded={refresh} />
      )}
    </div>
  );
}
