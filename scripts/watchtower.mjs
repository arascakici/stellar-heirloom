/**
 * The watchtower: delivers packages whose silence has run out.
 *
 * It holds no keys and needs none. Every package in the vault was signed by its
 * owner long ago, and the chain refuses it until the account has truly gone
 * quiet — so handing one to the network is a errand anybody can run, and this
 * script is simply somebody running it on a schedule.
 *
 * That is the whole reason the packages are public. A watcher that cannot act
 * early cannot be trusted wrongly, and a watcher that stops running costs an
 * heir nothing: they can still walk up and claim by hand. This is a
 * convenience, never a dependency.
 *
 * If STELLAR_WATCHTOWER_SECRET is set, the receipt is also recorded on chain
 * (the vault's `claim`, which needs a funded account only to pay its fee).
 * Without it, delivery still happens and the receipt is simply left for
 * whoever claims through the interface.
 *
 * Run: node scripts/watchtower.mjs
 */

import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  Horizon,
  Keypair,
  Networks,
  rpc,
  scValToNative,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

const HORIZON = process.env.HORIZON_URL ?? 'https://horizon-testnet.stellar.org'
const RPC = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'
const PASSPHRASE = process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET

const REGISTRY =
  process.env.REGISTRY_ID ?? 'CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU'
const VAULT =
  process.env.VAULT_ID ?? 'CDQIG5JQHNIBVVPO5G5JGHHG7HBDZJ2ZTAIRB3WR2RESYCVPP5G6CMGG'

/**
 * Soroban RPC scans only a bounded stretch of ledgers per request — about five
 * thousand answers reliably, roughly seven hours at five seconds a ledger. An
 * hourly run therefore overlaps generously rather than skipping anything.
 */
const LOOKBACK_LEDGERS = 5_000

const horizon = new Horizon.Server(HORIZON)
const soroban = new rpc.Server(RPC)

const summary = { seen: 0, due: 0, delivered: 0, failed: 0, recorded: 0 }
const lines = []

function say(line) {
  console.log(line)
  lines.push(line)
}

/** Simulate a read; the subject address doubles as a valid source. */
async function read(contractId, method, source, ...args) {
  const tx = new TransactionBuilder(new Account(source, '0'), {
    fee: BASE_FEE,
    networkPassphrase: PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build()

  const sim = await soroban.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  return sim.result?.retval ? scValToNative(sim.result.retval) : null
}

/** Every owner who has ever sealed a package, within the window RPC will scan. */
async function sealedOwners() {
  const latest = await soroban.getLatestLedger()
  const startLedger = Math.max(latest.sequence - LOOKBACK_LEDGERS, 1)

  const owners = new Set()
  let cursor = null

  for (let page = 0; page < 20; page += 1) {
    const request = cursor
      ? { cursor, filters: [{ type: 'contract', contractIds: [VAULT] }], limit: 100 }
      : {
          startLedger,
          filters: [{ type: 'contract', contractIds: [VAULT] }],
          limit: 100,
        }

    const response = await soroban.getEvents(request)
    for (const event of response.events ?? []) {
      try {
        const topics = event.topic.map((t) => scValToNative(t))
        if (topics[0] === 'sealed' && typeof topics[1] === 'string') {
          owners.add(topics[1])
        }
      } catch {
        // Not a shape we know; the next event may well be.
      }
    }

    if (!response.events?.length || !response.cursor) break
    cursor = response.cursor
  }

  return [...owners]
}

async function deliver(owner) {
  const envelope = await read(VAULT, 'envelope', owner, new Address(owner).toScVal())
  if (!envelope) return

  summary.seen += 1

  // Somebody has already been. Nothing to do, and nothing lost.
  if (envelope.claimed_at !== undefined && envelope.claimed_at !== null) return

  // Whether the silence has run out is the registry's answer, never ours.
  const due = await read(
    REGISTRY,
    'is_claimable',
    owner,
    new Address(owner).toScVal(),
  ).catch(() => false)
  if (due !== true) return

  summary.due += 1

  const xdr = Buffer.from(envelope.tx).toString('base64')
  try {
    const takeover = TransactionBuilder.fromXDR(xdr, PASSPHRASE)
    const result = await horizon.submitTransaction(takeover)
    summary.delivered += 1
    say(`delivered  ${owner}  ${result.hash}`)
  } catch (error) {
    summary.failed += 1
    const codes = error?.response?.data?.extras?.result_codes
    say(`refused    ${owner}  ${JSON.stringify(codes ?? error.message)}`)
    return
  }

  await recordReceipt(owner)
}

/**
 * Optional, and deliberately so: the account has already changed hands by the
 * time this runs. A missing receipt is untidy, not harmful.
 */
async function recordReceipt(owner) {
  const secret = process.env.STELLAR_WATCHTOWER_SECRET
  if (!secret) return

  try {
    const keypair = Keypair.fromSecret(secret)
    const account = await soroban.getAccount(keypair.publicKey())
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(new Contract(VAULT).call('claim', new Address(owner).toScVal()))
      .setTimeout(120)
      .build()

    const prepared = await soroban.prepareTransaction(tx)
    prepared.sign(keypair)
    const sent = await soroban.sendTransaction(prepared)
    if (sent.status !== 'ERROR') {
      await soroban.pollTransaction(sent.hash)
      summary.recorded += 1
    }
  } catch (error) {
    say(`receipt    ${owner}  not recorded: ${error?.message ?? error}`)
  }
}

async function main() {
  say(`watchtower — vault ${VAULT}`)

  const owners = await sealedOwners()
  say(`${owners.length} account(s) have sealed a package in the scanned window`)

  for (const owner of owners) {
    try {
      await deliver(owner)
    } catch (error) {
      summary.failed += 1
      say(`error      ${owner}  ${error?.message ?? error}`)
    }
  }

  say(
    `\n${summary.seen} waiting · ${summary.due} due · ${summary.delivered} delivered · ` +
      `${summary.failed} failed · ${summary.recorded} receipts`,
  )

  // Leave a trace in the job summary when running in Actions.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Watchtower\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`,
    )
  }

  // A refusal is news, not a failure: an owner may simply have moved in the
  // meantime, which is the mechanism working.
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
