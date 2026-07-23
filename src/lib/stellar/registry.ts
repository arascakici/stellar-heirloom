import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  rpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { network } from "./network";
import { soroban } from "./soroban";

/**
 * The heir registry, as the frontend sees it. This module is the one place that
 * knows how heirloom's plans are shaped on chain: how a Plan decodes, and how to
 * read one back. Writing plans (register/heartbeat/cancel) builds on this.
 */

/** The deployed registry. Override for a fresh deployment via env. */
export const REGISTRY_ID =
  process.env.NEXT_PUBLIC_REGISTRY_ID ??
  "CBIBPVG7QXJWUWIFOL3LZRIR37YYKBOAM5YIUEP74RJHB35YXT2OKXTG";

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

const contract = new Contract(REGISTRY_ID);

/**
 * Run a read-only contract method by simulating it — no signature, no fee, no
 * ledger write. The subject address doubles as the simulation source, which is
 * always a valid account id, so no funded account is needed to read.
 */
async function read(
  method: string,
  source: string,
  ...args: xdr.ScVal[]
): Promise<unknown> {
  const tx = new TransactionBuilder(new Account(source, "0"), {
    fee: BASE_FEE,
    networkPassphrase: network.passphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await soroban.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error);
  }

  const retval = sim.result?.retval;
  return retval ? scValToNative(retval) : null;
}

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
