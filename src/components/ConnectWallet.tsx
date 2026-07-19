"use client";

import { network, shortenAddress } from "@/lib/stellar/network";
import { describeWalletError } from "@/lib/wallet/freighter";
import { useWallet } from "@/lib/wallet/WalletProvider";

import styles from "./ConnectWallet.module.css";

export function ConnectWallet() {
  const { status, address, error, connect, disconnect } = useWallet();

  // Say nothing until we know the answer, rather than guessing "disconnected".
  if (status === "restoring") {
    return <div className={styles.wrap} aria-busy="true" />;
  }

  if (status === "connected" && address) {
    return (
      <div className={styles.connected}>
        <span className={styles.label}>Connected on {network.label}</span>
        <span className={`${styles.address} mono`} title={address}>
          {shortenAddress(address, 6)}
        </span>
        <button type="button" className={styles.quiet} onClick={disconnect}>
          Disconnect
        </button>
        <p className={styles.aside}>
          This ends the session here. Freighter keeps its own record of sites it
          trusts — remove heirloom there to revoke it completely.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.button}
        onClick={connect}
        disabled={status === "connecting"}
      >
        {status === "connecting" ? "Waiting for Freighter…" : "Connect wallet"}
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
