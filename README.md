# heirloom

[![CI](https://github.com/arascakici/stellar-heirloom/actions/workflows/ci.yml/badge.svg)](https://github.com/arascakici/stellar-heirloom/actions/workflows/ci.yml)

**A dead man's switch for Stellar.**

heirloom lets you sign one transaction today so that, if your account ever goes
quiet for a period you choose, someone you named takes it over. Your assets never
leave your account — nothing is held in escrow, no one including the app can move
them early, and the Stellar network itself does the refusing. The heir can even
be *future you*: lose your keys, the account goes idle on its own, and a fresh
wallet you set aside takes over.

**Live demo:** [stellar-heirloom.vercel.app](https://stellar-heirloom.vercel.app)

Built level-by-level for the **Stellar Builder Challenge**. One repository, one
product — each belt adds a section here, and earlier levels stay in place as the
README grows.

## Level 2 — Yellow Belt

The plan goes on chain. A Soroban contract written in Rust keeps the **record** —
who named whom, after how long a silence, in which mode — and nothing else. It
never holds a balance, never moves an asset, and cannot take an account over on
anyone's behalf; the takeover itself stays a precondition transaction the network
enforces. A notary, not a vault. Alongside it the wallet stops being Freighter
alone, and the interface finds its object: a chest that closes over a plan when
you seal it.

| | |
| --- | --- |
| **Contract** | [`CBIBPVG7QXJWUWIFOL3LZRIR37YYKBOAM5YIUEP74RJHB35YXT2OKXTG`](https://stellar.expert/explorer/testnet/contract/CBIBPVG7QXJWUWIFOL3LZRIR37YYKBOAM5YIUEP74RJHB35YXT2OKXTG) |
| **Network** | Testnet |
| **Sample `register` call** | [`f8121bbe…`](https://stellar.expert/explorer/testnet/tx/f8121bbe5e06e0d96ac6b84728109a23c7236541d06e3fdf16aaca23c6a9ebfd) |

The contract's interface, storage and events are documented in
[`contracts/README.md`](contracts/README.md); every deployment fact — wasm hash,
upload and create hashes, redeploy steps — in
[`contracts/deployments.md`](contracts/deployments.md).

### Features

- **The registry contract** — `register`, `heartbeat` and `cancel` behind the
  owner's `require_auth`, plus `get_plan` and `plans_for_heir` as free reads, so
  an heir can discover a plan without being told about it.
- **Two plan modes, recorded on chain** — *standing* survives ordinary activity
  and is called off deliberately; *sealed* is one-shot, and any transaction at
  all voids it.
- **Events with indexed topics** — `Registered`, `Heartbeat` and `Cancelled`,
  keyed on owner and heir, so a watcher can subscribe to exactly the plans that
  name them.
- **Typed contract errors** — `PlanExists`, `InvalidPeriod`, `NoPlan` and
  `NotActive` come back through the frontend as sentences, never as a raw code.
- **Six wallets, one door** — Freighter, xBull, Albedo, LOBSTR, Rabet and Hana
  through StellarWalletsKit, with the picker drawn in heirloom's own brass
  rather than the kit's default modal; uninstalled wallets offer a way to get one.
- **The chest** — sealing a plan draws the lid down over the form until the
  words are enclosed; calling it off breaks the lock, and the chest comes
  forward and opens to give the choices back.
- **A plan dashboard** — heir, silence, last sign of life and a live countdown
  to takeover, plus the plans that name *you* as heir.
- **A live registry page** — what the contract has witnessed, polled from
  Soroban RPC `getEvents` and written out as sentences; your own account's
  doings refresh the plan in place.
- **14 contract unit tests**, covering both modes, every error, and the
  heir-discovery index.

### Screenshots

| Choosing a wallet | A sealed plan | The registry |
| --- | --- | --- |
| ![Six wallets in heirloom's own picker](docs/screenshots/l2-wallet.png) | ![A standing plan, chest shut, counting down to takeover](docs/screenshots/l2-plan.png) | ![The registry page with the contract identity and its record](docs/screenshots/l2-registry.png) |

## Level 1 — White Belt

The foundation: connect a Freighter wallet on testnet, read and show the balance,
and send a real transaction with clear feedback. In heirloom that transaction is
the **heartbeat** — a one-stroop payment to yourself that proves you are still
here and restarts the idle clock any future plan is measured against. Nothing
leaves the account but the fee; the point is the on-chain record.

### Features

- **Freighter connection** on testnet, with a live network-mismatch check so you
  can't read a testnet balance while signing on mainnet.
- **Disconnect and silent reconnect** — a returning visitor is restored without
  clicking through the extension again, trusting only Freighter's own record.
- **Balance with reserve breakdown**, so what is actually spendable is never
  confused with the total held against the account's minimum reserve.
- **Friendbot funding** for a brand-new account, in one click.
- **The heartbeat transaction** — a self-payment that lands on-chain and returns
  the hash, with a link out to the explorer.
- **Typed error handling** across every step: wallet missing, wrong network,
  declined signature, insufficient funds, or a failed read you can retry.

### Screenshots

| Connected wallet & balance | Transaction result | Confirmed on-chain |
| --- | --- | --- |
| ![Home: connected on testnet with balance and reserve breakdown](docs/screenshots/l1-home.png) | ![Heartbeat recorded with hash and explorer link](docs/screenshots/l1-transaction-result.png) | ![Transaction confirmed on stellar.expert](docs/screenshots/l1-explorer.png) |

## Tech stack

- **[Next.js](https://nextjs.org)** (App Router) + **TypeScript** — hand-written
  CSS, no UI framework, so the interface carries its own chest-and-brass character.
- **[@stellar/stellar-sdk](https://github.com/stellar/js-stellar-sdk)** — builds
  and submits transactions against Horizon, and calls the contract over Soroban RPC.
- **[stellar-wallets-kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)** —
  six wallets behind one interface; heirloom draws the picker itself.
- **[soroban-sdk](https://github.com/stellar/rs-soroban-sdk)** (Rust) — the
  registry contract, built to `wasm32v1-none`.

## Getting started

### Prerequisites

- [ ] Node.js 20 or newer
- [ ] A Stellar wallet set to **Testnet** — [Freighter](https://www.freighter.app/),
      xBull, Albedo, LOBSTR, Rabet or Hana. In Freighter that is
      settings → Network → Test Net.
- [ ] Only to rebuild the contract: [Rust](https://rustup.rs) with the
      `wasm32v1-none` target and the
      [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/cli/stellar-cli)
      27 or newer. The web app talks to the already-deployed contract, so this
      is optional.

### Run the web app

```bash
git clone https://github.com/arascakici/stellar-heirloom.git
cd stellar-heirloom
npm install
npm run dev
```

Open <http://localhost:3000>, connect a wallet, and — if the account is new —
click **Fund with test XLM** to have the friendbot faucet create it. Then name an
heir and seal the plan; **I'm here**, in the account menu, winds the clock back.

heirloom runs on testnet with no configuration. Four optional variables repoint it:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | `testnet` or `mainnet`. |
| `NEXT_PUBLIC_HORIZON_URL` | network default | Override the Horizon endpoint. |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | network default | Override the Soroban RPC endpoint. |
| `NEXT_PUBLIC_REGISTRY_ID` | the deployed registry | Point at your own deployment of the contract. |

## Testing

The registry contract is covered by unit tests — both plan modes, every error
case, and the heir-discovery index:

```bash
cargo test --manifest-path contracts/Cargo.toml
```

Fourteen checks, all passing.

The dead man's switch itself is verified against live testnet:

```bash
npm run verify:preconditions
```

This arms throwaway testnet accounts and proves, with real transactions, that a
takeover is refused while an account is active and accepted only once it has gone
idle — for both the standing (survives activity) and sealed (one-shot) plan
modes. Ten checks, all passing. It becomes the CI suite at a later belt.

## Continuous integration

Every push and pull request runs
[`.github/workflows/ci.yml`](.github/workflows/ci.yml), in two jobs:

| Job | What it checks |
| --- | --- |
| **Registry contract** | `cargo fmt --check`, `cargo clippy -D warnings`, the 14 unit tests, and a build for `wasm32v1-none` — the target the contract actually ships to, so a wasm-only failure can't reach a deploy. The wasm is kept as a build artifact. |
| **Web app** | `npm ci`, `npm run lint`, `npm run build` on Node 20 — the floor this README promises, rather than the version we happen to develop on. |

Deploying is deliberate and never automatic: no push can put a new registry on
chain. [`.github/workflows/deploy-contract.yml`](.github/workflows/deploy-contract.yml)
runs only from the Actions tab, only after the word `deploy` is typed into its
confirmation input, and only against testnet. It builds the wasm from source,
installs a checksum-pinned Stellar CLI, signs with the `STELLAR_DEPLOYER_SECRET`
secret of the `testnet` environment, and prints the new contract id to the job
summary.

## Network

Testnet only. The arming and cancellation paths are the two places where a bug
would cost someone their account, so mainnet stays locked until those have been
reviewed end to end.

## Roadmap

- **L1 — White Belt:** wallet, balance, heartbeat transaction ✓
- **L2 — Yellow Belt:** the registry contract, six wallets, the chest ✓
- **Next:** the precondition engine that arms and cancels a real plan, with the
  verification script promoted to a CI suite — added here as each belt lands.

## Credits

The chest is ["Chest" by Delapouite](https://game-icons.net/1x1/delapouite/chest.html)
from [game-icons.net](https://game-icons.net), used under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). It has been recoloured
to the wood-and-brass palette and split into lid, body and lock so the two halves
can close over a plan as it is sealed.
