"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useAccountBalance } from "@/lib/stellar/BalanceProvider";
import { useAccountPlans } from "@/lib/stellar/PlanProvider";
import { PlanMode, PlanStatus } from "@/lib/stellar/registry";

import { Chest, type ChestPhase } from "./Chest";
import { PlanCard } from "./PlanCard";
import { PlanNote, type NoteState, type PlanDraft } from "./PlanNote";
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
 *
 * Nothing here cuts. Each step overlaps the one before it — the form is gone
 * before the chest arrives, the chest opens rather than appearing open, and the
 * panel's own height is carried between the two so the page never jumps.
 */
type Ceremony = {
  phase: ChestPhase;
  /** The plan being put away — absent when the chest is merely falling open. */
  draft: PlanDraft | null;
};

/** Beats of the sealing, in milliseconds. Each matches a CSS duration. */
const FORM_OUT = 320;
const OPENING = 700;
const HOLD_OPEN = 560;
const CLOSING = 700;

/** Beats of the breaking, when a plan is called off. */
const BREAKING = 620;
const SURGING = 780;
const SPILLING = 420;
const EMERGING = 640;

/** How long the panel takes to carry its own height between two layouts. */
const MORPH = 560;

export function PlanVault({ owner }: { owner: string }) {
  const { plan, refresh: refreshPlans } = useAccountPlans();
  const { refresh: refreshBalance } = useAccountBalance();

  const [ceremony, setCeremony] = useState<Ceremony | null>(null);
  const [leaving, setLeaving] = useState(false);
  /** True while the form is coming back out of a chest that has just opened. */
  const [emerging, setEmerging] = useState(false);

  const stage = useRef<HTMLDivElement>(null);

  // Timers and frames outlive individual renders, so they are cleared on
  // unmount rather than left to fire into a component that is gone.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const frames = useRef<number[]>([]);
  useEffect(() => {
    const pendingTimers = timers.current;
    const pendingFrames = frames.current;
    return () => {
      for (const id of pendingTimers) clearTimeout(id);
      for (const id of pendingFrames) cancelAnimationFrame(id);
    };
  }, []);

  function after(ms: number, run: () => void) {
    timers.current.push(setTimeout(run, ms));
  }

  /** Run once the browser has painted the state we just set. */
  function nextFrame(run: () => void) {
    frames.current.push(
      requestAnimationFrame(() => {
        frames.current.push(requestAnimationFrame(run));
      }),
    );
  }

  function reducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  /**
   * Swap what the panel holds while animating between the two heights, so the
   * page settles instead of snapping. The new layout is measured by forcing the
   * render through synchronously — the only way to know where we are going.
   */
  function morph(apply: () => void) {
    const el = stage.current;
    if (!el || reducedMotion()) {
      apply();
      return;
    }

    const from = el.getBoundingClientRect().height;
    flushSync(apply);
    const to = el.getBoundingClientRect().height;
    if (Math.abs(from - to) < 2) return;

    el.style.overflow = "hidden";
    el.style.transition = "none";
    el.style.height = `${from}px`;
    void el.offsetHeight; // commit the starting height before transitioning
    el.style.transition = `height ${MORPH}ms cubic-bezier(0.22, 1, 0.36, 1)`;
    el.style.height = `${to}px`;

    after(MORPH + 40, () => {
      el.style.height = "";
      el.style.transition = "";
      el.style.overflow = "";
    });
  }

  const activePlan = plan?.status === PlanStatus.Active ? plan : null;

  function refreshAll() {
    void refreshPlans();
    void refreshBalance();
  }

  /** The plan is on chain; play it into the chest. */
  function handleSealed(draft: PlanDraft) {
    setLeaving(true);

    after(FORM_OUT, () => {
      // The chest arrives shut and unseen, then opens on the next frame.
      morph(() => {
        setLeaving(false);
        setCeremony({ phase: "enter", draft });
      });
      nextFrame(() => setCeremony({ phase: "open", draft }));

      after(OPENING + HOLD_OPEN, () =>
        setCeremony({ phase: "close", draft }),
      );
      after(OPENING + HOLD_OPEN + CLOSING, () => {
        setCeremony({ phase: "sealed", draft });
        refreshAll();
      });
    });
  }

  /**
   * The plan is off. Nothing is holding the chest shut any more, so it breaks
   * open: the seal splits, the chest comes at you as it throws itself wide, and
   * the choices climb back out of it.
   */
  function handleCancelled() {
    // The plan's own card withdraws while the seal is being broken.
    setLeaving(true);
    setCeremony({ phase: "break", draft: null });

    after(BREAKING, () => {
      morph(() => setLeaving(false));
      setCeremony({ phase: "surge", draft: null });
    });

    after(BREAKING + SURGING, () =>
      setCeremony({ phase: "spill", draft: null }),
    );

    after(BREAKING + SURGING + SPILLING, () => {
      // The registry is read before the chest is dismissed, so the plan is
      // already gone by the time the form takes its place — no flash of a card
      // that no longer exists.
      void refreshPlans().then(() => {
        void refreshBalance();
        setEmerging(true);
        morph(() => setCeremony(null));
        after(EMERGING, () => setEmerging(false));
      });
    });
  }

  // The chest is present for the ceremony and for as long as a plan is sealed.
  const showChest = ceremony !== null || activePlan !== null;
  const phase: ChestPhase = ceremony?.phase ?? "sealed";
  const mode =
    (ceremony?.draft?.mode ?? activePlan?.mode) === PlanMode.Sealed
      ? "sealed"
      : "standing";

  const noteState: NoteState =
    ceremony?.phase === "open"
      ? "shown"
      : ceremony?.phase === "enter"
        ? "hidden"
        : "tucked";

  // The card follows the chest once it has shut over the plan, and stays put
  // through the breaking so it can withdraw rather than vanish.
  const showCard =
    activePlan !== null &&
    (ceremony === null ||
      ceremony.phase === "sealed" ||
      ceremony.phase === "break");

  // The form is out of the way from the first beat of the ceremony onwards.
  const showForm = activePlan === null && ceremony === null;

  return (
    <div className={styles.vault} ref={stage}>
      {showChest && (
        <Chest phase={phase} mode={mode}>
          {ceremony?.draft && (
            <PlanNote draft={ceremony.draft} state={noteState} />
          )}
        </Chest>
      )}

      {showForm && (
        <div
          className={styles.swap}
          data-leaving={leaving || undefined}
          data-emerging={emerging || undefined}
        >
          <PlanSetup owner={owner} onSealed={handleSealed} />
        </div>
      )}

      {showCard && activePlan && (
        <div className={styles.swap} data-leaving={leaving || undefined}>
          <PlanCard plan={activePlan} onChanged={handleCancelled} />
        </div>
      )}
    </div>
  );
}
