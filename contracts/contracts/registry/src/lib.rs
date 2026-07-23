#![no_std]

//! heir registry — a non-custodial notary for heirloom plans.
//!
//! This contract never holds or moves assets. The actual takeover is a CAP-21
//! precondition transaction the owner signs off-chain and the network enforces.
//! What lives here is the *record*: who named whom, for how long a silence, and
//! in which mode — so an heir can discover a plan, and everyone can watch it
//! change through events. Custody stays with the account; only the paperwork is
//! on chain.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, Vec,
};

/// How a plan reacts to the owner's activity.
#[contracttype]
#[derive(Clone, Copy)]
pub enum Mode {
    /// Ordinary activity is fine; the plan fires only after a true silence and
    /// is cancelled deliberately.
    Standing = 0,
    /// One-shot: any transaction at all voids the plan.
    Sealed = 1,
}

/// Whether a plan is still in force.
#[contracttype]
#[derive(Clone, Copy)]
pub enum Status {
    Active = 0,
    Cancelled = 1,
}

/// The record kept for one owner.
#[contracttype]
#[derive(Clone)]
pub struct Plan {
    pub owner: Address,
    pub heir: Address,
    /// Seconds of silence after which the heir may take over.
    pub period: u64,
    pub mode: Mode,
    pub status: Status,
    /// Ledger time of the last sign of life (registration counts as one).
    pub last_seen: u64,
}

#[contracttype]
pub enum DataKey {
    /// owner -> Plan
    Plan(Address),
    /// heir -> the owners who named them, for discovery
    Heirs(Address),
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    PlanExists = 1,
    InvalidPeriod = 2,
    NoPlan = 3,
    NotActive = 4,
}

/// Emitted when a plan is recorded. Topics: `registered`, owner, heir — so an
/// heir can subscribe to exactly the plans that name them.
#[contractevent]
pub struct Registered {
    #[topic]
    pub owner: Address,
    #[topic]
    pub heir: Address,
    pub period: u64,
    pub mode: Mode,
}

/// Emitted on every sign of life. Topics: `heartbeat`, owner — the heir watches
/// this to know the clock just reset.
#[contractevent]
pub struct Heartbeat {
    #[topic]
    pub owner: Address,
    pub last_seen: u64,
}

/// Emitted when an owner calls off their plan. Topics: `cancelled`, owner, heir.
#[contractevent]
pub struct Cancelled {
    #[topic]
    pub owner: Address,
    #[topic]
    pub heir: Address,
}

// Persistent entries expire; keep a plan alive for a generous window so a demo
// (or a patient owner) does not lose it between heartbeats. ~30 days of ledgers
// at roughly five seconds each.
const DAY_LEDGERS: u32 = 17_280;
const PLAN_TTL: u32 = DAY_LEDGERS * 30;

/// Load an owner's plan, insisting it exists and is still in force. The two
/// error cases are kept apart so the caller can tell "you never had a plan"
/// from "your plan is already cancelled".
fn load_active(env: &Env, owner: &Address) -> Result<Plan, Error> {
    let plan: Plan = env
        .storage()
        .persistent()
        .get(&DataKey::Plan(owner.clone()))
        .ok_or(Error::NoPlan)?;
    if !matches!(plan.status, Status::Active) {
        return Err(Error::NotActive);
    }
    Ok(plan)
}

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {
    /// Record a plan for `owner`, naming `heir`, firing after `period` seconds
    /// of silence. The owner must authorize it, and may hold only one active
    /// plan at a time.
    pub fn register(
        env: Env,
        owner: Address,
        heir: Address,
        period: u64,
        mode: Mode,
    ) -> Result<(), Error> {
        owner.require_auth();

        if period == 0 {
            return Err(Error::InvalidPeriod);
        }

        let plan_key = DataKey::Plan(owner.clone());
        if let Some(existing) = env.storage().persistent().get::<_, Plan>(&plan_key) {
            if matches!(existing.status, Status::Active) {
                return Err(Error::PlanExists);
            }
        }

        let now = env.ledger().timestamp();
        let plan = Plan {
            owner: owner.clone(),
            heir: heir.clone(),
            period,
            mode,
            status: Status::Active,
            last_seen: now,
        };
        env.storage().persistent().set(&plan_key, &plan);
        env.storage()
            .persistent()
            .extend_ttl(&plan_key, PLAN_TTL, PLAN_TTL);

        // Index by heir so the heir side can find plans naming them without
        // scanning every owner.
        let heirs_key = DataKey::Heirs(heir.clone());
        let mut owners: Vec<Address> = env
            .storage()
            .persistent()
            .get(&heirs_key)
            .unwrap_or_else(|| Vec::new(&env));
        if !owners.contains(&owner) {
            owners.push_back(owner.clone());
            env.storage().persistent().set(&heirs_key, &owners);
            env.storage()
                .persistent()
                .extend_ttl(&heirs_key, PLAN_TTL, PLAN_TTL);
        }

        Registered {
            owner,
            heir,
            period,
            mode,
        }
        .publish(&env);

        Ok(())
    }

    /// A sign of life: reset the idle clock the plan is measured against. Only
    /// the owner can send it, and only while the plan is active.
    pub fn heartbeat(env: Env, owner: Address) -> Result<(), Error> {
        owner.require_auth();

        let mut plan = load_active(&env, &owner)?;
        let now = env.ledger().timestamp();
        plan.last_seen = now;

        let key = DataKey::Plan(owner.clone());
        env.storage().persistent().set(&key, &plan);
        env.storage().persistent().extend_ttl(&key, PLAN_TTL, PLAN_TTL);

        Heartbeat {
            owner,
            last_seen: now,
        }
        .publish(&env);

        Ok(())
    }

    /// Call off a plan. The record is kept but marked cancelled, so the heir
    /// index stays consistent and the history remains readable.
    pub fn cancel(env: Env, owner: Address) -> Result<(), Error> {
        owner.require_auth();

        let mut plan = load_active(&env, &owner)?;
        plan.status = Status::Cancelled;

        let key = DataKey::Plan(owner.clone());
        env.storage().persistent().set(&key, &plan);
        env.storage().persistent().extend_ttl(&key, PLAN_TTL, PLAN_TTL);

        Cancelled {
            owner,
            heir: plan.heir,
        }
        .publish(&env);

        Ok(())
    }
}

mod test;
