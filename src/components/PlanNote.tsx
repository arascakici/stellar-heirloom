"use client";

import { formatDuration } from "@/lib/stellar/duration";
import { shortenAddress } from "@/lib/stellar/network";
import { PlanMode } from "@/lib/stellar/registry";

import styles from "./PlanNote.module.css";

/**
 * The plan, written on parchment and handed into the chest. It is the same
 * three facts the form asked for, so the person watches what they typed become
 * the thing that gets shut away — the note shrinks into the lock as the halves
 * meet.
 */
export type PlanDraft = {
  heir: string;
  period: bigint;
  mode: PlanMode;
};

/**
 * hidden — not yet handed over, so it can rise into view.
 * shown  — held between the halves.
 * tucked — drawn down into the lock as they meet.
 */
export type NoteState = "hidden" | "shown" | "tucked";

export function PlanNote({
  draft,
  state,
}: {
  draft: PlanDraft;
  state: NoteState;
}) {
  return (
    <div className={styles.note} data-state={state} aria-hidden>
      <span className={`${styles.heir} mono`}>
        {shortenAddress(draft.heir, 4)}
      </span>
      <span className={styles.after}>
        after {formatDuration(draft.period)} of silence
      </span>
      <span className={styles.mode}>
        {draft.mode === PlanMode.Sealed ? "Sealed" : "Standing"}
      </span>
    </div>
  );
}
