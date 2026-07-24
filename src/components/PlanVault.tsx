"use client";

import { useEffect, useRef, useState } from "react";

import { useAccountBalance } from "@/lib/stellar/BalanceProvider";
import { useAccountPlans } from "@/lib/stellar/PlanProvider";
import { PlanMode, PlanStatus } from "@/lib/stellar/registry";

import { Chest, type ChestPhase } from "./Chest";
import { PlanCard } from "./PlanCard";
import { PlanNote, type PlanDraft } from "./PlanNote";
import { PlanSetup } from "./PlanSetup";
import styles from "./PlanVault.module.css";

/**
 * Where a plan is made and where it rests.
 *
 * Naming an heir gets the screen to itself — a form and nothing else, because
 * that is the one moment the person is doing work. The chest only arrives to
 * take what they wrote: the halves draw apart, the plan hangs between them,
 * they close, and a seal is struck. After that the chest stays shut above the
 * plan it holds.
 */
type Ceremony = {
  phase: ChestPhase;
  /** The plan being put away — absent when the chest is simply opening. */
  draft: PlanDraft | null;
};

/** Beats of the sealing, in milliseconds. */
const HOLD_OPEN = 460;
const CLOSING = 660;

export function PlanVault({ owner }: { owner: string }) {
  const { plan, refresh: refreshPlans } = useAccountPlans();
  const { refresh: refreshBalance } = useAccountBalance();
  const [ceremony, setCeremony] = useState<Ceremony | null>(null);

  // Timers outlive individual renders, so they are cleared on unmount rather
  // than left to fire into a component that is gone.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) clearTimeout(id);
    };
  }, []);

  function after(ms: number, run: () => void) {
    timers.current.push(setTimeout(run, ms));
  }

  const activePlan = plan?.status === PlanStatus.Active ? plan : null;

  function refreshAll() {
    void refreshPlans();
    void refreshBalance();
  }

  /** The plan is on chain; play it into the chest. */
  function handleSealed(draft: PlanDraft) {
    setCeremony({ phase: "open", draft });
    after(HOLD_OPEN, () => setCeremony({ phase: "close", draft }));
    after(HOLD_OPEN + CLOSING, () => {
      setCeremony({ phase: "sealed", draft });
      refreshAll();
    });
  }

  /** The plan is off; let the chest fall open before the form returns. */
  function handleCancelled() {
    setCeremony({ phase: "open", draft: null });
    after(CLOSING, () => {
      setCeremony(null);
      refreshAll();
    });
  }

  // The chest is present for the ceremony and for as long as a plan is sealed.
  const showChest = ceremony !== null || activePlan !== null;
  const phase: ChestPhase = ceremony?.phase ?? "sealed";
  const mode =
    (ceremony?.draft?.mode ?? activePlan?.mode) === PlanMode.Sealed
      ? "sealed"
      : "standing";

  // The card follows the chest only once it has shut over the plan.
  const showCard =
    activePlan !== null && (ceremony === null || ceremony.phase === "sealed");

  // The form is out of the way from the first beat of the ceremony onwards.
  const showForm = activePlan === null && ceremony === null;

  return (
    <div className={styles.vault}>
      {showChest && (
        <Chest phase={phase} mode={mode}>
          {ceremony?.draft && (
            <PlanNote
              draft={ceremony.draft}
              tucked={ceremony.phase !== "open"}
            />
          )}
        </Chest>
      )}

      {showForm && <PlanSetup owner={owner} onSealed={handleSealed} />}

      {showCard && activePlan && (
        <PlanCard plan={activePlan} onChanged={handleCancelled} />
      )}
    </div>
  );
}
