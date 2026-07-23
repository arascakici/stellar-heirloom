"use client";

import { useEffect, useState } from "react";

import { network, shortenAddress } from "@/lib/stellar/network";
import { describeWalletError } from "@/lib/wallet/kit";
import { useWallet } from "@/lib/wallet/WalletProvider";

import { WalletPicker } from "./WalletPicker";
import styles from "./ConnectWallet.module.css";

export function ConnectWallet() {
  const { status, address, error, connect, disconnect } = useWallet();
  const [open, setOpen] = useState(false);

  const connecting = status === "connecting";

  // Close on Escape, and hold the page still while the chest is open.
  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !connecting) setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, connecting]);

  async function handlePick(walletId: string) {
    // Close the chest only once we are actually in; a failure keeps it open so
    // the visitor can pick again or read the error.
    if (await connect(walletId)) setOpen(false);
  }

  // Say nothing until we know the answer, rather than guessing "disconnected".
  if (status === "restoring") {
    return <div className={styles.slot} aria-busy="true" />;
  }

  if (status === "connected" && address) {
    return (
      <div className={styles.pill}>
        <span className={styles.dot} aria-hidden />
        <span className={styles.net}>{network.label}</span>
        <span className={`${styles.address} mono`} title={address}>
          {shortenAddress(address, 4)}
        </span>
        <button
          type="button"
          className={styles.disconnect}
          onClick={disconnect}
          title="Ends the session here. Your wallet keeps its own record of trusted sites — remove heirloom there to revoke it completely."
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className={styles.slot}>
      <button
        type="button"
        className={styles.button}
        onClick={() => setOpen(true)}
      >
        Connect wallet
      </button>

      {open && (
        <div
          className={styles.overlay}
          onClick={() => {
            if (!connecting) setOpen(false);
          }}
        >
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Choose a wallet"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>Choose a wallet</span>
              <button
                type="button"
                className={styles.close}
                onClick={() => setOpen(false)}
                disabled={connecting}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <WalletPicker onPick={handlePick} busy={connecting} />
            {error && (
              <p className={styles.error} role="alert">
                {describeWalletError(error)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
