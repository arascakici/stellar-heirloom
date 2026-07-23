import {
  Asset,
  BASE_FEE,
  Memo,
  Operation,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { horizon } from "./horizon";
import { network } from "./network";
import { fromStroops } from "./amount";
import type { TxFailureReason, TxOutcome } from "./outcome";
import { signXdr } from "../wallet/kit";

/**
 * The life signal.
 *
 * heirloom's whole mechanism rests on one measurement: how long the account's
 * sequence number has sat untouched. Any transaction resets that clock, so
 * proving you are still here means putting something — anything — on chain.
 * A payment of one stroop to yourself is the smallest honest way to say so:
 * nothing leaves the account except the fee.
 */
const ONE_STROOP = fromStroops(1n);

/** Marks the transaction as a heartbeat so it can be told apart on chain. */
const MEMO = "heirloom:here";

/** A heartbeat is just a transaction, so its result is the shared outcome. */
export type HeartbeatResult = TxOutcome;
export type HeartbeatFailure = TxFailureReason;

/**
 * Building is kept apart from signing so the transaction itself can be tested
 * without a browser extension in the loop.
 */
export async function buildHeartbeat(address: string) {
  const account = await horizon.loadAccount(address);

  // Ask the network what fees look like now rather than assuming; a heartbeat
  // that fails during congestion is a heartbeat that did not happen.
  let fee = BASE_FEE;
  try {
    fee = String(
      Math.max(Number(await horizon.fetchBaseFee()) * 2, Number(BASE_FEE)),
    );
  } catch {
    // Keep the default; submission will report the real problem if there is one.
  }

  return new TransactionBuilder(account, {
    fee,
    networkPassphrase: network.passphrase,
  })
    .addOperation(
      Operation.payment({
        destination: address,
        asset: Asset.native(),
        amount: ONE_STROOP,
      }),
    )
    .addMemo(Memo.text(MEMO))
    .setTimeout(180)
    .build();
}

export async function sendHeartbeat(address: string): Promise<HeartbeatResult> {
  let transaction;
  try {
    transaction = await buildHeartbeat(address);
  } catch {
    return { ok: false, reason: { kind: "unfunded" } };
  }

  const signed = await signXdr(transaction.toXDR(), address);
  if (!signed.ok) {
    if (signed.error.kind === "rejected") {
      return { ok: false, reason: { kind: "declined" } };
    }
    return {
      ok: false,
      reason: {
        kind: "network",
        message:
          signed.error.kind === "unknown"
            ? signed.error.message
            : "Your wallet could not sign this.",
      },
    };
  }

  try {
    const response = await horizon.submitTransaction(
      TransactionBuilder.fromXDR(signed.signedXdr, network.passphrase),
    );
    return { ok: true, hash: response.hash };
  } catch (error) {
    return { ok: false, reason: classifySubmission(error) };
  }
}

function classifySubmission(error: unknown): HeartbeatFailure {
  const codes = (
    error as {
      response?: {
        data?: {
          extras?: { result_codes?: { transaction?: string; operations?: string[] } };
        };
      };
    }
  )?.response?.data?.extras?.result_codes;

  const transaction = codes?.transaction ?? "";
  const operations = codes?.operations ?? [];

  if (
    transaction === "tx_insufficient_balance" ||
    operations.includes("op_underfunded")
  ) {
    return { kind: "insufficient-funds" };
  }

  return {
    kind: "network",
    message: transaction || "The network rejected the transaction.",
  };
}
