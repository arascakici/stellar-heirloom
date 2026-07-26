"use client";

import { useAccountBalance } from "@/lib/stellar/BalanceProvider";
import { useAccountPlans } from "@/lib/stellar/PlanProvider";
import { useWallet } from "@/lib/wallet/WalletProvider";

import { FundAccount } from "./FundAccount";
import { HeirPlans } from "./HeirPlans";
import { PlanVault } from "./PlanVault";
import styles from "./AccountPanel.module.css";

/**
 * The centre of the page is about the plan. The account itself — balance,
 * heartbeat, disconnect — lives in the menu up top. Here we fund an empty
 * account, then either show the plan it holds or the form to name an heir, and
 * beneath that, the plans that name this account as heir.
 */
export function AccountPanel() {
  const { address } = useWallet();
  const {
    balance,
    loading: balanceLoading,
    refreshing,
    error: balanceError,
    refresh: refreshBalance,
  } = useAccountBalance();
  const {
    heirPlans,
    loading: plansLoading,
    error: plansError,
    refresh: refreshPlans,
  } = useAccountPlans();

  if (!address) {
    return <p className={styles.prompt}>Connect your wallet above to begin.</p>;
  }

  if (balanceLoading) {
    return <p className={styles.status}>Reading the ledger…</p>;
  }

  if (balanceError) {
    return (
      <div className={styles.errorBox} role="alert">
        <p className={styles.status}>{balanceError}</p>
        <button
          type="button"
          className={styles.retry}
          onClick={refreshBalance}
          disabled={refreshing}
        >
          {refreshing ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }

  if (!balance) return null;

  if (!balance.funded) {
    return (
      <div className={styles.panel}>
        <FundAccount address={address} onFunded={refreshBalance} />
      </div>
    );
  }

  if (plansLoading) {
    return <p className={styles.status}>Reading the registry…</p>;
  }

  if (plansError) {
    return (
      <div className={styles.errorBox} role="alert">
        <p className={styles.status}>{plansError}</p>
        <button
          type="button"
          className={styles.retry}
          onClick={refreshPlans}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <PlanVault owner={address} />
      {heirPlans.length > 0 && (
        <HeirPlans heir={address} plans={heirPlans} onClaimed={refreshPlans} />
      )}
    </div>
  );
}
