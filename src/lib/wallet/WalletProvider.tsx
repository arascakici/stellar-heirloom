"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  connectWallet,
  disconnectWallet,
  restoreConnection,
  type WalletError,
} from "./kit";

/**
 * "restoring" is its own state on purpose. On a reload we do not yet know
 * whether the visitor is connected, and rendering the disconnected view during
 * that moment makes the app flicker between two answers.
 */
export type WalletStatus =
  | "restoring"
  | "disconnected"
  | "connecting"
  | "connected";

type WalletContextValue = {
  status: WalletStatus;
  address: string | null;
  error: WalletError | null;
  /** Connect a chosen wallet; resolves true once connected, false on failure. */
  connect: (walletId: string) => Promise<boolean>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

/** Records that the visitor *wants* to be connected. Not proof that they are. */
const INTENT_KEY = "heirloom.wallet.intent";
/** Which wallet they last used, so a reload restores the right one. Never the address. */
const WALLET_KEY = "heirloom.wallet.id";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("restoring");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<WalletError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Someone who disconnected should stay disconnected, even though the
      // wallet may still trust this site.
      const walletId = localStorage.getItem(WALLET_KEY);
      if (localStorage.getItem(INTENT_KEY) !== "1" || !walletId) {
        if (!cancelled) setStatus("disconnected");
        return;
      }

      const restored = await restoreConnection(walletId);
      if (cancelled) return;

      setAddress(restored);
      setStatus(restored ? "connected" : "disconnected");
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async (walletId: string): Promise<boolean> => {
    setStatus("connecting");
    setError(null);

    const result = await connectWallet(walletId);
    if (result.ok) {
      localStorage.setItem(INTENT_KEY, "1");
      localStorage.setItem(WALLET_KEY, walletId);
      setAddress(result.address);
      setStatus("connected");
      return true;
    }

    setError(result.error);
    setStatus("disconnected");
    return false;
  }, []);

  /**
   * Ends the session here. The kit is asked to tear down any connection it can,
   * but a browser extension keeps its own record of trusted sites — so this is
   * honest about being a local sign-out, not a revocation.
   */
  const disconnect = useCallback(() => {
    localStorage.removeItem(INTENT_KEY);
    localStorage.removeItem(WALLET_KEY);
    void disconnectWallet();
    setAddress(null);
    setError(null);
    setStatus("disconnected");
  }, []);

  const value = useMemo(
    () => ({ status, address, error, connect, disconnect }),
    [status, address, error, connect, disconnect],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used inside <WalletProvider>");
  }
  return context;
}
