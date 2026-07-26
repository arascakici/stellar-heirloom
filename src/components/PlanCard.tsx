"use client";

import { useEffect, useState } from "react";

import { formatDuration, humanizeApprox } from "@/lib/stellar/duration";
import { Delivery } from "@/lib/stellar/envelope";
import { shortenAddress } from "@/lib/stellar/network";
import { PlanMode, type Plan } from "@/lib/stellar/registry";
import { getEnvelope, type SealedEnvelope } from "@/lib/stellar/vault";
import { useNowSeconds } from "@/lib/useNow";

import styles from "./PlanCard.module.css";

const DELIVERY_LABEL: Record<Delivery, string> = {
  [Delivery.Joint]: "Your heir joins you",
  [Delivery.Handover]: "Your heir takes over",
  [Delivery.Merge]: "Merged into their wallet",
};

/**
 * The plan as it stands on chain: who inherits, after how long a silence, and
 * how much of that silence has run.
 *
 * There is nothing to press here. Winding the clock lives in the account menu,
 * and calling the plan off belongs to the chest above — it is the thing holding
 * the plan shut, so it is the thing you break. This card only states the facts.
 *
 * The package is one of those facts. A plan recorded without one looks entirely
 * healthy and can never fire, so the card asks the vault rather than letting
 * that pass in silence.
 */
export function PlanCard({ plan }: { plan: Plan }) {
  const now = useNowSeconds();
  /** `undefined` while the vault has not answered yet. */
  const [envelope, setEnvelope] = useState<SealedEnvelope | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    getEnvelope(plan.owner)
      .then((found) => {
        if (!cancelled) setEnvelope(found);
      })
      .catch(() => {
        if (!cancelled) setEnvelope(null);
      });
    return () => {
      cancelled = true;
    };
  }, [plan.owner]);

  const modeLabel = plan.mode === PlanMode.Sealed ? "Sealed" : "Standing";
  const sinceLastSeen = now - Number(plan.lastSeen);
  const remaining = Number(plan.lastSeen + plan.period) - now;
  const collected = envelope?.claimedAt != null;

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
          <dt className={styles.key}>Package</dt>
          <dd className={styles.value}>
            {envelope === undefined ? (
              <span className={styles.pending}>reading the vault…</span>
            ) : envelope === null ? (
              <span className={styles.due}>none sealed</span>
            ) : (
              DELIVERY_LABEL[envelope.delivery]
            )}
          </dd>
        </div>
        <div className={styles.row}>
          <dt className={styles.key}>Takeover</dt>
          <dd className={styles.value}>
            {collected ? (
              <span className={styles.due}>already taken</span>
            ) : remaining > 0 ? (
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

      {envelope === null ? (
        // The one state worth interrupting for: this plan is on the record and
        // can never fire.
        <p className={styles.warn}>
          No signed takeover is waiting in the vault, so nothing would happen
          even after the silence. Break the seal and set the plan again.
        </p>
      ) : collected ? (
        <p className={styles.note}>
          Your heir has already collected this. Break the seal to close the plan,
          or set a new one.
        </p>
      ) : (
        <p className={styles.note}>
          Wind the clock from the account menu, top right, to reset the silence.
        </p>
      )}
    </section>
  );
}
