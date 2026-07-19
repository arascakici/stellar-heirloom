import {
  getAddress,
  getNetwork,
  isAllowed,
  isConnected,
  requestAccess,
  signTransaction,
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

/**
 * Restores a connection without prompting. Freighter remembers which sites it
 * has allowed, so a returning visitor should not have to click through the
 * extension again — but only Freighter can be trusted about that, never our own
 * stored state. Returns null whenever access is not already granted.
 */
export async function restoreConnection(): Promise<string | null> {
  if (!(await isFreighterInstalled())) return null;

  const allowed = await isAllowed();
  if (allowed.error || !allowed.isAllowed) return null;

  const current = await getAddress();
  if (current.error || !current.address) return null;

  return current.address;
}

export type SignResult =
  | { ok: true; signedXdr: string }
  | { ok: false; error: WalletError };

/**
 * Signing is where a person is asked to approve something, so declining is an
 * ordinary outcome rather than an exception — it is the wallet working.
 */
export async function signXdr(
  xdr: string,
  address: string,
): Promise<SignResult> {
  const result = await signTransaction(xdr, {
    networkPassphrase: network.passphrase,
    address,
  });

  if (result.error) {
    return { ok: false, error: classify(String(result.error)) };
  }
  if (!result.signedTxXdr) {
    return { ok: false, error: { kind: "rejected" } };
  }

  return { ok: true, signedXdr: result.signedTxXdr };
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
