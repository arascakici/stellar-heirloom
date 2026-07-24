"use client";

import { formatDuration } from "@/lib/stellar/duration";
import { shortenAddress } from "@/lib/stellar/network";
import { PlanMode, type Plan } from "@/lib/stellar/registry";

import styles from "./HeirPlans.module.css";

/**
 * The other side of the registry: accounts that have named you to inherit them.
 * This is read-only ground — nothing here is yours to claim until a silence
 * passes — so the list only bears witness to what has been arranged.
 */
export function HeirPlans({ plans }: { plans: Plan[] }) {
  return (
    <section className={styles.card}>
      <h2 className={styles.title}>You are named heir</h2>
      <p className={styles.lead}>
        {plans.length === 1
          ? "One account names you"
          : `${plans.length} accounts name you`}{" "}
        to take over after a silence. Nothing is yours to claim until that
        silence passes.
      </p>
      <ul className={styles.list}>
        {plans.map((plan) => (
          <li key={plan.owner} className={styles.item}>
            <span className={`${styles.owner} mono`} title={plan.owner}>
              {shortenAddress(plan.owner, 6)}
            </span>
            <span className={styles.meta}>
              {plan.mode === PlanMode.Sealed ? "Sealed" : "Standing"} ·{" "}
              {formatDuration(plan.period)} of silence
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
