import { explorerTxUrl } from "@/lib/stellar/network";
import type { TxFailureReason, TxOutcome } from "@/lib/stellar/outcome";

import styles from "./TransactionResult.module.css";

type Props = {
  outcome: TxOutcome;
  /** What a success reads as. The receipt is the same; the sentence isn't. */
  successLabel?: string;
};

/**
 * The receipt for anything the app signs and submits. On success it hands back
 * what the chain wrote — the hash — and a way to go read it. On failure it says
 * plainly what happened, in the terms the person can act on: fund the account,
 * try again, or accept that they declined.
 */
export function TransactionResult({
  outcome,
  successLabel = "Recorded on chain.",
}: Props) {
  if (outcome.ok) {
    return (
      <div className={styles.ok}>
        <p className={styles.headline}>{successLabel}</p>
        <a
          className={styles.link}
          href={explorerTxUrl(outcome.hash)}
          target="_blank"
          rel="noreferrer"
        >
          <span className={styles.hash}>{outcome.hash}</span>
          <span className={styles.linkNote}>View on stellar.expert →</span>
        </a>
      </div>
    );
  }

  return (
    <p className={styles.failed} role="alert">
      {describeFailure(outcome.reason)}
    </p>
  );
}

function describeFailure(reason: TxFailureReason): string {
  switch (reason.kind) {
    case "declined":
      return "You declined the signature, so nothing was sent.";
    case "insufficient-funds":
      return "Not enough XLM to cover the fee. Fund the account and try again.";
    case "unfunded":
      return "This account isn’t on the ledger yet — fund it first.";
    case "network":
      return reason.message
        ? `The network rejected it: ${reason.message}`
        : "The network rejected the transaction.";
  }
}
