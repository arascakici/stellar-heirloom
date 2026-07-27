/**
 * What the contracts cost, measured rather than estimated.
 *
 * Every figure comes from a simulation against the live network, so it reflects
 * the fee schedule and the storage rent as they actually are. By default it only
 * reads, which is free and changes nothing. Pass `--writes` and it funds a
 * throwaway account and measures the paying calls end to end.
 *
 * The point is not the numbers on any one day — it is that they can be taken
 * again. An optimisation nobody measured before and after is a story.
 *
 * Run: npm run costs
 *      npm run costs -- --writes
 */

import { statSync } from 'node:fs'

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Networks,
  Operation,
  rpc,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk'

const RPC = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'
const HORIZON = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
const REGISTRY =
  process.env.REGISTRY_ID ?? 'CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU'
const VAULT =
  process.env.VAULT_ID ?? 'CANLQE764X2GHPCFHHDIBXPT35PATT2IIYRCFBK77O6EECKS3CPJDHPY'

/** Measured: every further owner added exactly this much to a seal's writes. */
const PER_OWNER_BYTES = 44

const soroban = new rpc.Server(RPC)
const horizon = new Horizon.Server(HORIZON)
const xlm = (stroops) => (stroops / 1e7).toFixed(5)

function wasmSizes() {
  console.log('## Compiled size\n')
  for (const name of ['registry', 'vault']) {
    const path = `contracts/target/wasm32v1-none/release/${name}.wasm`
    try {
      console.log(`  ${name.padEnd(9)} ${(statSync(path).size / 1024).toFixed(1)} KB`)
    } catch {
      console.log(`  ${name.padEnd(9)} not built — run: stellar contract build`)
    }
  }
}

async function resources(source, contractId, method, args) {
  const account =
    typeof source === 'string'
      ? new Account(source, '0')
      : await soroban.getAccount(source.publicKey())

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build()

  const simulated = await soroban.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(`${method}: ${simulated.error.split('\n')[0].slice(0, 80)}`)
  }

  const data = simulated.transactionData.build()
  const r = data.resources()
  return {
    method,
    instructions: r.instructions(),
    writeBytes: r.writeBytes(),
    fee: Number(data.resourceFee().toString()),
    retval: simulated.result?.retval ?? null,
  }
}

function table(rows) {
  console.log('  method              instructions   write B   resource fee       XLM')
  for (const row of rows) {
    console.log(
      `  ${row.method.padEnd(18)} ${String(row.instructions).padStart(12)} ` +
        `${String(row.writeBytes).padStart(9)} ${String(row.fee).padStart(14)} ` +
        `${xlm(row.fee).padStart(9)}`,
    )
  }
}

/**
 * Reads are simulations: no signature, no fee, nothing written. They are here
 * because their instruction count is a latency budget, and eventually a ceiling
 * — the network refuses a call above a hundred million.
 */
async function reads() {
  console.log('\n## Reading — free, but not weightless\n')
  const probe = Keypair.random().publicKey()

  const held = await resources(probe, VAULT, 'owners', [])
  const rows = [held, await resources(probe, VAULT, 'registry_address', [])]

  const list = held.retval?.vec() ?? []
  const owner = list.length ? Address.fromScVal(list[0]).toString() : null

  if (owner) {
    const arg = new Address(owner).toScVal()
    rows.push(await resources(owner, REGISTRY, 'get_plan', [arg]))
    rows.push(await resources(owner, REGISTRY, 'is_claimable', [arg]))
    rows.push(await resources(owner, VAULT, 'envelope', [arg]))
    rows.push(await resources(owner, VAULT, 'claimable_for', [arg]))
  }

  table(rows)
  if (!owner) console.log('  (the vault is empty, so the per-plan reads were skipped)')
  console.log(`  the list currently names ${list.length} owner(s)`)
}

async function submit(kp, contractId, method, args) {
  const account = await soroban.getAccount(kp.publicKey())
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build()
  const prepared = await soroban.prepareTransaction(tx)
  prepared.sign(kp)
  const sent = await soroban.sendTransaction(prepared)
  if (sent.status === 'ERROR') throw new Error(JSON.stringify(sent.errorResult))
  const done = await soroban.pollTransaction(sent.hash)
  if (done.status !== 'SUCCESS') throw new Error(`${method} ${done.status}`)
}

async function signedTakeover(owner, heir, period) {
  const account = await horizon.loadAccount(owner.publicKey())
  const sequence = BigInt(account.sequenceNumber())
  const tx = new TransactionBuilder(
    new Account(owner.publicKey(), (sequence + 1_000_000n - 1n).toString()),
    {
      fee: '100000',
      networkPassphrase: Networks.TESTNET,
      minAccountSequence: sequence.toString(),
      minAccountSequenceAge: period,
    },
  )
    .addOperation(
      Operation.setOptions({
        masterWeight: 1,
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 1,
        signer: { ed25519PublicKey: heir.publicKey(), weight: 1 },
      }),
    )
    .setTimeout(0)
    .build()
  tx.sign(owner)
  return Buffer.from(tx.toXDR(), 'base64')
}

/** The calls somebody actually pays for, run on a throwaway account. */
async function writes() {
  console.log('\n## Writing — what a plan costs its owner\n')

  const owner = Keypair.random()
  const heir = Keypair.random()
  const funded = await fetch(`https://friendbot.stellar.org?addr=${owner.publicKey()}`)
  if (!funded.ok) throw new Error(`friendbot ${funded.status}`)

  const period = 2_592_000
  const O = new Address(owner.publicKey()).toScVal()
  const H = new Address(heir.publicKey()).toScVal()
  const plan = [O, H, xdr.ScVal.scvU64(new xdr.Uint64(BigInt(period))), xdr.ScVal.scvU32(0)]

  const rows = []
  rows.push(await resources(owner, REGISTRY, 'register', plan))
  await submit(owner, REGISTRY, 'register', plan)

  rows.push(await resources(owner, REGISTRY, 'heartbeat', [O]))

  const takeover = await signedTakeover(owner, heir, period)
  console.log(`  the signed takeover itself: ${takeover.length} bytes\n`)

  const sealed = [O, H, xdr.ScVal.scvU32(2), xdr.ScVal.scvBytes(takeover)]
  rows.push(await resources(owner, VAULT, 'seal', sealed))
  await submit(owner, VAULT, 'seal', sealed)

  rows.push(await resources(owner, VAULT, 'unseal', [O]))
  rows.push(await resources(owner, REGISTRY, 'cancel', [O]))

  table(rows)

  const [register, heartbeat, seal] = rows
  console.log(`\n  sealing a plan, start to finish:   ${xlm(register.fee + seal.fee)} XLM`)
  console.log(`  each sign of life afterwards:      ${xlm(heartbeat.fee)} XLM`)

  // Tidy up: leave nothing of this measurement behind in the vault's list.
  await submit(owner, VAULT, 'unseal', [O])
  await submit(owner, REGISTRY, 'cancel', [O])
  console.log('\n  (the throwaway plan was cancelled and its package withdrawn)')
}

/**
 * Where this stops working, which is more useful to know than where it is
 * comfortable. The vault keeps one list of everyone holding a package and
 * rewrites all of it on every seal, so the list is the part with a ceiling.
 */
async function limits() {
  console.log('\n## Ceilings\n')

  const entrySize = await setting(
    xdr.ConfigSettingId.configSettingContractDataEntrySizeBytes(),
  )
  if (entrySize === null) {
    console.log('  could not read the network settings')
    return
  }

  console.log(`  a ledger entry may hold      ${entrySize} bytes`)
  console.log(`  each owner costs the list    ${PER_OWNER_BYTES} bytes (measured)`)
  console.log(`  so the vault fills at about  ${Math.floor(entrySize / PER_OWNER_BYTES)} packages`)
  console.log(
    '\n  There, `seal` stops taking new packages. Everything already sealed stays\n' +
      '  readable and claimable, and `unseal` still works, because it writes a\n' +
      '  shorter list than it read. The failure is a closed door, not a locked one.',
  )
}

async function setting(id) {
  try {
    const key = xdr.LedgerKey.configSetting(
      new xdr.LedgerKeyConfigSetting({ configSettingId: id }),
    )
    const { entries } = await soroban.getLedgerEntries(key)
    return entries[0]?.val.configSetting().value() ?? null
  } catch {
    return null
  }
}

wasmSizes()
await reads()
if (process.argv.includes('--writes')) await writes()
else console.log('\n(pass --writes to measure the paying calls too)')
await limits()
