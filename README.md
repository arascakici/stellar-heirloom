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

## Level 3 — Orange Belt

The plan learns to arrive. Until now heirloom could record who inherits what and
refuse a takeover that came too early — but somebody still had to be holding the
signed transaction when the silence finally ran out. Now the transaction lives on
chain, in the open, in a second contract that asks the first whether the wait is
over.

Storing it publicly is the point rather than a compromise. The chain refuses the
transaction until the account has truly gone quiet, so a package anybody can read
is a package nobody can misuse — and once it *is* due, anybody at all can be the
courier. The heir does not have to be watching. Nor does anyone else.

| | registry | vault |
| --- | --- | --- |
| **Contract** | [`CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU`](https://stellar.expert/explorer/testnet/contract/CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU) | [`CB55KTVZ7QINEKSXDTALKEIEJWW4DHLIGZPM4SANDG3UGF7XKDIPU7JQ`](https://stellar.expert/explorer/testnet/contract/CB55KTVZ7QINEKSXDTALKEIEJWW4DHLIGZPM4SANDG3UGF7XKDIPU7JQ) |
| **Deploy tx** | [`399e9ae4…`](https://stellar.expert/explorer/testnet/tx/399e9ae4119e16c39859b8505081853b1fcda7d655bf4485cce2877e6c88b684) | [`6089c78b…`](https://stellar.expert/explorer/testnet/tx/6089c78bcfe5a16e65b76f5da85ddf31ac00494024f5931904ea5acabc62fcd5) |
| **A package collected** | — | [`28e66b92…`](https://stellar.expert/explorer/testnet/tx/28e66b92dff988a1777c8897f9eeb3a7af07f9460faef6a4913e2636fe321c66) |

### Features

- **A second contract, and a real conversation between them.** The vault holds
  the package; the registry holds the record. When a package is sealed the vault
  asks the registry who the heir is, and refuses a package that names anyone
  else. When one is claimed it asks whether the silence has run out. The rule
  lives in one place, so the two can never disagree about when a takeover became
  due.
- **The interface is declared, not imported** — `#[contractclient]` on a trait,
  so the registry's implementation never reaches the vault's wasm. Confirmed:
  `stellar contract info interface` lists the vault's seven functions and none of
  the registry's. The tests wire the two together for real, so the cross-contract
  call is exercised rather than mocked.
- **Three ways for an account to change hands**, chosen when the plan is sealed.
  *Joint* adds the heir alongside you and leaves your own key working, so a
  silence you never meant cannot lock you out of your own account — the default,
  and the right one when the heir is a spare wallet of your own. *Handover*
  stands your key down instead, which is what you want if it might one day be
  found by somebody else. *Merge* sends every lumen into the heir's own wallet
  and closes the account; it is offered only to accounts that can take it, since
  one trustline is enough for the network to refuse.
- **And a way back.** Plans fire for reasons nobody meant: an illness, a long
  trip, a forgotten month. After a handover the owner cannot undo it, because
  their key no longer signs for anything — so the heir can, in one operation
  that returns the key and gives up their own access. It is the takeover run in
  reverse, and it is the heir's to offer, which is the trust they were named
  for.
- **And a way to finish.** A handover gives the heir control, not possession —
  the balances stay where they were. So the app carries on: it reads what is
  actually in the account, moves it home, and where nothing is left behind
  closes the old account so even its locked reserve comes back. A pre-signed
  transaction could never do this, because it cannot know a future balance.
- **An heir's side of the app.** Connect a wallet and see the accounts that named
  you — and, among them, the ones that have gone quiet long enough to be yours.
  Which is which is the contract's answer, not a sum the page does. Taking one
  over submits a transaction the heir never built, never signed, and could not
  alter.
- **One book for both contracts.** `/registry` polls Soroban RPC for the
  registry *and* the vault in a single filter and writes the six events out as
  sentences — a plan recorded, a clock wound, a seal broken, a package left,
  taken back, or collected. A collection gets the only mark on the page that
  cannot be undone.
- **A watchtower that holds no keys.** An hourly job walks the vault and carries
  anything due to the network. Delivering a signed transaction needs no
  signature, so it cannot act early and cannot be trusted wrongly — and if it
  stops running, an heir loses nothing but the convenience.
- **CI on every push** — formatting, clippy, 34 contract tests, a `wasm32v1-none`
  build, then lint, 42 frontend tests and a production build. Deployment is a
  separate workflow that runs only by hand, only after a typed confirmation, and
  installs a checksum-pinned toolchain before it is shown a key.
- **Three signatures, said out loud.** Sealing records the plan, signs the
  takeover, and stores it — Stellar allows one contract call per transaction, so
  they cannot be folded together. The form says so rather than springing three
  wallet prompts on someone expecting one.

### Verified on chain

Every rule this level added was proven against live testnet before it was
believed, not read from documentation:

| Claim | How it was shown |
| --- | --- |
| A pre-signed `AccountMerge` honours `minSeqAge` | refused while active, accepted after the silence, every lumen landing in the heir's wallet |
| A merge cannot close an account with subentries | one trustline → `tx_failed` / `op_has_sub_entries` |
| The vault really does ask the registry | `seal` succeeds only against a plan the registry confirms |
| A package is refused before its time | `Error(Contract, #6)` — `NotYet` |
| **A sealed plan survives being stored** | the subtle one: a sealed takeover claims the *next* sequence number, and storing it spends one. Built naively it would void itself on the spot. Built against the sequence the account will be on afterwards, it lands ([`d98711c0…`](https://stellar.expert/explorer/testnet/tx/d98711c06042d1ccaaff141ff54ac4ca7c882a5d1c0a4c2fc1259e0a2deebf74)) |

### Screenshots

| Mobile | The pipeline | The contract tests |
| --- | --- | --- |
| ![Choosing a delivery on a phone: merge held back, and the trustline standing in its way named](docs/screenshots/l3-mobile.png) | ![Both CI jobs green, with the 42 frontend tests reported in the job summary](docs/screenshots/l3-ci.png) | ![19 registry tests and 15 vault tests, all passing](docs/screenshots/l3-tests.png) |

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

> The registry was redeployed at Level 3 to add the reads the vault needs, so
> the app now talks to a newer address. The one above is what Level 2 shipped
> and is still on chain, holding everything it witnessed.

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

- [ ] Node.js 22 or newer — `@stellar/stellar-sdk` 16 requires it, whatever
      Next.js alone would settle for
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

heirloom runs on testnet with no configuration. Seven optional variables repoint it:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_STELLAR_NETWORK` | `testnet` | `testnet` or `mainnet`. |
| `NEXT_PUBLIC_HORIZON_URL` | network default | Override the Horizon endpoint. |
| `NEXT_PUBLIC_SOROBAN_RPC_URL` | network default | Override the Soroban RPC endpoint. |
| `NEXT_PUBLIC_REGISTRY_ID` | the deployed registry | Point at your own deployment of the record. |
| `NEXT_PUBLIC_VAULT_ID` | the deployed vault | Point at your own deployment of the vault. |
| `NEXT_PUBLIC_FEEDBACK_URL` | the live form | Point the feedback footer at your own form. |
| `NEXT_PUBLIC_FEEDBACK_ADDRESS_FIELD` | `entry.1892039617` | That form's own name for its wallet-address question, used to prefill it. |

### Feedback

One line under the plate, on both pages, linking out to a short form: whether
you got a plan sealed, how useful this is, and what should change.

It asks for your wallet address, and asks for it required, because feedback that
cannot be placed against a plan on the ledger is just an opinion — this way a
sentence about the sealing step can be read next to the sealing that person
actually did. When a wallet is connected the address is prefilled rather than
retyped; the field stays visible and editable on the other side, so you can see
what is being sent and clear it if you would rather not say.

That the address travels is a deliberate exception to how the rest of this works,
and it is worth naming as one. Nothing else here asks you to identify yourself,
and the count of wallets that have used heirloom does not depend on the form at
all — it is on chain, where anyone can count it without being shown a dashboard.

## Testing

The contracts are covered by unit tests — both plan modes, every error case, the
heir-discovery index, and the vault wired to a real registry so the
cross-contract call is exercised rather than mocked:

```bash
cargo test --manifest-path contracts/Cargo.toml
```

Thirty-four checks, all passing.

The frontend's chain logic is covered by Vitest — how a takeover transaction is
built for each mode and delivery, how a period is phrased, and how the
registry's events decode:

```bash
npm test          # once
npm run test:watch
```

Thirty-seven checks. The event tests rebuild genuine `ScVal`s rather than
mocking the decoder's input, so a change in how the contract publishes would
fail them rather than slip past.

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
| **Web app** | `npm ci`, `npm run lint`, `npm test`, `npm run build` on Node 22 — the floor the Stellar SDK actually requires, rather than the version we happen to develop on. |

A third workflow,
[`.github/workflows/watchtower.yml`](.github/workflows/watchtower.yml), runs
hourly and carries any package that has come due to the network. **It holds no
keys and needs none** — every package was signed by its owner long ago and the
chain refuses it until the account has truly gone quiet, so delivering one is an
errand anybody can run. A watcher that cannot act early cannot be trusted
wrongly, and if it stops running an heir loses nothing: they can still claim by
hand. Set `STELLAR_WATCHTOWER_SECRET` if you also want it to record the receipt
on chain, which costs a fee and nothing else.

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
- **L3 — Orange Belt:** the vault, both delivery modes, the heir's side, CI and
  the watchtower ✓
- **Next:** the whole thing as one product — a guided setup, a fuller dashboard,
  and the verification script promoted to a scheduled suite.

## Credits

The chest is ["Chest" by Delapouite](https://game-icons.net/1x1/delapouite/chest.html)
from [game-icons.net](https://game-icons.net), used under
[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). It has been recoloured
to the wood-and-brass palette and split into lid, body and lock so the two halves
can close over a plan as it is sealed.
