import { Horizon } from "@stellar/stellar-sdk";

import { network } from "./network";

/**
 * One Horizon client for the whole app. Horizon is stateless, so sharing an
 * instance costs nothing and keeps the network choice in a single place.
 */
export const horizon = new Horizon.Server(network.horizonUrl);

/**
 * An address only becomes an *account* once it has been funded — until then
 * Horizon answers 404. That is a normal state for a first-time visitor, not an
 * error, so it is reported as a value rather than thrown.
 */
export async function accountExists(address: string): Promise<boolean> {
  try {
    await horizon.loadAccount(address);
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

/** What sealing a plan needs to know about the account it is arming. */
export type AccountFacts = {
  /** The sequence number the account is on right now. */
  sequence: bigint;
  /**
   * Trustlines, extra signers, offers, data entries. A merge delivery is
   * impossible while this is anything but zero — the chain answers
   * `op_has_sub_entries`.
   */
  subentryCount: number;
  /** Asset codes the account holds a trustline for, so they can be named. */
  trustlines: string[];
  /** Signers beyond the account's own master key. */
  extraSigners: number;
};

export async function fetchAccountFacts(
  address: string,
): Promise<AccountFacts | null> {
  try {
    const account = await horizon.loadAccount(address);

    // Naming what stands in the way beats reporting a count. These two cover
    // most accounts; offers and data entries are left to the total.
    const trustlines = account.balances
      .filter((balance) => balance.asset_type !== "native")
      .map((balance) =>
        "asset_code" in balance ? balance.asset_code : "an asset",
      );
    const extraSigners = account.signers.filter(
      (signer) => signer.key !== address,
    ).length;

    return {
      sequence: BigInt(account.sequenceNumber()),
      subentryCount: account.subentry_count,
      trustlines,
      extraSigners,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  );
}
