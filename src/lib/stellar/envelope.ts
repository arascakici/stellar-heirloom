import {
  Account,
  Operation,
  Transaction,
  TransactionBuilder,
} from "@stellar/stellar-sdk";

import { network } from "./network";
import { PlanMode } from "./registry";

/**
 * The sealed package: the transaction that hands the account over.
 *
 * It is signed today and submitted — by anyone — only once the owner has gone
 * quiet for the agreed period. Nothing here talks to a wallet or a network, so
 * every rule below can be tested without either.
 */

/** How the account changes hands. Mirrors the vault's `Delivery`. */
export enum Delivery {
  /** The heir becomes a signer and the owner's key stands down. */
  Handover = 0,
  /** Every lumen moves to the heir's own wallet and the account is deleted. */
  Merge = 1,
}

/**
 * How far ahead a standing plan reserves its sequence number.
 *
 * A standing plan has to survive ordinary use, so its transaction claims a slot
 * far beyond anything the owner will reach by living normally. Calling the plan
 * off means bumping the sequence past that reserved slot — merely passing
 * `minSeqNum` does nothing.
 */
export const SEQ_RESERVE = 1_000_000n;

/**
 * A pre-signed transaction carries the fee it was signed with, forever. There
 * is no raising it later, so it is set high enough to survive years of
 * congestion; unused fee is not charged.
 */
export const ENVELOPE_FEE = "100000";

export type EnvelopeParams = {
  owner: string;
  heir: string;
  /** Seconds of silence after which the heir may take over. */
  period: bigint;
  mode: PlanMode;
  delivery: Delivery;
  /** The owner's sequence number as Horizon reports it right now. */
  sequence: bigint;
  fee?: string;
};

/**
 * Whether this account can be delivered by merging.
 *
 * A merge refuses any account carrying subentries — one trustline is enough,
 * and the chain answers `op_has_sub_entries`. Verified on testnet rather than
 * taken from documentation.
 */
export function canMerge(subentryCount: number): boolean {
  return subentryCount === 0;
}

/**
 * Build the takeover transaction. Signing happens elsewhere.
 */
export function buildEnvelope({
  owner,
  heir,
  period,
  mode,
  delivery,
  sequence,
  fee = ENVELOPE_FEE,
}: EnvelopeParams): Transaction {
  if (period <= 0n) {
    throw new Error("A plan needs a silence longer than nothing.");
  }
  if (owner === heir) {
    throw new Error("An account cannot inherit from itself.");
  }

  const standing = mode === PlanMode.Standing;

  // A sealed plan claims the very next slot, so any transaction at all voids
  // it. A standing plan claims a distant one and pins `minSeqNum` to today, so
  // ordinary activity passes underneath it untouched.
  const seqNum = standing ? sequence + SEQ_RESERVE : sequence + 1n;

  // TransactionBuilder consumes sequence + 1, so seed the account one below.
  const source = new Account(owner, (seqNum - 1n).toString());

  const builder = new TransactionBuilder(source, {
    fee,
    networkPassphrase: network.passphrase,
  })
    .addOperation(operationFor(delivery, heir))
    .setMinAccountSequenceAge(period)
    // No expiry. A plan that timed out would be a plan that quietly stopped
    // protecting anyone, and nobody would be told.
    .setTimeout(0);

  if (standing) builder.setMinAccountSequence(sequence.toString());

  return builder.build();
}

function operationFor(delivery: Delivery, heir: string) {
  if (delivery === Delivery.Merge) {
    return Operation.accountMerge({ destination: heir });
  }

  // Every threshold rises to 1 so the heir's single signature is enough for
  // anything, and the master weight drops to 0 so the old key is not.
  return Operation.setOptions({
    signer: { ed25519PublicKey: heir, weight: 1 },
    masterWeight: 0,
    lowThreshold: 1,
    medThreshold: 1,
    highThreshold: 1,
  });
}
