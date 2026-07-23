"use client";

import { useEffect, useRef, useState } from "react";

import { useAccountBalance } from "@/lib/stellar/BalanceProvider";
import { network, shortenAddress } from "@/lib/stellar/network";
import { useWallet } from "@/lib/wallet/WalletProvider";

import { Balance } from "./Balance";
import { Heartbeat } from "./Heartbeat";
import styles from "./AccountMenu.module.css";

/**
 * The connected account, folded into the bar. A glass chip you tap to drop the
 * account down: what you hold, the sign of life, and the way out. Everything
 * about *this account* lives here so the page beneath can be about the plan.
 */
export function AccountMenu() {
  const { address, disconnect } = useWallet();
  const { balance, refreshing, refresh } = useAccountBalance();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!address) return null;

  return (
    <div className={styles.root} ref={root}>
      <button
        type="button"
        className={styles.chip}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={styles.dot} aria-hidden />
        <span className={styles.net}>{network.label}</span>
        <span className={`${styles.address} mono`} title={address}>
          {shortenAddress(address, 4)}
        </span>
        <span className={styles.chevron} data-open={open || undefined} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div className={styles.dropdown} role="menu">
          {balance?.funded ? (
            <>
              <Balance balance={balance} refreshing={refreshing} compact />
              <Heartbeat address={address} onSent={refresh} />
            </>
          ) : (
            <p className={styles.note}>
              This account isn’t funded yet. Fund it below to send a heartbeat.
            </p>
          )}
          <button
            type="button"
            className={styles.disconnect}
            onClick={disconnect}
            title="Ends the session here. Your wallet keeps its own record of trusted sites — remove heirloom there to revoke it completely."
          >
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}
