import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import { invoke as call, read as simulate } from "./call";
import { Delivery } from "./envelope";
import type { TxOutcome } from "./outcome";

/**
 * The vault, as the frontend sees it: where a signed package waits until the
 * silence it was written against has run out.
 *
 * The vault never decides whether that has happened — it asks the registry. So
 * does this module, indirectly: everything here is about carrying a package in
 * and out, never about judging when it is due.
 */

/** The deployed vault. Override for a fresh deployment via env. */
export const VAULT_ID =
  process.env.NEXT_PUBLIC_VAULT_ID ??
  "CB55KTVZ7QINEKSXDTALKEIEJWW4DHLIGZPM4SANDG3UGF7XKDIPU7JQ";

export type SealedEnvelope = {
  owner: string;
  heir: string;
  delivery: Delivery;
  /** The signed transaction, base64 XDR — ready to hand to the network. */
  tx: string;
  sealedAt: bigint;
  /** Ledger time somebody collected it, or null while it still waits. */
  claimedAt: bigint | null;
};

/** The raw object `scValToNative` hands back — field names as on chain. */
type RawEnvelope = {
  owner: string;
  heir: string;
  delivery: number;
  tx: Uint8Array;
  sealed_at: bigint;
  claimed_at: bigint | null | undefined;
};

/**
 * The chain holds the package as raw bytes; everything else in Stellar hands
 * transactions around as base64. Convert at this boundary and nowhere else.
 *
 * `Buffer` is deliberately avoided — it is not a browser global, and the one
 * the bundler may or may not polyfill is not worth depending on.
 */
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function toEnvelope(raw: RawEnvelope): SealedEnvelope {
  return {
    owner: raw.owner,
    heir: raw.heir,
    delivery: raw.delivery,
    tx: bytesToBase64(Uint8Array.from(raw.tx)),
    sealedAt: raw.sealed_at,
    claimedAt: raw.claimed_at ?? null,
  };
}

const read = (method: string, source: string, ...args: xdr.ScVal[]) =>
  simulate(VAULT_ID, method, source, ...args);
const invoke = (address: string, method: string, ...args: xdr.ScVal[]) =>
  call(VAULT_ID, address, method, ...args);

/** The package sealed for `owner`, if there is one. */
export async function getEnvelope(owner: string): Promise<SealedEnvelope | null> {
  const raw = await read("envelope", owner, new Address(owner).toScVal());
  return raw ? toEnvelope(raw as RawEnvelope) : null;
}

/**
 * The owners whose packages this heir may collect right now — named by the
 * plan, past the silence, and still waiting.
 */
export async function claimableFor(heir: string): Promise<string[]> {
  const raw = await read("claimable_for", heir, new Address(heir).toScVal());
  return Array.isArray(raw) ? (raw as string[]) : [];
}

/** Place a signed package. The owner must sign for it. */
export function sealEnvelope(
  owner: string,
  heir: string,
  delivery: Delivery,
  signedXdr: string,
): Promise<TxOutcome> {
  return invoke(
    owner,
    "seal",
    new Address(owner).toScVal(),
    new Address(heir).toScVal(),
    nativeToScVal(delivery, { type: "u32" }),
    nativeToScVal(base64ToBytes(signedXdr), { type: "bytes" }),
  );
}

/** Take a package back out. The owner must sign for it. */
export function unsealEnvelope(owner: string): Promise<TxOutcome> {
  return invoke(owner, "unseal", new Address(owner).toScVal());
}

/**
 * Collect a due package. Anybody may call this — the contract asks for no
 * signature, because the transaction inside is already signed and the chain
 * refuses it until it is due. `caller` only pays the fee.
 */
export function claimEnvelope(caller: string, owner: string): Promise<TxOutcome> {
  return invoke(caller, "claim", new Address(owner).toScVal());
}
