"use client";

import { useState } from "react";

import {
  connectWallet,
  describeWalletError,
  type WalletError,
} from "@/lib/wallet/freighter";
import { network, shortenAddress } from "@/lib/stellar/network";

import styles from "./ConnectWallet.module.css";

export function ConnectWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [error, setError] = useState<WalletError | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleConnect() {
    setBusy(true);
    setError(null);

    const result = await connectWallet();
    if (result.ok) {
      setAddress(result.address);
    } else {
      setError(result.error);
    }

    setBusy(false);
  }

  if (address) {
    return (
      <div className={styles.connected}>
        <span className={styles.label}>Connected on {network.label}</span>
        <span className={`${styles.address} mono`} title={address}>
          {shortenAddress(address, 6)}
        </span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={handleConnect}
        disabled={busy}
      >
        {busy ? "Waiting for Freighter…" : "Connect wallet"}
      </button>

      {error && (
        <p className={styles.error} role="alert">
          {describeWalletError(error)}
          {error.kind === "not-installed" && (
            <>
              {" "}
              <a
                href="https://www.freighter.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Install it
              </a>
              , then reload this page.
            </>
          )}
        </p>
      )}
    </div>
  );
}
