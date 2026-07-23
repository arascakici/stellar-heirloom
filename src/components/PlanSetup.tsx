"use client";

import { useState } from "react";

import { StrKey } from "@stellar/stellar-sdk";

import type { TxOutcome } from "@/lib/stellar/outcome";
import { PlanMode, register } from "@/lib/stellar/registry";

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

type Props = {
  owner: string;
  /** Called after a plan is recorded, so the view above can refresh. */
  onSealed: () => void;
};

export function PlanSetup({ owner, onSealed }: Props) {
  const [heir, setHeir] = useState("");
  const [amount, setAmount] = useState("30");
  const [unitIdx, setUnitIdx] = useState(0);
  const [mode, setMode] = useState<PlanMode>(PlanMode.Standing);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TxOutcome | null>(null);

  const trimmedHeir = heir.trim();
  const heirValid = StrKey.isValidEd25519PublicKey(trimmedHeir);
  const amountNum = Number(amount);
  const amountValid = Number.isInteger(amountNum) && amountNum > 0;
  const canSubmit = heirValid && amountValid && !pending;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setPending(true);
    setResult(null);

    const period = BigInt(amountNum) * UNITS[unitIdx].seconds;
    const outcome = await register(owner, trimmedHeir, period, mode);

    setResult(outcome);
    setPending(false);
    if (outcome.ok) onSealed();
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

      <button type="submit" className={styles.submit} disabled={!canSubmit}>
        {pending ? "Sealing on chain…" : "Seal the plan"}
      </button>

      {result && (
        <TransactionResult outcome={result} successLabel="Plan sealed." />
      )}
    </form>
  );
}
