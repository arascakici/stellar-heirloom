# heirloom's contracts

Two Soroban contracts, each with one job.

**`registry`** keeps the **record** of a plan: who named whom, after how long a
silence, and in which mode. **`vault`** keeps the **package**: the transaction
the owner signed but nobody submitted, which hands the account over when that
silence runs out.

Neither holds a balance, moves an asset, or can take an account over on anyone's
behalf. The takeover is a CAP-21 precondition transaction the network itself
refuses to apply until the account has truly gone idle — custody stays with the
account, and only the paperwork lives here.

The point of putting the paperwork on chain is discovery and independence: an
heir finds out they were named without anyone having told them, a watcher can
follow a plan through its life from the events alone, and when a package finally
comes due, no particular party has to be alive or online to deliver it.

The vault never decides whether a silence has run out. It asks the registry, by
address, through a declared interface — so the rule lives in exactly one place
and the two contracts can never disagree about when a takeover became due.

## Layout

```text
contracts/
├── Cargo.toml                    # workspace: soroban-sdk 26, release profile
├── deployments.md                # deployed ids, hashes, redeploy steps
└── contracts/
    ├── registry/
    │   ├── Cargo.toml
    │   ├── Makefile              # build / test / fmt shortcuts
    │   └── src/
    │       ├── lib.rs            # the record
    │       └── test.rs           # 19 unit tests
    └── vault/
        ├── Cargo.toml
        └── src/
            ├── lib.rs            # the package
            └── test.rs           # 15 unit tests, registry wired in for real
```

# registry

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
| `active_heir(owner)` | The heir named, but only while the plan is still in force. |
| `is_claimable(owner)` | Whether this owner's silence has run its course. |
| `claimable_for(heir)` | The owners this heir may act on right now — named, active, and past the silence. |

The last three exist for the vault. They answer in plain addresses and booleans
rather than handing back a `Plan`, so the vault needs no copy of the record's
types and cannot drift out of step with them.

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

# vault

Where a sealed package waits. The package is a transaction the owner has already
signed and nobody has submitted: it makes the heir a signer and stands the
owner's own key down, or merges the account into the heir's wallet outright.

Storing it in public is safe, and that is the whole point. The chain refuses the
transaction until the owner has truly gone quiet, so a package anybody can read
is a package nobody can misuse — and once it *is* due, anybody at all can be the
courier. No server has to be trusted and no watcher believed; if every watcher
fails, the heir can still walk up and take it.

## Interface

| Function | What it does |
| --- | --- |
| `seal(owner, heir, delivery, tx)` | Place a signed package. Owner's authorization required. |
| `unseal(owner)` | Take it back. Owner's authorization required. |
| `claim(owner)` | Hand the package out, once it is due. **No authorization asked.** |
| `envelope(owner)` | The package sealed for this owner, if any. |
| `owners()` | Everyone holding a package here, collected or still waiting. |
| `claimable_for(heir)` | The owners whose packages this heir may collect right now. |
| `registry_address()` | The registry this vault asks about silences. |

`owners()` is what makes delivery an errand anybody can run. Without it the only
way to learn a package exists is to have watched its `Sealed` event go past, and
events are kept for about a week while a package is written to wait for months —
so a courier who started late could never catch up, and the package it could not
see would sit there due and undelivered. Asking the vault what it holds removes
the window: there is no history to have kept, and nothing to have subscribed to
in time. The list is one entry that grows, and every seal rewrites all of it, so
a few hundred owners is comfortable and past that it wants splitting into pages.

`claim` takes nobody's signature deliberately. The transaction inside is already
signed and the chain refuses it until it is due, so demanding a particular caller
would buy nothing — and it would make the heir depend on a watcher holding their
key. What the call does buy is the check that it really is due, and a `Claimed`
event saying so on the record.

### Delivery

| `Delivery` | What lands |
| --- | --- |
| `Joint` | `SetOptions` — the heir joins as a signer and the owner's key keeps its weight. Both can act alone. Nobody is locked out by a silence they did not intend. |
| `Handover` | `SetOptions` — the heir becomes a signer and the owner's key stands down. Final: the old key can no longer do anything, which is the point if it might one day be found by somebody else. |
| `Merge` | `AccountMerge` — every lumen lands in the heir's own wallet and the account ceases to exist. Only possible while the account carries no subentries, and it takes nothing but XLM with it. |

`Joint` and `Handover` differ by a single number — the master weight — and
nothing else.

All three are verified against live testnet: that a pre-signed merge honours
`minSeqAge`, that one trustline is enough to make it fail with
`op_has_sub_entries`, and that after a joint takeover both keys can still act
alone. The interface offers `Merge` only to accounts that can actually take it.

### Events

| Event | Topics | Value |
| --- | --- | --- |
| `Sealed` | `sealed`, owner, heir | `delivery` |
| `Unsealed` | `unsealed`, owner, heir | — |
| `Claimed` | `claimed`, owner, heir | `delivery` |

### Errors

| Error | When |
| --- | --- |
| `NoPlan` (1) | The registry knows of no plan in force for this owner. |
| `HeirMismatch` (2) | The package names one heir and the plan names another. |
| `AlreadySealed` (3) | A package is already waiting for this owner. |
| `EmptyEnvelope` (4) | No transaction was supplied. |
| `NoEnvelope` (5) | Nothing is sealed for this owner. |
| `NotYet` (6) | The silence has not run out — or the plan was called off. |
| `AlreadyClaimed` (7) | The package has already been handed to somebody. |

`HeirMismatch` is not bookkeeping. The transaction inside the package hands the
account to one specific address, so a plan naming somebody else would leave a
package that delivers to the wrong person. The registry is asked, and a
disagreement is refused.

## Talking to the registry

The vault declares the registry's interface rather than importing it:

```rust
#[contractclient(name = "RegistryClient")]
pub trait RegistryInterface {
    fn active_heir(env: Env, owner: Address) -> Option<Address>;
    fn is_claimable(env: Env, owner: Address) -> bool;
    fn claimable_for(env: Env, heir: Address) -> Vec<Address>;
}
```

Depending on the registry crate directly would compile the record's own
implementation into this wasm, and the vault would start answering to `register`
and `cancel` as well. Declaring the interface keeps the wasm to the vault's seven
functions — `stellar contract info interface` confirms it — while the tests take
the registry as a dev-dependency and wire the two together for real, so the
cross-contract call is exercised rather than mocked.

The registry address is fixed at deployment through `__constructor` and cannot be
repointed. Letting it move would mean swapping the record out from under every
package already sealed.

## Build, test, deploy

Requires [Rust](https://rustup.rs) with the `wasm32v1-none` target and the
[Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
27 or newer.

```bash
# 34 unit tests across both contracts
cargo test --manifest-path contracts/Cargo.toml

# --all is required: without it, pointed at a virtual workspace manifest,
# cargo fmt finds no targets and checks nothing at all
cargo fmt --all --manifest-path contracts/Cargo.toml --check
cargo clippy --manifest-path contracts/Cargo.toml --all-targets -- -D warnings

# optimized wasm in contracts/target/wasm32v1-none/release/
stellar contract build --manifest-path contracts/Cargo.toml
```

The tests run in the SDK's simulated environment, `require_auth` included, so
they need no network and no funded account.

Deployment order matters: the vault takes the registry's address in its
constructor, so the registry goes first.

```bash
stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/registry.wasm \
  --source <your-identity> --network testnet
# -> CREGISTRY...

stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/vault.wasm \
  --source <your-identity> --network testnet \
  -- --registry CREGISTRY...
```

Set `NEXT_PUBLIC_REGISTRY_ID` and `NEXT_PUBLIC_VAULT_ID` to the new ids and the
frontend follows without a code change; the ids baked into `src/lib/stellar/`
are only fallbacks. Either way, record the deployment in
[`deployments.md`](deployments.md) alongside the existing entries.

The same thing can be done from CI without a key ever touching a laptop: the
**Deploy contract** workflow
([`.github/workflows/deploy-contract.yml`](../.github/workflows/deploy-contract.yml))
runs on manual dispatch only, takes a typed confirmation, builds the wasm from
source, verifies the CLI download against a pinned checksum, and signs with the
`STELLAR_DEPLOYER_SECRET` secret of the `testnet` environment.

The tests and both checks above also run on every push — see the
[continuous integration](../README.md#continuous-integration) section.

## What is deployed

The live contract, its wasm hash, and the transactions that put it there are in
[`deployments.md`](deployments.md). Testnet only: the arming and cancellation
paths are where a bug would cost someone their account, so mainnet stays locked
until those have been reviewed end to end.
