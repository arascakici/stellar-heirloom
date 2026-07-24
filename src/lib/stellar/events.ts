import { rpc, scValToNative, type xdr } from "@stellar/stellar-sdk";

import { PlanMode, REGISTRY_ID } from "./registry";
import { soroban } from "./soroban";

/**
 * What the registry has witnessed.
 *
 * The contract publishes three events, each naming the parties in its topics so
 * they can be filtered without decoding the body:
 *
 *   registered — topics [name, owner, heir], body { period, mode }
 *   heartbeat  — topics [name, owner],       body { last_seen }
 *   cancelled  — topics [name, owner, heir], body {}
 *
 * These shapes are not guessed: they were read back off testnet from real
 * emissions before this decoder was written.
 */
export type RegistryEventKind = "registered" | "heartbeat" | "cancelled";

export type RegistryEvent = {
  /** RPC's own id, unique and ordered — safe as a React key and a cursor. */
  id: string;
  kind: RegistryEventKind;
  owner: string;
  /** Absent on a heartbeat, which names no heir. */
  heir: string | null;
  period: bigint | null;
  mode: PlanMode | null;
  lastSeen: bigint | null;
  ledger: number;
  /** When the ledger closed, ISO-8601. */
  at: string;
  txHash: string;
};

export type EventPage = {
  events: RegistryEvent[];
  /** Feed this back in to carry on from where this page stopped. */
  cursor: string | null;
};

/**
 * How far back a cold start looks. Soroban RPC scans only a bounded stretch of
 * ledgers per request, so asking from too far back returns an empty page and a
 * cursor rather than the events in between — measured against testnet, roughly
 * five thousand ledgers is the most that answers in one hop.
 */
const LOOKBACK_LEDGERS = 5_000;

const KINDS: RegistryEventKind[] = ["registered", "heartbeat", "cancelled"];

function isKind(value: unknown): value is RegistryEventKind {
  return (
    typeof value === "string" && KINDS.includes(value as RegistryEventKind)
  );
}

/** Decode one raw event, or null if it is not one of ours. */
function toRegistryEvent(raw: rpc.Api.EventResponse): RegistryEvent | null {
  let topics: unknown[];
  let body: Record<string, unknown>;

  try {
    topics = raw.topic.map((t: xdr.ScVal) => scValToNative(t));
    const decoded = scValToNative(raw.value) as unknown;
    body =
      decoded && typeof decoded === "object"
        ? (decoded as Record<string, unknown>)
        : {};
  } catch {
    // A contract we do not know, or a shape we cannot read: skip it rather
    // than take the whole feed down.
    return null;
  }

  const [name, owner, heir] = topics;
  if (!isKind(name) || typeof owner !== "string") return null;

  return {
    id: raw.id,
    kind: name,
    owner,
    heir: typeof heir === "string" ? heir : null,
    period: typeof body.period === "bigint" ? body.period : null,
    mode: typeof body.mode === "number" ? (body.mode as PlanMode) : null,
    lastSeen: typeof body.last_seen === "bigint" ? body.last_seen : null,
    ledger: raw.ledger,
    at: raw.ledgerClosedAt,
    txHash: raw.txHash,
  };
}

/**
 * Read a page of registry events. Pass the cursor from the previous page to
 * pick up only what has happened since; omit it to start from a recent window.
 */
export async function fetchRegistryEvents(
  cursor?: string | null,
): Promise<EventPage> {
  const filters = [
    { type: "contract" as const, contractIds: [REGISTRY_ID] },
  ];

  const request = cursor
    ? { cursor, filters, limit: 40 }
    : {
        startLedger: Math.max(
          (await soroban.getLatestLedger()).sequence - LOOKBACK_LEDGERS,
          1,
        ),
        filters,
        limit: 40,
      };

  const page = await soroban.getEvents(request);

  return {
    events: page.events
      .map(toRegistryEvent)
      .filter((event): event is RegistryEvent => event !== null),
    cursor: page.cursor ?? null,
  };
}

/** True when this event concerns the given account, either side of the plan. */
export function concerns(event: RegistryEvent, address: string): boolean {
  return event.owner === address || event.heir === address;
}
