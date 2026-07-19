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

export function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 404
  );
}
