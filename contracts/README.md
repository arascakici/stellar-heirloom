# registry — heirloom's on-chain notary

A Soroban contract that keeps the **record** of an heirloom plan: who named
whom, after how long a silence, and in which mode. That is the whole of it.

It never holds a balance, never moves an asset, and cannot take an account over
on anyone's behalf. The takeover itself is a CAP-21 precondition transaction the
owner signs off-chain and the network refuses to apply until the account has
truly gone idle — custody stays with the account, and only the paperwork lives
here. A notary, not a vault.

The point of putting the paperwork on chain is discovery: an heir can find out
they were named without anyone having told them, and a watcher can follow a plan
through its life from the events alone.

## Layout

```text
contracts/
├── Cargo.toml                    # workspace: soroban-sdk 26, release profile
├── deployments.md                # deployed ids, hashes, redeploy steps
└── contracts/
    └── registry/
        ├── Cargo.toml
        ├── Makefile              # build / test / fmt shortcuts
        └── src/
            ├── lib.rs            # the contract
            └── test.rs           # 14 unit tests
```

## Interface

Writes — all three require the owner's own authorization:

| Function | What it does |
| --- | --- |
| `register(owner, heir, period, mode)` | Record a plan. One active plan per owner; `period` is seconds of silence and must be non-zero. |
| `heartbeat(owner)` | A sign of life — reset the idle clock the plan is measured against. |
| `cancel(owner)` | Call the plan off. The record is kept and marked `Cancelled` rather than deleted, so the history stays readable and the heir index stays consistent. |

Reads — free, and open to anyone:

| Function | What it returns |
| --- | --- |
| `get_plan(owner)` | The owner's plan if one was ever recorded, cancelled ones included. |
| `plans_for_heir(heir)` | Every plan that currently names this heir. |

`plans_for_heir` walks an index kept under `DataKey::Heirs(heir)`. That index can
go stale — an owner may cancel and re-register naming someone else — so each
candidate is confirmed to still point back at the heir before it is returned.

### Modes

| `Mode` | Meaning |
| --- | --- |
| `Standing` | Ordinary activity is fine. The plan fires only after a true silence, and is called off deliberately. |
| `Sealed` | One-shot. Any transaction at all voids it. |

The contract records the mode; enforcing it is the precondition transaction's
job (`minSeqAge` alone for standing, `minSeqAge` plus `minSeqNum` for sealed).

### Events

Emitted through the `#[contractevent]` macro of soroban-sdk 26 — not the
deprecated `events().publish`. The struct name becomes the first topic in
snake_case, and `#[topic]` fields follow it, so a watcher can filter server-side
on exactly the plans that concern them.

| Event | Topics | Value |
| --- | --- | --- |
| `Registered` | `registered`, owner, heir | `period`, `mode` |
| `Heartbeat` | `heartbeat`, owner | `last_seen` |
| `Cancelled` | `cancelled`, owner, heir | — |

The web app decodes these in `src/lib/stellar/events.ts` and writes them out as
sentences on `/registry`.

### Errors

| Error | When |
| --- | --- |
| `PlanExists` (1) | The owner already holds an active plan. |
| `InvalidPeriod` (2) | `period` was zero. |
| `NoPlan` (3) | Nothing was ever recorded for this owner. |
| `NotActive` (4) | The plan exists but has already been cancelled. |

`NoPlan` and `NotActive` are kept apart deliberately, so the interface can tell
"you never had a plan" from "your plan is already off".

## Storage

Both keys are **persistent**, and every write extends their TTL by thirty days
of ledgers (`17_280 * 30`). A plan that is being kept alive by heartbeats is
therefore never at risk of expiring; a forgotten one eventually archives, which
is the right outcome for a record nobody is maintaining.

## Build, test, deploy

Requires [Rust](https://rustup.rs) with the `wasm32v1-none` target and the
[Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
27 or newer.

```bash
# 14 unit tests — both modes, every error, the heir index
cargo test --manifest-path contracts/Cargo.toml

# optimized wasm at contracts/target/wasm32v1-none/release/registry.wasm
stellar contract build --manifest-path contracts/Cargo.toml

stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/registry.wasm \
  --source <your-identity> --network testnet
```

The tests run in the SDK's simulated environment, `require_auth` included, so
they need no network and no funded account.

Deploying prints a new contract id. Set `NEXT_PUBLIC_REGISTRY_ID` to it and the
frontend follows without a code change; the id baked into `REGISTRY_ID` in
`src/lib/stellar/registry.ts` is only the fallback. Either way, record the
deployment in [`deployments.md`](deployments.md) alongside the existing entries.

## What is deployed

The live contract, its wasm hash, and the transactions that put it there are in
[`deployments.md`](deployments.md). Testnet only: the arming and cancellation
paths are where a bug would cost someone their account, so mainnet stays locked
until those have been reviewed end to end.
