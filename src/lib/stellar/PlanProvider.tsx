"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useWallet } from "../wallet/WalletProvider";
import { usePlans } from "./usePlans";

/**
 * One reading of the registry, shared. The menu decides from it whether there
 * is a clock to wind; the centre shows the plan itself and the plans that name
 * you as heir — all from the same fetch, so a heartbeat or a cancellation lands
 * everywhere at once instead of leaving two copies to drift.
 */
type PlansContextValue = ReturnType<typeof usePlans>;

const PlansContext = createContext<PlansContextValue | null>(null);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const value = usePlans(address);
  return (
    <PlansContext.Provider value={value}>{children}</PlansContext.Provider>
  );
}

export function useAccountPlans(): PlansContextValue {
  const context = useContext(PlansContext);
  if (!context) {
    throw new Error("useAccountPlans must be used inside <PlanProvider>");
  }
  return context;
}
