"use client";

import { useCallback, useEffect, useState } from "react";

import { fetchXlmBalance, type AccountBalance } from "./balance";

type Snapshot = {
  address: string;
  balance: AccountBalance | null;
  error: string | null;
};

type BalanceState = {
  balance: AccountBalance | null;
  loading: boolean;
  /** True while re-reading a balance that is already on screen. */
  refreshing: boolean;
  error: string | null;
  /** Call after anything that moves money, so the figure never goes stale. */
  refresh: () => Promise<void>;
};

export function useBalance(address: string | null): BalanceState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Reads without writing. Keeping the fetch free of state updates lets each
   * caller decide whether its result is still wanted — which matters, because
   * two reads can land out of order and the slower one must not win.
   */
  const read = useCallback(async (): Promise<Snapshot | null> => {
    if (!address) return null;

    try {
      return { address, balance: await fetchXlmBalance(address), error: null };
    } catch {
      return {
        address,
        balance: null,
        error: "Could not reach the network. Check your connection.",
      };
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;

    void read().then((result) => {
      if (!cancelled) setSnapshot(result);
    });

    return () => {
      cancelled = true;
    };
  }, [read]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setSnapshot(await read());
    setRefreshing(false);
  }, [read]);

  /**
   * Every snapshot records the address it came from, so switching accounts
   * makes the previous figure stale by construction. Showing one account's
   * balance under another account's name is the worst bug this screen has.
   */
  const current = snapshot?.address === address ? snapshot : null;

  return {
    balance: current?.balance ?? null,
    error: current?.error ?? null,
    loading: address !== null && current === null,
    refreshing,
    refresh,
  };
}
