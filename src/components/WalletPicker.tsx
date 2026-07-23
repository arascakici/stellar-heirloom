"use client";

import { useEffect, useState } from "react";

import { listWallets, type WalletChoice } from "@/lib/wallet/kit";

import styles from "./WalletPicker.module.css";

type Props = {
  /** Chosen wallet id, for an available wallet the visitor clicked. */
  onPick: (walletId: string) => void;
  /** True while a connection is in flight, so the list stops taking input. */
  busy: boolean;
};

/**
 * Our own wallet chooser, drawn in heirloom's own hand rather than the kit's
 * stock modal. Available wallets are keys you can turn; the rest show where to
 * get them.
 */
export function WalletPicker({ onPick, busy }: Props) {
  const [wallets, setWallets] = useState<WalletChoice[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listWallets().then((list) => {
      if (!cancelled) setWallets(list);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!wallets) {
    return <p className={styles.loading}>Looking for wallets…</p>;
  }

  return (
    <ul className={styles.list}>
      {wallets.map((wallet) =>
        wallet.available ? (
          <li key={wallet.id}>
            <button
              type="button"
              className={styles.choice}
              onClick={() => onPick(wallet.id)}
              disabled={busy}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.icon} src={wallet.icon} alt="" aria-hidden />
              <span className={styles.name}>{wallet.name}</span>
            </button>
          </li>
        ) : (
          <li key={wallet.id} className={styles.unavailable}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.icon} src={wallet.icon} alt="" aria-hidden />
            <span className={styles.name}>{wallet.name}</span>
            <a
              className={styles.install}
              href={wallet.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Install ↗
            </a>
          </li>
        ),
      )}
    </ul>
  );
}
