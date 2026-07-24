"use client";

import { useState } from "react";

import type { TxOutcome } from "@/lib/stellar/outcome";
import { heartbeatPlan } from "@/lib/stellar/registry";

import { TransactionResult } from "./TransactionResult";
import styles from "./Heartbeat.module.css";

type Props = {
  address: string;
  onSent: () => void;
};

export function Heartbeat({ address, onSent }: Props) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TxOutcome | null>(null);

  async function handleSend() {
    setSending(true);
    setResult(null);

    const outcome = await heartbeatPlan(address);
    setResult(outcome);
    setSending(false);

    if (outcome.ok) onSent();
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={handleSend}
        disabled={sending}
      >
        {sending ? "Winding…" : "Wind the clock"}
      </button>

      <p className={styles.explain}>
        Tells the registry you’re still here — nothing leaves but the fee. It
        winds back the silence your plan counts down against.
      </p>

      {result && (
        <TransactionResult outcome={result} successLabel="Clock wound." />
      )}
    </div>
  );
}
