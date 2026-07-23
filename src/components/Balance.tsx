"use client";

import { formatXlm } from "@/lib/stellar/amount";
import type { AccountBalance } from "@/lib/stellar/balance";

import styles from "./Balance.module.css";

/**
 * Presentational: the panel above owns the reading, so that funding and the
 * heartbeat can refresh the same figure rather than each keeping their own.
 */
export function Balance({
  balance,
  refreshing,
  compact = false,
}: {
  balance: Extract<AccountBalance, { funded: true }>;
  refreshing: boolean;
  /** Smaller, for the account menu rather than a page centrepiece. */
  compact?: boolean;
}) {
  return (
    <div
      className={`${styles.wrap} ${compact ? styles.compact : ""}`}
      data-refreshing={refreshing || undefined}
    >
      <p className={styles.figure}>
        <span className={`${styles.amount} mono`}>
          {formatXlm(balance.total)}
        </span>
        <span className={styles.unit}>XLM</span>
      </p>
      <p className={styles.breakdown}>
        <span className="mono">{formatXlm(balance.available)}</span> can pay
        fees ·{" "}
        <span className="mono">{formatXlm(balance.reserved)}</span> in reserve.
      </p>
    </div>
  );
}
