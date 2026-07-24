"use client";

import { useId, type ReactNode } from "react";

import styles from "./Chest.module.css";

/**
 * The chest, as an act rather than an ornament.
 *
 * It is drawn in two halves that meet: the lid comes down from above, the body
 * rises from below, and whatever is handed in as `children` — the plan, written
 * out — is closed inside. That is the whole mechanism in one gesture, which is
 * why the chest only appears at the moment of sealing and while a plan is
 * sealed. The form to name an heir gets the screen to itself.
 *
 *   shut   — closed and quiet, the emblem on the landing.
 *   open   — the halves are drawn apart, the plan hanging between them.
 *   close  — they come together over it.
 *   sealed — shut, with a seal struck on the lock.
 *
 * Artwork: "Chest" by Delapouite (game-icons.net), CC BY 3.0. Recoloured to the
 * wood-and-brass palette and split into lid, body and lock so the halves can be
 * moved independently.
 */
export type ChestPhase = "shut" | "open" | "close" | "sealed";

type Props = {
  phase: ChestPhase;
  /** Standing plans take a brass ring; sealed ones take wax. */
  mode?: "standing" | "sealed";
  /** The plan itself, held between the halves until they shut. */
  children?: ReactNode;
};

export function Chest({ phase, mode = "standing", children }: Props) {
  // Two chests on one page would otherwise fight over the same gradient ids.
  const uid = useId().replace(/:/g, "");
  const woodId = `chest-wood-${uid}`;
  const glowId = `chest-glow-${uid}`;

  return (
    <div className={styles.stage} data-phase={phase} data-mode={mode}>
      <div className={styles.box}>
        {/* Body: the lower half, with the lock, the light and the seal. */}
        <svg className={`${styles.half} ${styles.base}`} viewBox="0 0 512 512" aria-hidden>
          <defs>
            {/*
             * Stop colours are set in CSS, not as presentation attributes: a
             * `stop-color="var(--x)"` attribute is not resolved as a custom
             * property, and the chest would come out black.
             */}
            <linearGradient id={woodId} x1="0" y1="0" x2="0" y2="1">
              <stop className={styles.woodTop} offset="0%" />
              <stop className={styles.woodBottom} offset="100%" />
            </linearGradient>
            <radialGradient id={glowId} cx="50%" cy="45%" r="55%">
              <stop offset="0%" stopColor="rgba(242,233,218,0.7)" />
              <stop offset="45%" stopColor="rgba(224,184,110,0.36)" />
              <stop offset="100%" stopColor="rgba(201,154,69,0)" />
            </radialGradient>
          </defs>

          <ellipse
            className={styles.glow}
            cx="256"
            cy="235"
            rx="210"
            ry="130"
            fill={`url(#${glowId})`}
          />
          <path
            fill={`url(#${woodId})`}
            d="M41 229.8v127.915l19.334 18.23V229.8H41zM78.334 229.8v158h355.332v-158H302.334v105.6h-92.668V229.8H78.334zM451.666 229.8v146.145L471 357.715V229.8h-19.334zM41 382.456V423h43.002L41 382.455zM471 382.456L427.998 423H471v-40.545zM92 405.8l18.24 17.2h291.52L420 405.8H92z"
          />
          <path
            className={styles.lock}
            d="M227.666 212.2v105.2h56.668V212.2h-56.668z"
          />
          <path
            className={styles.keyhole}
            d="M256 223.794a18.667 16.103 0 0 1 18.666 16.1 18.667 16.103 0 0 1-9.666 14.09v37.214h-18V254a18.667 16.103 0 0 1-9.666-14.106 18.667 16.103 0 0 1 18.666-16.1z"
          />

          <g className={styles.seal}>
            <circle className={styles.sealRing} cx="256" cy="250" r="30" />
            <circle className={styles.sealWax} cx="256" cy="250" r="26" />
          </g>
          <ellipse
            className={styles.flare}
            cx="256"
            cy="250"
            rx="120"
            ry="120"
            fill={`url(#${glowId})`}
          />
        </svg>

        {/* Lid: the upper half. */}
        <svg className={`${styles.half} ${styles.lid}`} viewBox="0 0 512 512" aria-hidden>
          <path
            fill={`url(#${woodId})`}
            d="M58.553 89L42.27 211.8H79V89H58.553zM97 89v122.8h38V89H97zM153 89v122.8h56.666v-17.6h92.668v17.6H359V89H153zM377 89v122.8h38V89h-38zM433 89v122.8h36.73L453.446 89H433z"
          />
        </svg>

        {children}
      </div>
    </div>
  );
}
