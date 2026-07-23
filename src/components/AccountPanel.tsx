"use client";

import { useBalance } from "@/lib/stellar/useBalance";
import { useWallet } from "@/lib/wallet/WalletProvider";

import { Balance } from "./Balance";
import { FundAccount } from "./FundAccount";
import { Heartbeat } from "./Heartbeat";
import { PlanSetup } from "./PlanSetup";
import styles from "./AccountPanel.module.css";

/**
 * Owns the one reading of the account that everything else reacts to. Funding
 * and, later, the heartbeat both refresh through here, so the balance on
 * screen is never left disagreeing with what just happened.
 */
export function AccountPanel() {
  const { address } = useWallet();
  const { balance, loading, refreshing, error, refresh } = useBalance(address);

  if (!address) return null;

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
        <>
          <Balance balance={balance} refreshing={refreshing} />
          <Heartbeat address={address} onSent={refresh} />
          <PlanSetup owner={address} onSealed={refresh} />
        </>
      ) : (
        <FundAccount address={address} onFunded={refresh} />
      )}
    </div>
  );
}
