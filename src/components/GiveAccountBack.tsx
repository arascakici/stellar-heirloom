"use client";

import { useState } from "react";

import { shortenAddress } from "@/lib/stellar/network";
import type { TxOutcome } from "@/lib/stellar/outcome";
import { giveAccountBack } from "@/lib/stellar/restore";

import { ConfirmDialog } from "./ConfirmDialog";
import { TransactionResult } from "./TransactionResult";
import styles from "./GiveAccountBack.module.css";

/**
 * The way back.
 *
 * A handover is final by design, but plans fire for reasons nobody meant —
 * illness, travel, a forgotten month. The owner cannot undo it, because their
 * key no longer signs for anything. Only the heir can, and only deliberately,
 * so it asks first and it asks in rust.
 */
export function GiveAccountBack({
  owner,
  heir,
  onGivenBack,
}: {
  owner: string;
  heir: string;
  onGivenBack?: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TxOutcome | null>(null);

  async function handleGiveBack() {
    setBusy(true);
    const outcome = await giveAccountBack(owner, heir);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) {
      setAsking(false);
      onGivenBack?.();
    }
  }

  if (result?.ok) {
    return (
      <div className={styles.done}>
        <TransactionResult
          outcome={result}
          successLabel="Given back. The account answers to its own key again."
        />
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.give}
        onClick={() => setAsking(true)}
      >
        Give the account back
      </button>

      {asking && (
        <ConfirmDialog
          title="Give it back?"
          body={`${shortenAddress(owner, 4)} will answer to its own key again, and yours will stop signing for it. If this was a silence nobody meant, this is how it is undone — but you cannot take it back afterwards.`}
          confirmLabel="Give it back"
          busyLabel="Handing it over…"
          dismissLabel="Keep it"
          busy={busy}
          onConfirm={handleGiveBack}
          onDismiss={() => setAsking(false)}
        >
          {result && !result.ok && (
            <TransactionResult outcome={result} successLabel="" />
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
