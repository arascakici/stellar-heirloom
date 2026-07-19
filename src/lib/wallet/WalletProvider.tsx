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
  restoreConnection,
  type WalletError,
} from "./freighter";

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
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

/** Records that the visitor *wants* to be connected. Not proof that they are. */
const INTENT_KEY = "heirloom.wallet.intent";

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("restoring");
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<WalletError | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Someone who disconnected should stay disconnected, even though
      // Freighter still has this site on its allowlist.
      if (localStorage.getItem(INTENT_KEY) !== "1") {
        if (!cancelled) setStatus("disconnected");
        return;
      }

      const restored = await restoreConnection();
      if (cancelled) return;

      setAddress(restored);
      setStatus(restored ? "connected" : "disconnected");
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  const connect = useCallback(async () => {
    setStatus("connecting");
    setError(null);

    const result = await connectWallet();
    if (result.ok) {
      localStorage.setItem(INTENT_KEY, "1");
      setAddress(result.address);
      setStatus("connected");
    } else {
      setError(result.error);
      setStatus("disconnected");
    }
  }, []);

  /**
   * Freighter has no API for revoking access, so this ends the session here
   * rather than in the wallet. The distinction is surfaced in the UI: telling
   * someone they are "disconnected" when the extension still trusts the site
   * would be a comfortable lie.
   */
  const disconnect = useCallback(() => {
    localStorage.removeItem(INTENT_KEY);
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
