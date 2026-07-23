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
        {sending ? "Signing…" : "I’m here"}
      </button>

      <p className={styles.explain}>
        Sends one stroop to yourself. Nothing leaves the account but the fee —
        the point is the record, which restarts the clock your plan is measured
        against.
      </p>

      {result && <TransactionResult outcome={result} successLabel="Recorded." />}
    </div>
  );
}
