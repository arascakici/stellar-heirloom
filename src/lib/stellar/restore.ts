import { BASE_FEE, Operation, TransactionBuilder } from "@stellar/stellar-sdk";

import { signXdr } from "../wallet/kit";
import { horizon } from "./horizon";
import { network } from "./network";
import type { TxFailureReason, TxOutcome } from "./outcome";

/**
 * Undoing a handover.
 *
 * A handover stands the owner's key down, which is final by design — but plans
 * fire for reasons nobody intended. Someone goes quiet because they were ill,
 * or travelling, or simply forgot, and comes back to an account they can no
 * longer sign for. The only party who can put that right is the heir, because
 * theirs is now the only key that meets the threshold.
 *
 * So this exists: one operation that gives the key back and takes the heir's
 * own access away. It is the same shape as the takeover that caused it, run in
 * reverse, and it is the heir's to give — which is exactly the trust the owner
 * placed in them when they named them.
 */
export async function giveAccountBack(
  owner: string,
  heir: string,
): Promise<TxOutcome> {
  let xdr: string;
  try {
    const source = await horizon.loadAccount(owner);

    xdr = new TransactionBuilder(source, {
      fee: String(Number(BASE_FEE) * 10),
      networkPassphrase: network.passphrase,
    })
      .addOperation(
        // Both halves in one operation, so the account is never briefly left
        // with nobody able to sign for it.
        Operation.setOptions({
          masterWeight: 1,
          signer: { ed25519PublicKey: heir, weight: 0 },
        }),
      )
      .setTimeout(180)
      .build()
      .toXDR();
  } catch (error) {
    return { ok: false, reason: explain(error) };
  }

  // Signed by the heir, for an account about to stop being theirs.
  const signed = await signXdr(xdr, heir);
  if (!signed.ok) {
    return {
      ok: false,
      reason:
        signed.error.kind === "rejected"
          ? { kind: "declined" }
          : { kind: "network", message: "Your wallet could not sign this." },
    };
  }

  try {
    const response = await horizon.submitTransaction(
      TransactionBuilder.fromXDR(signed.signedXdr, network.passphrase),
    );
    return { ok: true, hash: response.hash };
  } catch (error) {
    return { ok: false, reason: explain(error) };
  }
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

  if (codes?.transaction === "tx_bad_auth") {
    return {
      kind: "network",
      message: "This wallet no longer signs for that account.",
    };
  }
  if (codes?.operations?.includes("op_bad_auth")) {
    return {
      kind: "network",
      message: "This wallet is not a signer on that account.",
    };
  }

  return {
    kind: "network",
    message:
      codes?.transaction ||
      (error instanceof Error ? error.message : "The handback did not go through."),
  };
}
