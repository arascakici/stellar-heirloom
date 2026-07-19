import { fromStroops, toStroops } from "./amount";
import { horizon, isNotFound } from "./horizon";

/**
 * Every Stellar account must keep a minimum balance locked: two base reserves
 * for the account itself, plus one for each subentry (signers, trustlines).
 * heirloom cares about this because a plan is kept alive by transactions, and a
 * balance that looks healthy but is entirely reserved cannot pay a single fee.
 */
const BASE_RESERVE_STROOPS = 5_000_000n; // 0.5 XLM

export type AccountBalance =
  | { funded: false }
  | {
      funded: true;
      /** Everything the account holds, reserve included. */
      total: string;
      /** Locked by the protocol and unspendable. */
      reserved: string;
      /** What can actually pay for a transaction. */
      available: string;
    };

export async function fetchXlmBalance(address: string): Promise<AccountBalance> {
  try {
    const account = await horizon.loadAccount(address);

    const native = account.balances.find(
      (balance) => balance.asset_type === "native",
    );
    const total = toStroops(native?.balance ?? "0");
    const reserved = BigInt(2 + account.subentry_count) * BASE_RESERVE_STROOPS;
    const available = total > reserved ? total - reserved : 0n;

    return {
      funded: true,
      total: fromStroops(total),
      reserved: fromStroops(reserved),
      available: fromStroops(available),
    };
  } catch (error) {
    // Horizon answers 404 for an address that has never been funded. That is
    // the ordinary state of a brand-new wallet, not a failure.
    if (isNotFound(error)) return { funded: false };
    throw error;
  }
}
