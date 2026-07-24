"use client";

import { useCallback, useEffect, useState } from "react";

import { getPlan, plansForHeir, type Plan } from "./registry";

type Snapshot = {
  address: string;
  plan: Plan | null;
  heirPlans: Plan[];
  error: string | null;
};

type PlansState = {
  /** The connected account's own plan, if it has ever registered one. */
  plan: Plan | null;
  /** Plans that currently name the connected account as heir. */
  heirPlans: Plan[];
  loading: boolean;
  /** True while re-reading the registry with a view already on screen. */
  refreshing: boolean;
  error: string | null;
  /** Call after register/heartbeat/cancel so the registry never goes stale. */
  refresh: () => Promise<void>;
};

/**
 * Both readings the registry offers for one account — the plan it owns and the
 * plans that name it as heir — taken together. Mirrors `useBalance`: the fetch
 * writes no state of its own, and every snapshot records the address it came
 * from, so switching wallets can never show one account under another's name.
 */
export function usePlans(address: string | null): PlansState {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const read = useCallback(async (): Promise<Snapshot | null> => {
    if (!address) return null;

    try {
      const [plan, heirPlans] = await Promise.all([
        getPlan(address),
        plansForHeir(address),
      ]);
      return { address, plan, heirPlans, error: null };
    } catch {
      return {
        address,
        plan: null,
        heirPlans: [],
        error: "Could not read the registry. Check your connection.",
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

  const current = snapshot?.address === address ? snapshot : null;

  return {
    plan: current?.plan ?? null,
    heirPlans: current?.heirPlans ?? [],
    error: current?.error ?? null,
    loading: address !== null && current === null,
    refreshing,
    refresh,
  };
}
