# Deployments

## registry — Testnet

| | |
|---|---|
| **Contract ID** | `CBIBPVG7QXJWUWIFOL3LZRIR37YYKBOAM5YIUEP74RJHB35YXT2OKXTG` |
| **Wasm hash** | `458712d965d572b686106a8d27fd6205bebe83e9e042d4f7c9ab4fa22a73540b` |
| **Network** | Test SDF Network ; September 2015 |
| **Explorer** | [stellar.expert](https://stellar.expert/explorer/testnet/contract/CBIBPVG7QXJWUWIFOL3LZRIR37YYKBOAM5YIUEP74RJHB35YXT2OKXTG) |

### Transactions

| What | Hash |
|---|---|
| Upload wasm | [`acda6918…`](https://stellar.expert/explorer/testnet/tx/acda69185323780d7385d2578b721d6dbc8ebe329b5cb1584181a0f037cc61d4) |
| Create contract | [`6c7795f2…`](https://stellar.expert/explorer/testnet/tx/6c7795f2a8572e64cc92ec85c97eb075a5d3631d1245d32565090e66dce444f2) |
| `register` call (sample) | [`f8121bbe…`](https://stellar.expert/explorer/testnet/tx/f8121bbe5e06e0d96ac6b84728109a23c7236541d06e3fdf16aaca23c6a9ebfd) |

The sample `register` recorded a 30-day Standing plan and emitted a `registered`
event; `get_plan` reads it back with `status = Active`. Both the write and the
read are verified live on testnet.

### Redeploy

```bash
stellar contract build --manifest-path contracts/Cargo.toml
stellar contract deploy \
  --wasm contracts/target/wasm32v1-none/release/registry.wasm \
  --source <your-identity> --network testnet
```
