import { Networks } from "@stellar/stellar-sdk";

/**
 * Everything network-specific lives here, so that going to mainnet is a change
 * of configuration rather than a search through the codebase. heirloom runs on
 * testnet until the arming and cancellation paths have been reviewed — those
 * are the two places where a bug costs someone their account.
 */
export type StellarNetwork = "testnet" | "mainnet";

type NetworkConfig = {
  readonly label: string;
  readonly passphrase: string;
  readonly horizonUrl: string;
  /** Soroban RPC endpoint — contract reads and invocations go here, not Horizon. */
  readonly sorobanRpcUrl: string;
  /** Testnet only: hands out free XLM so a new account can be armed. */
  readonly friendbotUrl: string | null;
  readonly explorerUrl: string;
};

const NETWORKS: Record<StellarNetwork, NetworkConfig> = {
  testnet: {
    label: "Testnet",
    passphrase: Networks.TESTNET,
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanRpcUrl: "https://soroban-testnet.stellar.org",
    friendbotUrl: "https://friendbot.stellar.org",
    explorerUrl: "https://stellar.expert/explorer/testnet",
  },
  mainnet: {
    label: "Mainnet",
    passphrase: Networks.PUBLIC,
    horizonUrl: "https://horizon.stellar.org",
    sorobanRpcUrl: "https://mainnet.sorobanrpc.com",
    friendbotUrl: null,
    explorerUrl: "https://stellar.expert/explorer/public",
  },
};

function resolveNetwork(): StellarNetwork {
  const configured = process.env.NEXT_PUBLIC_STELLAR_NETWORK;
  return configured === "mainnet" ? "mainnet" : "testnet";
}

export const NETWORK = resolveNetwork();

export const network: NetworkConfig = {
  ...NETWORKS[NETWORK],
  horizonUrl: process.env.NEXT_PUBLIC_HORIZON_URL ?? NETWORKS[NETWORK].horizonUrl,
  sorobanRpcUrl:
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL ?? NETWORKS[NETWORK].sorobanRpcUrl,
};

export function explorerTxUrl(hash: string): string {
  return `${network.explorerUrl}/tx/${hash}`;
}

export function explorerAccountUrl(address: string): string {
  return `${network.explorerUrl}/account/${address}`;
}

/** Addresses are 56 characters; show enough of both ends to compare by eye. */
export function shortenAddress(address: string, visible = 4): string {
  if (address.length <= visible * 2 + 1) return address;
  return `${address.slice(0, visible)}…${address.slice(-visible)}`;
}
