import { TransactionBuilder } from "@stellar/stellar-sdk";

import { horizon } from "./horizon";
import { network } from "./network";
import type { TxFailureReason, TxOutcome } from "./outcome";
import { claimEnvelope, getEnvelope } from "./vault";

/**
 * Taking over an account whose silence has run out.
 *
 * Almost nothing happens here, and that is the point: the transaction was
 * signed by the owner long ago and has been sitting in the vault in plain
 * sight. The heir does not build it, does not sign it, and could not alter it
 * if they wanted to. They only carry it to the network.
 */

export type TakeoverStep = "reading" | "submitting" | "recording";

export async function takeOver(
  heir: string,
  owner: string,
  onStep?: (step: TakeoverStep) => void,
): Promise<TxOutcome> {
  onStep?.("reading");

  let envelope;
  try {
    envelope = await getEnvelope(owner);
  } catch {
    return {
      ok: false,
      reason: { kind: "network", message: "Could not read the vault." },
    };
  }

  if (!envelope) {
    return {
      ok: false,
      reason: {
        kind: "network",
        message: "There is no package sealed for this account.",
      },
    };
  }

  onStep?.("submitting");

  let hash: string;
  try {
    const takeover = TransactionBuilder.fromXDR(envelope.tx, network.passphrase);
    const response = await horizon.submitTransaction(takeover);
    hash = response.hash;
  } catch (error) {
    return { ok: false, reason: explain(error) };
  }

  // The takeover has landed. Recording the receipt on chain is worth doing —
  // it is what a watcher and the registry page read — but it is not what the
  // heir came for, so its failure does not turn a success into one.
  onStep?.("recording");
  try {
    await claimEnvelope(heir, owner);
  } catch {
    // Deliberately swallowed; the account has already changed hands.
  }

  return { ok: true, hash };
}

function explain(error: unknown): TxFailureReason {
  const codes = (
    error as {
      response?: {
        data?: {
          extras?: {
            result_codes?: { transaction?: string; operations?: string[] };
          };
        };
      };
    }
  )?.response?.data?.extras?.result_codes;

  const transaction = codes?.transaction ?? "";
  const operations = codes?.operations ?? [];

  // The two refusals worth naming, because they mean something to a person.
  if (transaction === "tx_bad_minseq_age_or_gap") {
    return {
      kind: "network",
      message:
        "The account has been used too recently. The silence starts again from its last transaction.",
    };
  }
  if (transaction === "tx_bad_seq") {
    return {
      kind: "network",
      message:
        "This was a sealed plan and the account has since been used, which voids it for good.",
    };
  }
  if (operations.includes("op_has_sub_entries")) {
    return {
      kind: "network",
      message:
        "The account has taken on a trustline since this package was sealed, and a merge cannot close it.",
    };
  }

  return {
    kind: "network",
    message: transaction || "The network refused the takeover.",
  };
}
