import type {
  ISupportedWallet,
  StellarWalletsKit,
} from "@creit.tech/stellar-wallets-kit";

import { NETWORK, network } from "../stellar/network";

/**
 * One wallet layer for the whole app, built on StellarWalletsKit so heirloom is
 * not tied to a single extension. Freighter still works; so do xBull, Albedo,
 * Lobstr, Rabet, and Hana.
 *
 * The kit ships web components that call `customElements.define` at import time,
 * which throws on the server. So the kit and its modules are pulled in
 * dynamically, only ever in the browser, and only once.
 */
type Kit = typeof StellarWalletsKit;

let kitRef: Kit | null = null;
let initPromise: Promise<Kit> | null = null;

async function kit(): Promise<Kit> {
  if (kitRef) return kitRef;

  if (!initPromise) {
    initPromise = (async () => {
      const [
        core,
        { FreighterModule },
        { xBullModule },
        { AlbedoModule },
        { LobstrModule },
        { RabetModule },
        { HanaModule },
      ] = await Promise.all([
        import("@creit.tech/stellar-wallets-kit"),
        import("@creit.tech/stellar-wallets-kit/modules/freighter"),
        import("@creit.tech/stellar-wallets-kit/modules/xbull"),
        import("@creit.tech/stellar-wallets-kit/modules/albedo"),
        import("@creit.tech/stellar-wallets-kit/modules/lobstr"),
        import("@creit.tech/stellar-wallets-kit/modules/rabet"),
        import("@creit.tech/stellar-wallets-kit/modules/hana"),
      ]);

      core.StellarWalletsKit.init({
        network:
          NETWORK === "mainnet"
            ? core.Networks.PUBLIC
            : core.Networks.TESTNET,
        modules: [
          new FreighterModule(),
          new xBullModule(),
          new AlbedoModule(),
          new LobstrModule(),
          new RabetModule(),
          new HanaModule(),
        ],
      });

      kitRef = core.StellarWalletsKit;
      return kitRef;
    })();
  }

  return initPromise;
}

/** A wallet the visitor can choose from, as our own UI wants to draw it. */
export type WalletChoice = {
  id: string;
  name: string;
  icon: string;
  url: string;
  available: boolean;
};

export type WalletError =
  | { kind: "not-available"; name: string; url: string }
  | { kind: "rejected" }
  | { kind: "wrong-network"; expected: string; actual: string }
  | { kind: "unknown"; message: string };

export type ConnectResult =
  | { ok: true; address: string }
  | { ok: false; error: WalletError };

export type SignResult =
  | { ok: true; signedXdr: string }
  | { ok: false; error: WalletError };

/** The wallets differ in how they phrase refusal; match on intent. */
function isRefusal(message: string): boolean {
  return /declin|reject|denied|cancel/i.test(message);
}

function classify(error: unknown): WalletError {
  const message =
    error instanceof Error ? error.message : String(error ?? "");
  if (isRefusal(message)) return { kind: "rejected" };
  return { kind: "unknown", message: message || "Your wallet could not complete that." };
}

/** The list to render in our own picker, newest availability each time. */
export async function listWallets(): Promise<WalletChoice[]> {
  const k = await kit();
  const wallets: ISupportedWallet[] = await k.refreshSupportedWallets();
  return wallets.map((w) => ({
    id: w.id,
    name: w.name,
    icon: w.icon,
    url: w.url,
    available: w.isAvailable,
  }));
}

/**
 * Confirms the chosen wallet is pointed at the same network the app is. Skipping
 * that check is how people end up signing a mainnet transaction while reading a
 * testnet balance. Wallets that cannot report a network are trusted, since the
 * kit was initialised on ours.
 */
async function networkMismatch(k: Kit): Promise<WalletError | null> {
  try {
    const { network: actual, networkPassphrase } = await k.getNetwork();
    if (networkPassphrase && networkPassphrase !== network.passphrase) {
      return {
        kind: "wrong-network",
        expected: network.label,
        actual: actual || "an unknown network",
      };
    }
  } catch {
    // The wallet does not expose its network; nothing to compare against.
  }
  return null;
}

/** Select a wallet by id, ask it for an address, and check its network. */
export async function connectWallet(walletId: string): Promise<ConnectResult> {
  const k = await kit();
  try {
    k.setWallet(walletId);
    const { address } = await k.getAddress();
    if (!address) return { ok: false, error: { kind: "rejected" } };

    const mismatch = await networkMismatch(k);
    if (mismatch) return { ok: false, error: mismatch };

    return { ok: true, address };
  } catch (error) {
    return { ok: false, error: classify(error) };
  }
}

/**
 * Restores a connection on reload without prompting. We re-select the wallet the
 * visitor last used and read the address from the kit's memory; if nothing is
 * there, they simply reconnect. Only the wallet id is ever stored, never the
 * address.
 */
export async function restoreConnection(
  walletId: string,
): Promise<string | null> {
  const k = await kit();
  try {
    k.setWallet(walletId);
    const { address } = await k.getAddress();
    return address || null;
  } catch {
    return null;
  }
}

/** Same shape the heartbeat has always signed with, now wallet-agnostic. */
export async function signXdr(
  xdr: string,
  address: string,
): Promise<SignResult> {
  const k = await kit();
  try {
    const { signedTxXdr } = await k.signTransaction(xdr, {
      networkPassphrase: network.passphrase,
      address,
    });
    if (!signedTxXdr) return { ok: false, error: { kind: "rejected" } };
    return { ok: true, signedXdr: signedTxXdr };
  } catch (error) {
    return { ok: false, error: classify(error) };
  }
}

export async function disconnectWallet(): Promise<void> {
  const k = await kit();
  try {
    await k.disconnect();
  } catch {
    // Nothing to tear down; ending the session locally is enough.
  }
}

/** Wording shown to the user. Kept beside the errors so the two stay in step. */
export function describeWalletError(error: WalletError): string {
  switch (error.kind) {
    case "not-available":
      return `${error.name} isn’t available in this browser.`;
    case "rejected":
      return "You declined the request in your wallet.";
    case "wrong-network":
      return `Your wallet is on ${error.actual}. Switch it to ${error.expected} and try again.`;
    case "unknown":
      return error.message || "Something went wrong reaching your wallet.";
  }
}
