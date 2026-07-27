/**
 * Keep a record of what the contracts have witnessed, before the network
 * forgets it.
 *
 * Soroban RPC holds events for about seven days. That is fine for a live feed
 * and useless for a count: the question "how many people have used this" is
 * about all of time, and the only place the answer could live is somewhere that
 * does not expire. So it lives in the repository, in git, where every addition
 * is dated and signed and anybody can check it against the chain rather than
 * take it on trust.
 *
 * This is deliberately not a database and deliberately not a dashboard. A
 * counter someone else hosts is a number you have to believe. A file of event
 * ids you can go and look up yourself is not.
 *
 * The snapshot only ever grows and never rewrites: events are merged by their
 * RPC id, which is unique and ordered, so running this twice is harmless and
 * running it late only costs whatever fell out of the window in between.
 *
 * Run: npm run usage:snapshot
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { Networks, rpc, scValToNative } from '@stellar/stellar-sdk'

const RPC = process.env.SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org'
const REGISTRY =
  process.env.REGISTRY_ID ?? 'CDWSKU743CENKIALSGUJRBUAAN5B5SBQG37XX2FSQO6XEXWXJA6VBEQU'
const VAULT =
  process.env.VAULT_ID ?? 'CANLQE764X2GHPCFHHDIBXPT35PATT2IIYRCFBK77O6EECKS3CPJDHPY'

const FILE = 'src/data/usage.json'
const KINDS = ['registered', 'heartbeat', 'cancelled', 'sealed', 'unsealed', 'claimed']

/** Empty when the file has never been written; otherwise what is already known. */
function load() {
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'))
    return { events: parsed.events ?? [] }
  } catch {
    return { events: [] }
  }
}

/**
 * One raw event, or null if it is not one of ours. Kept deliberately close to
 * the wire: this file's job is to preserve what happened, not to interpret it.
 * Anything clever belongs in the reader, which can be changed later — the
 * record cannot.
 */
function decode(raw) {
  let topics
  let body
  try {
    topics = raw.topic.map((t) => scValToNative(t))
    const decoded = scValToNative(raw.value)
    body = decoded && typeof decoded === 'object' ? decoded : {}
  } catch {
    return null
  }

  const [kind, owner, heir] = topics
  if (!KINDS.includes(kind) || typeof owner !== 'string') return null

  const event = {
    id: raw.id,
    kind,
    owner,
    ledger: raw.ledger,
    at: raw.ledgerClosedAt,
    txHash: raw.txHash,
  }
  if (typeof heir === 'string') event.heir = heir
  if (typeof body.period === 'bigint') event.period = Number(body.period)
  if (typeof body.mode === 'number') event.mode = body.mode
  if (typeof body.delivery === 'number') event.delivery = body.delivery
  return event
}

/**
 * Everything RPC still has, walked from the oldest ledger it kept.
 *
 * A page that finds nothing is not the end — the server scans a bounded stretch
 * of ledgers per request and hands back a cursor for where it stopped, so with
 * sparse events most pages are empty. What *is* the end is the cursor ceasing to
 * move, which is how it says it has reached the present. Measured against
 * testnet: fourteen requests to cross a seven-day window, where stopping at the
 * first empty page would have crossed about a third of it.
 */
async function walk(soroban) {
  const health = await soroban.getHealth()
  const filters = [{ type: 'contract', contractIds: [REGISTRY, VAULT] }]

  let request = { startLedger: health.oldestLedger, filters, limit: 200 }
  let previous = null
  const found = []

  for (let page = 0; page < 200; page += 1) {
    const response = await soroban.getEvents(request)
    for (const raw of response.events ?? []) {
      const event = decode(raw)
      if (event) found.push(event)
    }

    if (!response.cursor || response.cursor === previous) break
    previous = response.cursor
    request = { cursor: response.cursor, filters, limit: 200 }
  }

  return { found, oldestSeen: health.oldestLedger }
}

const soroban = new rpc.Server(RPC)
const known = load()
const { found, oldestSeen } = await walk(soroban)

const byId = new Map(known.events.map((event) => [event.id, event]))
let added = 0
for (const event of found) {
  if (!byId.has(event.id)) added += 1
  byId.set(event.id, event)
}

const events = [...byId.values()].sort((a, b) =>
  a.ledger === b.ledger ? a.id.localeCompare(b.id) : a.ledger - b.ledger,
)

const snapshot = {
  note: 'Written by scripts/usage-snapshot.mjs. Every id here can be looked up on chain.',
  network: process.env.NETWORK_PASSPHRASE ?? Networks.TESTNET,
  contracts: { registry: REGISTRY, vault: VAULT },
  events,
}

writeFileSync(FILE, `${JSON.stringify(snapshot, null, 2)}\n`)

const wallets = new Set()
for (const event of events) {
  wallets.add(event.owner)
  if (event.heir) wallets.add(event.heir)
}

console.log(`kept    ${events.length} event(s) from ${wallets.size} wallet(s)`)
console.log(`added   ${added} new since the last snapshot`)
console.log(`window  RPC still had everything from ledger ${oldestSeen}`)
if (added === 0 && known.events.length > 0) {
  console.log('nothing new — the record is already current')
}
