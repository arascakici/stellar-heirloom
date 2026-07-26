"use client";

import { useEffect, useState } from "react";

import { StrKey } from "@stellar/stellar-sdk";

import { formatDuration } from "@/lib/stellar/duration";
import { canMerge, Delivery } from "@/lib/stellar/envelope";
import { fetchAccountFacts } from "@/lib/stellar/horizon";
import { shortenAddress } from "@/lib/stellar/network";
import type { TxOutcome } from "@/lib/stellar/outcome";
import { PlanMode } from "@/lib/stellar/registry";
import { sealPlan, type SealStep } from "@/lib/stellar/seal";

import type { PlanDraft } from "./PlanNote";
import { TransactionResult } from "./TransactionResult";
import styles from "./PlanSetup.module.css";

/**
 * Naming an heir, one question at a time.
 *
 * All of it at once ran past the bottom of the screen on a phone and most of
 * the way down a laptop, which is a poor way to ask someone to think about
 * what happens after they are gone. Each choice now gets the screen to itself,
 * and the last step reads the whole arrangement back before anything is signed.
 */

const UNITS = [
  { label: "days", seconds: 86_400n },
  { label: "hours", seconds: 3_600n },
  { label: "minutes", seconds: 60n },
];

const MODES = [
  {
    value: PlanMode.Standing,
    name: "Standing",
    blurb:
      "Everyday use is fine. The plan waits for a real silence, and you cancel it deliberately.",
  },
  {
    value: PlanMode.Sealed,
    name: "Sealed",
    blurb:
      "One-shot. Any transaction at all voids the plan. For a wallet you mean to leave still.",
  },
];

const DELIVERIES = [
  {
    value: Delivery.Handover,
    name: "Handover",
    blurb:
      "Your heir gains control of this account. Nothing moves and nothing is sold — whatever it holds, it keeps holding.",
  },
  {
    value: Delivery.Merge,
    name: "Merge",
    blurb:
      "Every lumen moves into your heir’s own wallet and this account closes for good. Only possible while it holds nothing but XLM.",
  },
];

const STEPS = ["heir", "silence", "mode", "delivery", "review"] as const;
type Step = (typeof STEPS)[number];

const TITLE: Record<Step, string> = {
  heir: "Who inherits this account?",
  silence: "How long a silence?",
  mode: "What should everyday use do?",
  delivery: "How should it change hands?",
  review: "Is this right?",
};

/** What the button says while the three signatures are collected. */
const SEALING: Record<SealStep, string> = {
  recording: "Recording the plan…",
  signing: "Sign the takeover…",
  storing: "Sealing the package…",
};

type Props = {
  owner: string;
  /**
   * Called once the plan is on chain, with what was just sealed. The ceremony
   * above takes the success from here — the form only keeps its failures.
   */
  onSealed: (draft: PlanDraft) => void;
};

export function PlanSetup({ owner, onSealed }: Props) {
  const [stepIdx, setStepIdx] = useState(0);
  const [heir, setHeir] = useState("");
  const [amount, setAmount] = useState("30");
  const [unitIdx, setUnitIdx] = useState(0);
  const [mode, setMode] = useState<PlanMode>(PlanMode.Standing);
  const [delivery, setDelivery] = useState<Delivery>(Delivery.Handover);
  const [sealing, setSealing] = useState<SealStep | null>(null);
  const [result, setResult] = useState<TxOutcome | null>(null);

  /**
   * What the account carries, once we have heard back. `undefined` while the
   * question is still out; `null` if it could not be answered at all — the two
   * are kept apart so the interface never blocks a choice without saying why.
   */
  const [subentries, setSubentries] = useState<number | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let cancelled = false;
    fetchAccountFacts(owner)
      .then((facts) => {
        if (!cancelled) setSubentries(facts ? facts.subentryCount : null);
      })
      .catch(() => {
        if (!cancelled) setSubentries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);

  const step = STEPS[stepIdx];
  const pending = sealing !== null;

  const trimmedHeir = heir.trim();
  const heirValid = StrKey.isValidEd25519PublicKey(trimmedHeir);
  const heirIsOwner = trimmedHeir === owner;
  const amountNum = Number(amount);
  const amountValid = Number.isInteger(amountNum) && amountNum > 0;
  const period = amountValid
    ? BigInt(amountNum) * UNITS[unitIdx].seconds
    : 0n;

  const mergeAllowed = typeof subentries === "number" && canMerge(subentries);
  // Derived rather than corrected: an account that turns out to carry
  // subentries simply stops having merge as an answer.
  const chosenDelivery =
    delivery === Delivery.Merge && !mergeAllowed ? Delivery.Handover : delivery;

  const stepReady =
    step === "heir"
      ? heirValid && !heirIsOwner
      : step === "silence"
        ? amountValid
        : true;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (step !== "review" || pending) return;

    setResult(null);
    const outcome = await sealPlan({
      owner,
      heir: trimmedHeir,
      period,
      mode,
      delivery: chosenDelivery,
      onStep: setSealing,
    });
    setSealing(null);

    if (outcome.ok) {
      onSealed({ heir: trimmedHeir, period, mode });
      return;
    }
    setResult(outcome);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.progress}>
        <span className={styles.count}>
          Step {stepIdx + 1} of {STEPS.length}
        </span>
        <div className={styles.pips} aria-hidden>
          {STEPS.map((name, index) => (
            <span
              key={name}
              className={styles.pip}
              data-on={index <= stepIdx ? "" : undefined}
            />
          ))}
        </div>
      </div>

      <h2 className={styles.question}>{TITLE[step]}</h2>

      {step === "heir" && (
        <label className={styles.field}>
          <span className={styles.label}>Heir address</span>
          <input
            className={`${styles.input} mono`}
            value={heir}
            onChange={(event) => setHeir(event.target.value)}
            placeholder="G…"
            spellCheck={false}
            autoComplete="off"
            autoFocus
          />
          {heir.length > 0 && !heirValid && (
            <span className={styles.hint}>That isn’t a valid Stellar address.</span>
          )}
          {heirValid && heirIsOwner && (
            <span className={styles.hint}>
              An account cannot inherit from itself. Name a different wallet — a
              spare of your own will do.
            </span>
          )}
          <span className={styles.note}>
            It can be a wallet you already own. Lose your keys, this account goes
            quiet on its own, and the spare takes over.
          </span>
        </label>
      )}

      {step === "silence" && (
        <label className={styles.field}>
          <span className={styles.label}>Silence before takeover</span>
          <div className={styles.duration}>
            <input
              className={styles.number}
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              autoFocus
            />
            <select
              className={styles.unit}
              value={unitIdx}
              onChange={(event) => setUnitIdx(Number(event.target.value))}
            >
              {UNITS.map((unit, index) => (
                <option key={unit.label} value={index}>
                  {unit.label}
                </option>
              ))}
            </select>
          </div>
          <span className={styles.note}>
            The clock counts from your last transaction, and any transaction
            winds it back to the beginning.
          </span>
        </label>
      )}

      {step === "mode" && (
        <fieldset className={styles.modes}>
          <legend className={styles.srOnly}>Mode</legend>
          {MODES.map((option) => (
            <label
              key={option.name}
              className={`${styles.mode} ${mode === option.value ? styles.modeOn : ""}`}
            >
              <input
                type="radio"
                name="mode"
                className={styles.radio}
                checked={mode === option.value}
                onChange={() => setMode(option.value)}
              />
              <span className={styles.modeName}>{option.name}</span>
              <span className={styles.modeBlurb}>{option.blurb}</span>
            </label>
          ))}
        </fieldset>
      )}

      {step === "delivery" && (
        <fieldset className={styles.modes}>
          <legend className={styles.srOnly}>Delivery</legend>
          {DELIVERIES.map((option) => {
            const blocked = option.value === Delivery.Merge && !mergeAllowed;
            return (
              <label
                key={option.name}
                className={[
                  styles.mode,
                  chosenDelivery === option.value ? styles.modeOn : "",
                  blocked ? styles.modeOff : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <input
                  type="radio"
                  name="delivery"
                  className={styles.radio}
                  checked={chosenDelivery === option.value}
                  disabled={blocked}
                  onChange={() => setDelivery(option.value)}
                />
                <span className={styles.modeName}>{option.name}</span>
                <span className={styles.modeBlurb}>{option.blurb}</span>
                {blocked && (
                  <span className={styles.blocked}>
                    {mergeReason(subentries)}
                  </span>
                )}
              </label>
            );
          })}
        </fieldset>
      )}

      {step === "review" && (
        <>
          <dl className={styles.review}>
            <div className={styles.row}>
              <dt className={styles.label}>Heir</dt>
              <dd className={`${styles.value} mono`} title={trimmedHeir}>
                {shortenAddress(trimmedHeir, 6)}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.label}>Silence</dt>
              <dd className={styles.value}>{formatDuration(period)}</dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.label}>Mode</dt>
              <dd className={styles.value}>
                {mode === PlanMode.Sealed ? "Sealed" : "Standing"}
              </dd>
            </div>
            <div className={styles.row}>
              <dt className={styles.label}>Delivery</dt>
              <dd className={styles.value}>
                {chosenDelivery === Delivery.Merge ? "Merge" : "Handover"}
              </dd>
            </div>
          </dl>

          <p className={styles.note}>
            Sealing takes three signatures: one to record the plan, one for the
            takeover itself — the transaction nobody submits — and one to place
            it in the vault. They cannot be combined; Stellar allows a single
            contract call per transaction.
          </p>
        </>
      )}

      <div className={styles.nav}>
        {stepIdx > 0 && (
          <button
            type="button"
            className={styles.back}
            onClick={() => setStepIdx(stepIdx - 1)}
            disabled={pending}
          >
            Back
          </button>
        )}

        {step === "review" ? (
          <button type="submit" className={styles.submit} disabled={pending}>
            {sealing ? SEALING[sealing] : "Seal the plan"}
          </button>
        ) : (
          <button
            type="button"
            className={styles.submit}
            onClick={() => setStepIdx(stepIdx + 1)}
            disabled={!stepReady}
          >
            Continue
          </button>
        )}
      </div>

      {result && (
        <TransactionResult outcome={result} successLabel="Plan sealed." />
      )}
    </form>
  );
}

/**
 * Never block a choice without saying why. The three cases are genuinely
 * different: still asking, could not ask, and asked and the answer was no.
 */
function mergeReason(subentries: number | null | undefined): string {
  if (subentries === undefined) {
    return "Checking what this account holds…";
  }
  if (subentries === null) {
    return "This account could not be read just now, so merge is held back rather than offered blindly. Handover works either way.";
  }
  return `Not available: this account carries ${subentries} ${
    subentries === 1 ? "trustline or extra signer" : "trustlines or extra signers"
  }, and the network refuses to merge an account holding anything besides lumens.`;
}
