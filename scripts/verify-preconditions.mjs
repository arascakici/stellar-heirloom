/**
 * Proves, on testnet, that heirloom's two modes are enforced by the chain itself.
 *
 * heirloom hands the heir a transaction that is signed today but stays invalid
 * until the owner's account has gone quiet. Two variants exist, and the only
 * difference between them is one precondition:
 *
 *   STANDING (minSeqNum set)  - survives the owner's everyday activity. Each
 *                               transaction only restarts the idle clock. Stays
 *                               armed until deliberately cancelled.
 *   ONE-SHOT (no minSeqNum)   - any transaction from the account destroys it
 *                               permanently. Setting it up is a one-time act.
 *
 * Four accounts, four questions:
 *
 *   standing-active   activity, then idle  -> takes over   (activity only resets)
 *   oneshot-idle      never touched        -> takes over   (baseline)
 *   oneshot-active    touched once         -> dead forever (activity cancels)
 *   standing-bumped   sequence bumped past -> dead forever (explicit cancel)
 *
 * Run: node scripts/verify-preconditions.mjs
 */

import {
  Account,
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk'

const HORIZON = 'https://horizon-testnet.stellar.org'
const FRIENDBOT = 'https://friendbot.stellar.org'

/** Idle period the heir must wait out. Real plans use months; tests use seconds. */
const IDLE_SECONDS = 60

/** How far ahead a standing plan reserves its sequence number. */
const SEQ_RESERVE = 1_000_000n

/** Pre-signed transactions carry a fee fixed at signing time, so aim high. */
const FEE = '100000'

const server = new Horizon.Server(HORIZON)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fund(label) {
  const keypair = Keypair.random()
  const response = await fetch(`${FRIENDBOT}?addr=${keypair.publicKey()}`)
  if (!response.ok) throw new Error(`friendbot failed for ${label}: ${response.status}`)
  return keypair
}

/**
 * The takeover transaction: hand the heir full control by making them a signer
 * and standing the owner's own key down. Assets never move.
 */
function buildTakeover({ owner, heir, sequence, minSequence }) {
  // TransactionBuilder consumes sequence + 1, so seed the account one below.
  const source = new Account(owner.publicKey(), (sequence - 1n).toString())

  const builder = new TransactionBuilder(source, {
    fee: FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.setOptions({
        signer: { ed25519PublicKey: heir.publicKey(), weight: 1 },
        masterWeight: 0,
        lowThreshold: 1,
        medThreshold: 1,
        highThreshold: 1,
      }),
    )
    .setMinAccountSequenceAge(BigInt(IDLE_SECONDS))
    .setTimeout(0) // no expiry — the plan must outlive the owner

  if (minSequence !== undefined) builder.setMinAccountSequence(minSequence.toString())

  const tx = builder.build()
  tx.sign(owner)
  return tx
}

/** A transaction the owner sends to prove they are still around. */
async function heartbeat(keypair) {
  const account = await server.loadAccount(keypair.publicKey())
  const tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: keypair.publicKey(),
        asset: Asset.native(),
        amount: '0.0000001',
      }),
    )
    .setTimeout(30)
    .build()
  tx.sign(keypair)
  await send(tx, 'heartbeat')
}

/** Cancel a standing plan by pushing the sequence number past the reserved slot. */
async function bumpPast(keypair, target) {
  const account = await server.loadAccount(keypair.publicKey())
  const tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: target.toString() }))
    .setTimeout(30)
    .build()
  tx.sign(keypair)
  await send(tx, 'bumpSequence')
}

/** Horizon buries the useful part of a failure deep in the axios error. */
async function send(tx, label) {
  try {
    return await server.submitTransaction(tx)
  } catch (error) {
    const codes = error?.response?.data?.extras?.result_codes
    throw new Error(`${label} failed: ${JSON.stringify(codes ?? error.message)}`)
  }
}

async function submit(tx) {
  try {
    const result = await server.submitTransaction(tx)
    return { accepted: true, hash: result.hash }
  } catch (error) {
    const codes = error?.response?.data?.extras?.result_codes
    return { accepted: false, reason: codes?.transaction ?? error.message }
  }
}

const results = []
function check(description, actual, expected) {
  const passed = actual === expected
  results.push({ description, passed, actual, expected })
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${description}`)
  if (!passed) console.log(`        expected ${expected}, got ${actual}`)
}

async function main() {
  console.log(`\nheirloom precondition proof — idle period ${IDLE_SECONDS}s\n`)

  console.log('Funding four owner accounts and one heir...')
  const heir = await fund('heir')
  const [standingActive, oneshotIdle, oneshotActive, standingBumped] = await Promise.all([
    fund('standing-active'),
    fund('oneshot-idle'),
    fund('oneshot-active'),
    fund('standing-bumped'),
  ])

  // A freshly created account has never had its sequence number touched, so its
  // seqTime is 0 and the chain considers it infinitely idle — minSeqAge would
  // pass instantly. Arming a plan therefore has to put one transaction on chain.
  console.log('Arming each account (starts the idle clock)...')
  await Promise.all(
    [standingActive, oneshotIdle, oneshotActive, standingBumped].map((kp) => heartbeat(kp)),
  )

  const plans = {}
  for (const [name, owner, standing] of [
    ['standing-active', standingActive, true],
    ['oneshot-idle', oneshotIdle, false],
    ['oneshot-active', oneshotActive, false],
    ['standing-bumped', standingBumped, true],
  ]) {
    const account = await server.loadAccount(owner.publicKey())
    const current = BigInt(account.sequenceNumber())
    plans[name] = {
      owner,
      current,
      reserved: current + SEQ_RESERVE,
      tx: buildTakeover({
        owner,
        heir,
        sequence: standing ? current + SEQ_RESERVE : current + 1n,
        minSequence: standing ? current : undefined,
      }),
    }
  }

  console.log('\n1. The heir tries immediately — the account was just touched.')
  for (const name of Object.keys(plans)) {
    const outcome = await submit(plans[name].tx)
    check(`${name}: rejected while owner is active`, outcome.accepted, false)
    if (!outcome.accepted && name === 'standing-active') {
      console.log(`        chain says: ${outcome.reason}`)
    }
  }

  console.log('\n2. Owners live their lives; one owner cancels.')
  await heartbeat(standingActive)
  await heartbeat(standingActive)
  await heartbeat(standingActive)
  console.log('   standing-active: 3 ordinary transactions')
  await heartbeat(oneshotActive)
  console.log('   oneshot-active: 1 ordinary transaction')
  await bumpPast(standingBumped, plans['standing-bumped'].reserved)
  console.log('   standing-bumped: sequence bumped past the reserved slot (cancel)')
  console.log('   oneshot-idle: untouched')

  console.log(`\n3. Silence for ${IDLE_SECONDS}s...`)
  await sleep((IDLE_SECONDS + 5) * 1000)

  console.log('\n4. The heir tries again.')
  const outcomes = {}
  for (const name of Object.keys(plans)) {
    outcomes[name] = await submit(plans[name].tx)
  }

  check('standing-active: takes over despite prior activity', outcomes['standing-active'].accepted, true)
  check('oneshot-idle: takes over after silence', outcomes['oneshot-idle'].accepted, true)
  check('oneshot-active: destroyed by a single transaction', outcomes['oneshot-active'].accepted, false)
  check('standing-bumped: destroyed by the cancel', outcomes['standing-bumped'].accepted, false)

  console.log('\n5. Did the heir actually gain control?')
  const takenOver = await server.loadAccount(standingActive.publicKey())
  const heirSigner = takenOver.signers.find((s) => s.key === heir.publicKey())
  const master = takenOver.signers.find((s) => s.key === standingActive.publicKey())
  check('heir is now a signer', heirSigner?.weight, 1)
  check('owner key is stood down', master?.weight, 0)

  const failures = results.filter((r) => !r.passed)
  console.log(`\n${results.length - failures.length}/${results.length} checks passed`)
  if (outcomes['standing-active'].accepted) {
    console.log(`takeover tx: ${outcomes['standing-active'].hash}`)
    console.log(`account:     ${standingActive.publicKey()}`)
  }
  for (const name of ['oneshot-active', 'standing-bumped']) {
    console.log(`${name} rejected with: ${outcomes[name].reason}`)
  }

  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('\nverification crashed:', error)
  process.exit(1)
})
