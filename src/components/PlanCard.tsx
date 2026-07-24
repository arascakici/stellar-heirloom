"use client";

import { useState } from "react";

import { formatDuration, humanizeApprox } from "@/lib/stellar/duration";
import { shortenAddress } from "@/lib/stellar/network";
import type { TxOutcome } from "@/lib/stellar/outcome";
import { cancelPlan, PlanMode, type Plan } from "@/lib/stellar/registry";
import { useNowSeconds } from "@/lib/useNow";

import { TransactionResult } from "./TransactionResult";
import styles from "./PlanCard.module.css";

type Props = {
  plan: Plan;
  /** Called after the plan is called off, so the view above can refresh. */
  onChanged: () => void;
};

/**
 * The plan as it stands on chain: who inherits, after how long a silence, and
 * how much of that silence has run. Winding the clock lives in the account menu
 * up top; the one commitment here is calling the whole thing off, which is why
 * it asks twice.
 */
export function PlanCard({ plan, onChanged }: Props) {
  const now = useNowSeconds();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<TxOutcome | null>(null);

  const modeLabel = plan.mode === PlanMode.Sealed ? "Sealed" : "Standing";
  const sinceLastSeen = now - Number(plan.lastSeen);
  const remaining = Number(plan.lastSeen + plan.period) - now;

  async function handleCancel() {
    setCancelling(true);
    setResult(null);

    const outcome = await cancelPlan(plan.owner);
    setResult(outcome);
    setCancelling(false);
    setConfirming(false);

    if (outcome.ok) onChanged();
  }

  return (
    <section className={styles.card}>
      <header className={styles.head}>
        <h2 className={styles.title}>Your plan</h2>
        <span className={styles.mode} data-mode={modeLabel.toLowerCase()}>
          {modeLabel}
        </span>
      </header>

      <dl className={styles.rows}>
        <div className={styles.row}>
          <dt className={styles.key}>Heir</dt>
          <dd className={`${styles.value} mono`} title={plan.heir}>
            {shortenAddress(plan.heir, 6)}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>Silence before takeover</dt>
          <dd className={styles.value}>{formatDuration(plan.period)}</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>Last sign of life</dt>
          <dd className={styles.value}>{humanizeApprox(sinceLastSeen)} ago</dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>Takeover</dt>
          <dd className={styles.value}>
            {remaining > 0 ? (
              <>
                in <span className={styles.strong}>{humanizeApprox(remaining)}</span>
              </>
            ) : (
              <span className={styles.due}>available now</span>
            )}
          </dd>
        </div>
      </dl>

      <p className={styles.note}>
        Wind the clock from the account menu, top right, to reset the silence.
      </p>

      {!confirming ? (
        <button
          type="button"
          className={styles.cancel}
          onClick={() => {
            setConfirming(true);
            setResult(null);
          }}
        >
          Call off the plan
        </button>
      ) : (
        <div className={styles.confirm} role="group">
          <p className={styles.confirmText}>
            End this plan? Your heir can no longer take over. You can seal a new
            one afterwards.
          </p>
          <div className={styles.confirmRow}>
            <button
              type="button"
              className={styles.confirmYes}
              onClick={handleCancel}
              disabled={cancelling}
            >
              {cancelling ? "Calling off…" : "Yes, call it off"}
            </button>
            <button
              type="button"
              className={styles.confirmNo}
              onClick={() => setConfirming(false)}
              disabled={cancelling}
            >
              Keep it
            </button>
          </div>
        </div>
      )}

      {result && (
        <TransactionResult outcome={result} successLabel="Plan called off." />
      )}
    </section>
  );
}
