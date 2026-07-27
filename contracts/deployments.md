# Deployments

Testnet only. Newest first — earlier deployments stay listed, because the events
they witnessed are still on chain and still readable at their addresses.

## vault — 27 July 2026 (current)

The vault now keeps a list of every owner holding a package, and answers
`owners()` with it.

This was a repair, not a feature. Delivery is meant to be an errand anybody can
run, but the watchtower could only learn a package existed by having seen its
`Sealed` event go past — and events are kept for about a week, while a package is
written precisely so it can wait for months. By the time a silence ran out, the
announcement was long gone. The script never failed; it found an empty list every
hour, which looks exactly like having nothing to do. A package sealed on 26 July
was already due and already invisible.

Asking the vault what it holds removes the window entirely. There is no history
to have kept and nothing to have been subscribed to in time.

| | |
|---|---|
| **Contract ID** | `CANLQE764X2GHPCFHHDIBXPT35PATT2IIYRCFBK77O6EECKS3CPJDHPY` |
| **Registry** | `CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU` (unchanged) |
| **Explorer** | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CANLQE764X2GHPCFHHDIBXPT35PATT2IIYRCFBK77O6EECKS3CPJDHPY) |
| **Deploy tx** | [`a28d7173…`](https://stellar.expert/explorer/testnet/tx/a28d7173fc4b2837a1de41b608e44ef6c05235f6fc12b1546b02019f54cc0aef) |

Verified live, on throwaway accounts: a fresh vault names nobody; sealing adds
the owner; sealing a second adds it alongside; unsealing the first removes that
one and leaves the other; and a collected package stays listed, because the
envelope is still there and dropping it would erase the record that it was ever
delivered.

Packages sealed into the previous vault stayed with it. There was one, belonging
to a throwaway deployer account, and it is the package this repair was found
through.

One limit worth naming: the list is a single entry that grows, and every seal
rewrites all of it. A few hundred owners is comfortable; past that it wants
splitting into pages.

## vault — 26 July 2026

`Delivery` gained a third mode, `Joint`, so the vault was redeployed. The
registry is unchanged and keeps its address, so the new vault was pointed at the
same one.

| | |
|---|---|
| **Contract ID** | `CB55KTVZ7QINEKSXDTALKEIEJWW4DHLIGZPM4SANDG3UGF7XKDIPU7JQ` |
| **Registry** | `CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU` (unchanged) |
| **Explorer** | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CB55KTVZ7QINEKSXDTALKEIEJWW4DHLIGZPM4SANDG3UGF7XKDIPU7JQ) |
| **Deploy tx** | [`6089c78b…`](https://stellar.expert/explorer/testnet/tx/6089c78bcfe5a16e65b76f5da85ddf31ac00494024f5931904ea5acabc62fcd5) |

Verified live: a `Joint` package (`delivery = 2`) seals, emits `Sealed` carrying
that mode, and reads back intact. Separately, on throwaway accounts, a joint
takeover leaves **both** keys at weight 1 against thresholds of 1 — each able to
act alone, neither locked out.

## registry + vault — 26 July 2026

The registry gained the three eligibility reads the vault leans on
(`active_heir`, `is_claimable`, `claimable_for`). The earlier instance carries no
upgrade path, so it was redeployed rather than migrated; plans recorded against
the old address stayed with it.

| | registry | vault |
|---|---|---|
| **Contract ID** | `CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU` | `CDQIG5JQHNIBVVPO5G5JGHHG7HBDZJ2ZTAIRB3WR2RESYCVPP5G6CMGG` |
| **Explorer** | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU) | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CDQIG5JQHNIBVVPO5G5JGHHG7HBDZJ2ZTAIRB3WR2RESYCVPP5G6CMGG) |
| **Deploy tx** | [`399e9ae4…`](https://stellar.expert/explorer/testnet/tx/399e9ae4119e16c39859b8505081853b1fcda7d655bf4485cce2877e6c88b684) | [`93dc75f1…`](https://stellar.expert/explorer/testnet/tx/93dc75f10bd0e93c5e00520f8d499cf09ca79ef3c8560642f8be5dfd858faeae) |

The vault takes the registry's address in its constructor and cannot be
repointed afterwards, so the registry has to go first.

### Verified live

The cross-contract path was exercised on chain, not only in the SDK's simulated
environment:

| Check | Result |
|---|---|
| `vault.registry_address()` | returns the registry above |
| `vault.seal(…)` against a real plan | succeeds — the vault asked `active_heir` and was answered |
| `vault.claim(…)` before the silence | `Error(Contract, #6)` — `NotYet` |
| `vault.claimable_for(heir)` before | `[]` |
| `registry.is_claimable(owner)` after 60s | `true` |
| `vault.claimable_for(heir)` after | `[owner]` |
| `vault.claim(…)` after | [`28e66b92…`](https://stellar.expert/explorer/testnet/tx/28e66b92dff988a1777c8897f9eeb3a7af07f9460faef6a4913e2636fe321c66) — `Claimed` emitted, package returned intact |

The `AccountMerge` delivery mode was proven separately: refused while the account
is active, accepted after the silence, every lumen landing in the heir's own
wallet, and refused outright for an account carrying a trustline
([`85d62946…`](https://stellar.expert/explorer/testnet/tx/85d62946a24a3a81644999820c694fdfb8938f669eada887e9544257a02d1f05)).

## registry — 23 July 2026 (superseded)

The first registry, without the eligibility reads. Still on chain; what it
witnessed remains readable at its address.

| | |
|---|---|
| **Contract ID** | `CBIBPVG7QXJWUWIFOL3LZRIR37YYKBOAM5YIUEP74RJHB35YXT2OKXTG` |
| **Wasm hash** | `458712d965d572b686106a8d27fd6205bebe83e9e042d4f7c9ab4fa22a73540b` |
| **Network** | Test SDF Network ; September 2015 |
| **Explorer** | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CBIBPVG7QXJWUWIFOL3LZRIR37YYKBOAM5YIUEP74RJHB35YXT2OKXTG) |

| What | Hash |
|---|---|
| Upload wasm | [`acda6918…`](https://stellar.expert/explorer/testnet/tx/acda69185323780d7385d2578b721d6dbc8ebe329b5cb1584181a0f037cc61d4) |
| Create contract | [`6c7795f2…`](https://stellar.expert/explorer/testnet/tx/6c7795f2a8572e64cc92ec85c97eb075a5d3631d1245d32565090e66dce444f2) |
| `register` call (sample) | [`f8121bbe…`](https://stellar.expert/explorer/testnet/tx/f8121bbe5e06e0d96ac6b84728109a23c7236541d06e3fdf16aaca23c6a9ebfd) |

The sample `register` recorded a 30-day Standing plan and emitted a `registered`
event; `get_plan` read it back with `status = Active`.

## Redeploy

```bash
stellar contract build --manifest-path contracts/Cargo.toml

stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/registry.wasm \
  --source <your-identity> --network testnet

stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/vault.wasm \
  --source <your-identity> --network testnet \
  -- --registry <the id printed above>
```

Point the frontend at a new pair with `NEXT_PUBLIC_REGISTRY_ID` and
`NEXT_PUBLIC_VAULT_ID`; the ids in `src/lib/stellar/` are only fallbacks. The
same deployment runs from CI — see
[`.github/workflows/deploy-contract.yml`](../.github/workflows/deploy-contract.yml).
