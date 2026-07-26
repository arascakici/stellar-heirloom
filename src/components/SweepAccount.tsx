"use client";

import { useCallback, useEffect, useState } from "react";

import { shortenAddress } from "@/lib/stellar/network";
import type { TxOutcome } from "@/lib/stellar/outcome";
import { planSweep, sweep, type SweepPlan } from "@/lib/stellar/sweep";

import { TransactionResult } from "./TransactionResult";
import styles from "./SweepAccount.module.css";

/**
 * The step after inheriting.
 *
 * A handover hands over control, not possession — the balances sit exactly
 * where they were, and the heir's signature is now the only one that moves
 * them. Saying "the account is yours" and stopping there leaves someone holding
 * a key and no idea what to do with it. This finishes the job: read what is
 * actually in the account now, and move it home.
 */
export function SweepAccount({
  owner,
  heir,
  onSwept,
}: {
  owner: string;
  heir: string;
  onSwept?: () => void;
}) {
  const [plan, setPlan] = useState<SweepPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TxOutcome | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    planSweep(owner, heir)
      .then((read) => {
        if (!cancelled) setPlan(read);
      })
      .catch(() => {
        if (!cancelled) setError("Could not read the account just now.");
      });
    return () => {
      cancelled = true;
    };
  }, [owner, heir]);

  useEffect(load, [load]);

  async function handleSweep() {
    setBusy(true);
    setResult(null);
    const outcome = await sweep(owner, heir);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) {
      setPlan(null);
      onSwept?.();
    }
  }

  if (error) return <p className={styles.status}>{error}</p>;
  if (result?.ok) {
    return (
      <div className={styles.done}>
        <TransactionResult
          outcome={result}
          successLabel="Everything is in your wallet."
        />
      </div>
    );
  }
  if (!plan) return <p className={styles.status}>Counting what is inside…</p>;

  const nothing =
    Number(plan.xlm) === 0 && plan.moving.length === 0 && plan.stuck.length === 0;

  if (nothing) {
    return <p className={styles.status}>This account is already empty.</p>;
  }

  return (
    <div className={styles.sweep}>
      <p className={styles.lead}>
        The balances are still in{" "}
        <span className="mono">{shortenAddress(owner, 4)}</span>, where only your
        signature can move them. Bring them home:
      </p>

      <ul className={styles.list}>
        {Number(plan.xlm) > 0 && (
          <li className={styles.line}>
            <span className={`${styles.amount} mono`}>{plan.xlm}</span>
            <span className={styles.what}>XLM</span>
          </li>
        )}
        {plan.moving.map((asset) => (
          <li key={`${asset.code}:${asset.issuer}`} className={styles.line}>
            <span className={`${styles.amount} mono`}>{asset.amount}</span>
            <span className={styles.what}>{asset.code}</span>
          </li>
        ))}
      </ul>

      {plan.closes ? (
        <p className={styles.note}>
          The old account closes behind you, which returns the {plan.reserve} XLM
          the network had locked as its reserve. Nothing is left of it.
        </p>
      ) : (
        <p className={styles.note}>
          {plan.reserve} XLM stays locked as the account&rsquo;s reserve, because
          the account has to remain open.
        </p>
      )}

      {plan.stuck.length > 0 && (
        <p className={styles.stuck}>
          {plan.stuck.map((asset) => asset.code).join(", ")} cannot be sent: your
          wallet holds no trustline for{" "}
          {plan.stuck.length === 1 ? "it" : "them"}. Add one and come back, and
          the rest will follow.
        </p>
      )}

      <button
        type="button"
        className={styles.act}
        onClick={handleSweep}
        disabled={busy}
      >
        {busy ? "Moving…" : plan.closes ? "Empty and close it" : "Bring it home"}
      </button>

      {result && !result.ok && (
        <TransactionResult outcome={result} successLabel="" />
      )}
    </div>
  );
}
