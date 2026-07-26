import { Address, nativeToScVal, xdr } from "@stellar/stellar-sdk";

import { invoke as call, read as simulate } from "./call";
import type { TxOutcome } from "./outcome";

/**
 * The heir registry, as the frontend sees it. This module is the one place that
 * knows how heirloom's plans are shaped on chain: how a Plan decodes, and how to
 * read one back. Writing plans (register/heartbeat/cancel) builds on this.
 */

/** The deployed registry. Override for a fresh deployment via env. */
export const REGISTRY_ID =
  process.env.NEXT_PUBLIC_REGISTRY_ID ??
  "CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU";

/** Mirrors the contract's `Mode`. Unit enums cross the wire as their integer. */
export enum PlanMode {
  Standing = 0,
  Sealed = 1,
}

/** Mirrors the contract's `Status`. */
export enum PlanStatus {
  Active = 0,
  Cancelled = 1,
}

export type Plan = {
  owner: string;
  heir: string;
  /** Seconds of silence after which the heir may take over. */
  period: bigint;
  mode: PlanMode;
  status: PlanStatus;
  /** Ledger time of the last sign of life. */
  lastSeen: bigint;
};

/** The raw object `scValToNative` hands back for a Plan — field names as on chain. */
type RawPlan = {
  owner: string;
  heir: string;
  period: bigint;
  mode: number;
  status: number;
  last_seen: bigint;
};

function toPlan(raw: RawPlan): Plan {
  return {
    owner: raw.owner,
    heir: raw.heir,
    period: raw.period,
    mode: raw.mode,
    status: raw.status,
    lastSeen: raw.last_seen,
  };
}

/** Reads and writes, bound to this contract. */
const read = (method: string, source: string, ...args: xdr.ScVal[]) =>
  simulate(REGISTRY_ID, method, source, ...args);
const invoke = (address: string, method: string, ...args: xdr.ScVal[]) =>
  call(REGISTRY_ID, address, method, ...args);

/** The plan recorded for `owner`, or null if there has never been one. */
export async function getPlan(owner: string): Promise<Plan | null> {
  const raw = await read("get_plan", owner, new Address(owner).toScVal());
  return raw ? toPlan(raw as RawPlan) : null;
}

/** Every plan that currently names `heir`. */
export async function plansForHeir(heir: string): Promise<Plan[]> {
  const raw = await read("plans_for_heir", heir, new Address(heir).toScVal());
  return Array.isArray(raw) ? raw.map((p) => toPlan(p as RawPlan)) : [];
}

/** Record a plan. `owner` is the connected account and must sign. */
export function register(
  owner: string,
  heir: string,
  periodSeconds: bigint,
  mode: PlanMode,
): Promise<TxOutcome> {
  return invoke(
    owner,
    "register",
    new Address(owner).toScVal(),
    new Address(heir).toScVal(),
    nativeToScVal(periodSeconds, { type: "u64" }),
    nativeToScVal(mode, { type: "u32" }),
  );
}

/** Reset the idle clock on the owner's plan. */
export function heartbeatPlan(owner: string): Promise<TxOutcome> {
  return invoke(owner, "heartbeat", new Address(owner).toScVal());
}

/** Call off the owner's plan. */
export function cancelPlan(owner: string): Promise<TxOutcome> {
  return invoke(owner, "cancel", new Address(owner).toScVal());
}
