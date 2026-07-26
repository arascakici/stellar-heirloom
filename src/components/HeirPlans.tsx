"use client";

import { useCallback, useEffect, useState } from "react";

import { formatDuration } from "@/lib/stellar/duration";
import { shortenAddress } from "@/lib/stellar/network";
import type { TxOutcome } from "@/lib/stellar/outcome";
import { PlanMode, type Plan } from "@/lib/stellar/registry";
import { takeOver, type TakeoverStep } from "@/lib/stellar/takeover";
import { claimableFor } from "@/lib/stellar/vault";

import { TransactionResult } from "./TransactionResult";
import styles from "./HeirPlans.module.css";

/**
 * The other side of the registry: accounts that have named you to inherit them.
 *
 * Most of this is waiting, and the list says so. But when a silence has finally
 * run out and a package is waiting in the vault, the account becomes something
 * you can actually take — and the contract, not this screen, is what decides
 * which of those two a row is.
 */

const STEP_LABEL: Record<TakeoverStep, string> = {
  reading: "Opening the package…",
  submitting: "Handing it to the network…",
  recording: "Recording it…",
};

type Props = {
  heir: string;
  plans: Plan[];
  /** The registry has changed; ask for it again. */
  onClaimed: () => void;
};

export function HeirPlans({ heir, plans, onClaimed }: Props) {
  const [claimable, setClaimable] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [step, setStep] = useState<TakeoverStep | null>(null);
  const [result, setResult] = useState<{ owner: string; outcome: TxOutcome } | null>(
    null,
  );

  // Which of these are actually due is the vault's answer, not a sum we do
  // here — the contract asks the registry, and the registry owns the rule.
  const refresh = useCallback(() => {
    let cancelled = false;
    claimableFor(heir)
      .then((owners) => {
        if (!cancelled) setClaimable(new Set(owners));
      })
      .catch(() => {
        if (!cancelled) setClaimable(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [heir]);

  useEffect(refresh, [refresh]);

  async function handleTakeover(owner: string) {
    setBusy(owner);
    setResult(null);

    const outcome = await takeOver(heir, owner, setStep);

    setBusy(null);
    setStep(null);
    setResult({ owner, outcome });

    if (outcome.ok) {
      refresh();
      onClaimed();
    }
  }

  const dueCount = plans.filter((plan) => claimable.has(plan.owner)).length;

  return (
    <section className={styles.card}>
      <h2 className={styles.title}>You are named heir</h2>
      <p className={styles.lead}>
        {plans.length === 1
          ? "One account names you"
          : `${plans.length} accounts name you`}{" "}
        to take over after a silence.{" "}
        {dueCount === 0
          ? "None of them has gone quiet for long enough yet."
          : dueCount === 1
            ? "One of them has gone quiet long enough, and is yours to take."
            : `${dueCount} of them have gone quiet long enough, and are yours to take.`}
      </p>
      <ul className={styles.list}>
        {plans.map((plan) => {
          const due = claimable.has(plan.owner);
          return (
            <li
              key={plan.owner}
              className={styles.item}
              data-due={due ? "" : undefined}
            >
              <span className={`${styles.owner} mono`} title={plan.owner}>
                {shortenAddress(plan.owner, 6)}
              </span>
              <span className={styles.meta}>
                {plan.mode === PlanMode.Sealed ? "Sealed" : "Standing"} ·{" "}
                {formatDuration(plan.period)} of silence
              </span>
              {due && (
                <button
                  type="button"
                  className={styles.take}
                  disabled={busy !== null}
                  onClick={() => handleTakeover(plan.owner)}
                >
                  {busy === plan.owner && step
                    ? STEP_LABEL[step]
                    : "Take over"}
                </button>
              )}
              {result?.owner === plan.owner && (
                <div className={styles.result}>
                  <TransactionResult
                    outcome={result.outcome}
                    successLabel="The account is yours."
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
