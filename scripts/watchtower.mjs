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
  process.env.VAULT_ID ?? 'CANLQE764X2GHPCFHHDIBXPT35PATT2IIYRCFBK77O6EECKS3CPJDHPY'

const horizon = new Horizon.Server(HORIZON)
const soroban = new rpc.Server(RPC)

const summary = { seen: 0, due: 0, delivered: 0, refused: 0, failed: 0, recorded: 0 }

/**
 * Whether the network turning a takeover away is the mechanism working.
 *
 * These two mean the account moved between our reading the registry and the
 * network seeing the transaction — a sign of life arriving late, which is
 * exactly what a dead man's switch is supposed to respect. Anything else means
 * a package that was due did not go out, and somebody should be told.
 */
function expected(codes) {
  const code = codes?.transaction
  return code === 'tx_bad_minseq_age_or_gap' || code === 'tx_bad_seq'
}
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

/**
 * Everyone holding a package, asked of the vault itself.
 *
 * This used to be assembled from `Sealed` events, and it was quietly broken.
 * Events are kept for about a week and the scan reaches back only a few hours
 * per request, while a package is written precisely so it can wait for months —
 * so by the time one came due, the event announcing it was long gone and the
 * watchtower saw nothing to deliver. It never failed; it just found an empty
 * list every hour, which looks exactly like having nothing to do.
 *
 * The vault now keeps the list, so there is no window to fall outside of and no
 * history a courier has to have been present for.
 */
async function sealedOwners() {
  // A read is a simulation, so the source only has to be a well-formed account
  // id — it is never charged and never has to exist. Asking about everybody
  // means there is no subject address to borrow, so one is made up.
  const owners = await read(VAULT, 'owners', Keypair.random().publicKey())
  return Array.isArray(owners) ? owners : []
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
    const codes = error?.response?.data?.extras?.result_codes
    if (expected(codes)) {
      summary.refused += 1
      say(`refused    ${owner}  ${JSON.stringify(codes)}`)
    } else {
      summary.failed += 1
      say(`FAILED     ${owner}  ${JSON.stringify(codes ?? error.message)}`)
    }
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
  say(`the vault holds packages for ${owners.length} account(s)`)

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
      `${summary.refused} refused · ${summary.failed} failed · ${summary.recorded} receipts`,
  )

  // Leave a trace in the job summary when running in Actions.
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Watchtower\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`,
    )
  }

  /*
   * A refusal is news, not a failure: an owner may simply have moved in the
   * meantime, which is the mechanism working. A *failure* is different — a
   * package that was due and did not go out — and it has to turn the job red.
   *
   * This used to exit zero whatever happened, which meant the one job in the
   * project whose silence is indistinguishable from success could never say
   * otherwise. An hourly green tick is worth nothing if it is unconditional.
   */
  process.exit(summary.failed > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
