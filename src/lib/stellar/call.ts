import {
  Account,
  BASE_FEE,
  Contract,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { describeWalletError, signXdr } from "../wallet/kit";
import { network } from "./network";
import type { TxOutcome } from "./outcome";
import { soroban } from "./soroban";

/**
 * Calling a contract, the two ways heirloom needs.
 *
 * Both the registry and the vault talk to the chain the same way, so the dance
 * lives here once and each module keeps only what is particular to it: what its
 * methods are called and how its types decode.
 */

/**
 * Run a read-only method by simulating it — no signature, no fee, no ledger
 * write. The subject address doubles as the simulation source, which is always
 * a valid account id, so no funded account is needed to read.
 */
export async function read(
  contractId: string,
  method: string,
  source: string,
  ...args: xdr.ScVal[]
): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(source, "0"), {
    fee: BASE_FEE,
    networkPassphrase: network.passphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await soroban.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }

  const retval = sim.result?.retval;
  return retval ? scValToNative(retval) : null;
}

/**
 * Sign and submit a state-changing call, reporting back in the same shape the
 * heartbeat uses so one result component can render any of them.
 *
 * The steps are the Soroban dance: build the invocation, prepare it (simulation
 * fills in the footprint and the authorization the caller must sign), hand the
 * prepared XDR to the wallet, submit, then wait for the ledger to settle.
 */
export async function invoke(
  contractId: string,
  address: string,
  method: string,
  ...args: xdr.ScVal[]
): Promise<TxOutcome> {
  let preparedXdr: string;
  try {
    const account = await soroban.getAccount(address);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: network.passphrase,
    })
      .addOperation(new Contract(contractId).call(method, ...args))
      .setTimeout(180)
      .build();
    const prepared = await soroban.prepareTransaction(tx);
    preparedXdr = prepared.toXDR();
  } catch (error) {
    // A contract error (a plan already exists, a package is not due yet)
    // surfaces here, during simulation, before anything is signed.
    return { ok: false, reason: { kind: "network", message: cleanError(error) } };
  }

  const signed = await signXdr(preparedXdr, address);
  if (!signed.ok) {
    return {
      ok: false,
      reason:
        signed.error.kind === "rejected"
          ? { kind: "declined" }
          : { kind: "network", message: describeWalletError(signed.error) },
    };
  }

  try {
    const tx = TransactionBuilder.fromXDR(signed.signedXdr, network.passphrase);
    const sent = await soroban.sendTransaction(tx);
    if (sent.status === "ERROR") {
      return {
        ok: false,
        reason: { kind: "network", message: "The network rejected the transaction." },
      };
    }

    const result = await soroban.pollTransaction(sent.hash);
    if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return { ok: true, hash: sent.hash };
    }
    return {
      ok: false,
      reason: { kind: "network", message: "The transaction failed on chain." },
    };
  } catch (error) {
    return { ok: false, reason: { kind: "network", message: cleanError(error) } };
  }
}

/**
 * Contract errors arrive as a wall of host diagnostics. The frontend shows
 * sentences, so pull out what can be said plainly and keep the rest short.
 */
export function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message || "Something went wrong reaching the network.";
}
