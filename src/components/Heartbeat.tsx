"use client";

import { useState } from "react";

import { sendHeartbeat, type HeartbeatResult } from "@/lib/stellar/heartbeat";

import { TransactionResult } from "./TransactionResult";
import styles from "./Heartbeat.module.css";

type Props = {
  address: string;
  onSent: () => void;
};

export function Heartbeat({ address, onSent }: Props) {
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<HeartbeatResult | null>(null);

  async function handleSend() {
    setSending(true);
    setResult(null);

    const outcome = await sendHeartbeat(address);
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
        A one-stroop note to yourself — nothing leaves but the fee. It winds back
        the clock your plan counts down against.
      </p>

      {result && (
        <TransactionResult outcome={result} successLabel="Clock wound." />
      )}
    </div>
  );
}
