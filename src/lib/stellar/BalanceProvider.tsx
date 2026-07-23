"use client";

import { createContext, useContext, type ReactNode } from "react";

import { useWallet } from "../wallet/WalletProvider";
import { useBalance } from "./useBalance";

/**
 * One reading of the account, shared. The menu shows the balance and the centre
 * decides between funding and a plan — both from the same figure, so funding or
 * a heartbeat updates everywhere at once instead of leaving two copies to drift.
 */
type BalanceContextValue = ReturnType<typeof useBalance>;

const BalanceContext = createContext<BalanceContextValue | null>(null);

export function BalanceProvider({ children }: { children: ReactNode }) {
  const { address } = useWallet();
  const value = useBalance(address);
  return (
    <BalanceContext.Provider value={value}>{children}</BalanceContext.Provider>
  );
}

export function useAccountBalance(): BalanceContextValue {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error("useAccountBalance must be used inside <BalanceProvider>");
  }
  return context;
}
