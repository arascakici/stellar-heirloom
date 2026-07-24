"use client";

import { useEffect, useRef } from "react";

import styles from "./ConfirmDialog.module.css";

type Props = {
  title: string;
  body: string;
  /** The irreversible answer. Rust, because it is the one that costs. */
  confirmLabel: string;
  busyLabel: string;
  dismissLabel: string;
  busy: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  /** Shown inside the dialog, so a failed attempt keeps the question open. */
  children?: React.ReactNode;
};

/**
 * A question the page stops for. Same room-dimming as the wallet picker: the
 * chest goes behind glass and one decision is left in front of it, so nothing
 * irreversible happens as a side effect of a stray click.
 */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  busyLabel,
  dismissLabel,
  busy,
  onConfirm,
  onDismiss,
  children,
}: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onDismiss();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onDismiss]);

  // The answer is where the eye and the keyboard should already be.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onDismiss();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        <h2 className={styles.title} id="confirm-title">
          {title}
        </h2>
        <p className={styles.body}>{body}</p>

        {children}

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.confirm}
            onClick={onConfirm}
            disabled={busy}
            ref={confirmRef}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
          <button
            type="button"
            className={styles.dismiss}
            onClick={onDismiss}
            disabled={busy}
          >
            {dismissLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
