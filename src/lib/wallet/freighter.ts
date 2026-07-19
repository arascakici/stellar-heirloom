import {
  getNetwork,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";

import { network } from "../stellar/network";

/**
 * Freighter answers with `{ value, error }` on every call, which makes it easy
 * to read the value and forget the error. This layer converts that into a
 * discriminated union so the compiler insists on handling failure, and narrows
 * the failures down to the ones a person can actually act on.
 */
export type WalletError =
  | { kind: "not-installed" }
  | { kind: "rejected" }
  | { kind: "wrong-network"; expected: string; actual: string }
  | { kind: "unknown"; message: string };

export type ConnectResult =
  | { ok: true; address: string }
  | { ok: false; error: WalletError };

/** Freighter phrases refusal differently across versions; match on intent. */
function isRefusal(message: string): boolean {
  return /declin|reject|denied|cancel/i.test(message);
}

function classify(message: string): WalletError {
  if (isRefusal(message)) return { kind: "rejected" };
  return { kind: "unknown", message };
}

export async function isFreighterInstalled(): Promise<boolean> {
  const result = await isConnected();
  return result.isConnected === true && !result.error;
}

/**
 * Asks Freighter for an address, then checks the wallet is pointed at the same
 * network the app is. Skipping that check is how people end up signing a
 * mainnet transaction while reading a testnet balance.
 */
export async function connectWallet(): Promise<ConnectResult> {
  if (!(await isFreighterInstalled())) {
    return { ok: false, error: { kind: "not-installed" } };
  }

  const access = await requestAccess();
  if (access.error) {
    return { ok: false, error: classify(String(access.error)) };
  }
  if (!access.address) {
    return { ok: false, error: { kind: "rejected" } };
  }

  const walletNetwork = await getNetwork();
  if (walletNetwork.error) {
    return { ok: false, error: classify(String(walletNetwork.error)) };
  }
  if (walletNetwork.networkPassphrase !== network.passphrase) {
    return {
      ok: false,
      error: {
        kind: "wrong-network",
        expected: network.label,
        actual: walletNetwork.network || "an unknown network",
      },
    };
  }

  return { ok: true, address: access.address };
}

/** Wording shown to the user. Kept beside the errors so the two stay in step. */
export function describeWalletError(error: WalletError): string {
  switch (error.kind) {
    case "not-installed":
      return "Freighter isn’t installed in this browser.";
    case "rejected":
      return "You declined the connection request.";
    case "wrong-network":
      return `Your wallet is on ${error.actual}. Switch it to ${error.expected} and try again.`;
    case "unknown":
      return error.message || "Something went wrong reaching your wallet.";
  }
}
