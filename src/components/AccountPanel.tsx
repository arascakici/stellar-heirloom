"use client";

import { useAccountBalance } from "@/lib/stellar/BalanceProvider";
import { useAccountPlans } from "@/lib/stellar/PlanProvider";
import { PlanStatus } from "@/lib/stellar/registry";
import { useWallet } from "@/lib/wallet/WalletProvider";

import { FundAccount } from "./FundAccount";
import { HeirPlans } from "./HeirPlans";
import { PlanCard } from "./PlanCard";
import { PlanSetup } from "./PlanSetup";
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
    plan,
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

  const activePlan = plan && plan.status === PlanStatus.Active ? plan : null;

  // A heartbeat or cancellation changes the plan and moves the fee, so both
  // readings refresh together.
  const refreshAll = () => {
    void refreshPlans();
    void refreshBalance();
  };

  return (
    <div className={styles.panel}>
      {activePlan ? (
        <PlanCard plan={activePlan} onChanged={refreshAll} />
      ) : (
        <PlanSetup owner={address} onSealed={refreshAll} />
      )}
      {heirPlans.length > 0 && <HeirPlans plans={heirPlans} />}
    </div>
  );
}
