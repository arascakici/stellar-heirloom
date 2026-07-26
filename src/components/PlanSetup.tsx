"use client";

import { useEffect, useState } from "react";

import { StrKey } from "@stellar/stellar-sdk";

import { canMerge, Delivery } from "@/lib/stellar/envelope";
import { fetchAccountFacts } from "@/lib/stellar/horizon";
import type { TxOutcome } from "@/lib/stellar/outcome";
import { PlanMode } from "@/lib/stellar/registry";
import { sealPlan, type SealStep } from "@/lib/stellar/seal";

import type { PlanDraft } from "./PlanNote";
import { TransactionResult } from "./TransactionResult";
import styles from "./PlanSetup.module.css";

const UNITS = [
  { label: "days", seconds: 86_400n },
  { label: "hours", seconds: 3_600n },
  { label: "minutes", seconds: 60n },
];

const MODES = [
  {
    value: PlanMode.Standing,
    name: "Standing",
    blurb: "Everyday use is fine. The plan waits for a real silence, and you cancel it deliberately.",
  },
  {
    value: PlanMode.Sealed,
    name: "Sealed",
    blurb: "One-shot. Any transaction at all voids the plan. For a wallet you mean to leave still.",
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

/** What the button says while the three signatures are collected. */
const STEP_LABEL: Record<SealStep, string> = {
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
  const [heir, setHeir] = useState("");
  const [amount, setAmount] = useState("30");
  const [unitIdx, setUnitIdx] = useState(0);
  const [mode, setMode] = useState<PlanMode>(PlanMode.Standing);
  const [delivery, setDelivery] = useState<Delivery>(Delivery.Handover);
  const [step, setStep] = useState<SealStep | null>(null);
  const [result, setResult] = useState<TxOutcome | null>(null);
  /** null while we have not yet heard back about the account. */
  const [subentries, setSubentries] = useState<number | null>(null);

  // Whether a merge is even possible depends on what the account carries, so
  // ask rather than offer something the chain would refuse.
  useEffect(() => {
    let cancelled = false;
    fetchAccountFacts(owner)
      .then((facts) => {
        if (!cancelled) setSubentries(facts?.subentryCount ?? 0);
      })
      .catch(() => {
        if (!cancelled) setSubentries(null);
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);

  const mergeAllowed = subentries !== null && canMerge(subentries);
  const pending = step !== null;

  const trimmedHeir = heir.trim();
  const heirValid = StrKey.isValidEd25519PublicKey(trimmedHeir);
  const heirIsOwner = trimmedHeir === owner;
  const amountNum = Number(amount);
  const amountValid = Number.isInteger(amountNum) && amountNum > 0;
  const canSubmit = heirValid && !heirIsOwner && amountValid && !pending;

  // Derived rather than corrected: if the account turns out to carry subentries
  // — or grows one while the form is open — the merge choice simply stops
  // being the answer, without a render cascade to walk it back.
  const chosenDelivery =
    delivery === Delivery.Merge && !mergeAllowed ? Delivery.Handover : delivery;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setResult(null);

    const period = BigInt(amountNum) * UNITS[unitIdx].seconds;
    const outcome = await sealPlan({
      owner,
      heir: trimmedHeir,
      period,
      mode,
      delivery: chosenDelivery,
      onStep: setStep,
    });

    setStep(null);

    if (outcome.ok) {
      onSealed({ heir: trimmedHeir, period, mode });
      return;
    }

    setResult(outcome);
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <p className={styles.intro}>
        Name who inherits this account, and how long a silence must pass before
        they can take it over.
      </p>

      <label className={styles.field}>
        <span className={styles.label}>Heir address</span>
        <input
          className={`${styles.input} mono`}
          value={heir}
          onChange={(event) => setHeir(event.target.value)}
          placeholder="G…"
          spellCheck={false}
          autoComplete="off"
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
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Silence before takeover</span>
        <div className={styles.duration}>
          <input
            className={styles.number}
            type="number"
            min={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
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
      </label>

      <fieldset className={styles.modes}>
        <legend className={styles.label}>Mode</legend>
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

      <fieldset className={styles.modes}>
        <legend className={styles.label}>Delivery</legend>
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
              {blocked && subentries !== null && subentries > 0 && (
                <span className={styles.blocked}>
                  Not available: this account carries {subentries}{" "}
                  {subentries === 1
                    ? "trustline or extra signer"
                    : "trustlines or extra signers"}
                  , and the network refuses to merge an account holding anything
                  besides lumens.
                </span>
              )}
            </label>
          );
        })}
      </fieldset>

      <p className={styles.note}>
        Sealing takes three signatures: one to record the plan, one for the
        takeover itself — the transaction nobody submits — and one to place it in
        the vault. They cannot be combined; Stellar allows a single contract call
        per transaction.
      </p>

      <button type="submit" className={styles.submit} disabled={!canSubmit}>
        {step ? STEP_LABEL[step] : "Seal the plan"}
      </button>

      {result && (
        <TransactionResult outcome={result} successLabel="Plan sealed." />
      )}
    </form>
  );
}
