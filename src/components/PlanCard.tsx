"use client";

import { formatDuration, humanizeApprox } from "@/lib/stellar/duration";
import { shortenAddress } from "@/lib/stellar/network";
import { PlanMode, type Plan } from "@/lib/stellar/registry";
import { useNowSeconds } from "@/lib/useNow";

import styles from "./PlanCard.module.css";

/**
 * The plan as it stands on chain: who inherits, after how long a silence, and
 * how much of that silence has run.
 *
 * There is nothing to press here. Winding the clock lives in the account menu,
 * and calling the plan off belongs to the chest above — it is the thing holding
 * the plan shut, so it is the thing you break. This card only states the facts.
 */
export function PlanCard({ plan }: { plan: Plan }) {
  const now = useNowSeconds();

  const modeLabel = plan.mode === PlanMode.Sealed ? "Sealed" : "Standing";
  const sinceLastSeen = now - Number(plan.lastSeen);
  const remaining = Number(plan.lastSeen + plan.period) - now;

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
                in{" "}
                <span className={styles.strong}>
                  {humanizeApprox(remaining)}
                </span>
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
    </section>
  );
}
