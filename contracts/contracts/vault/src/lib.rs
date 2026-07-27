#![no_std]

//! vault — where a sealed package waits for a silence to run out.
//!
//! The registry keeps the *record* of a plan. This contract keeps the *package*:
//! the transaction the owner signed but nobody submitted, which hands the
//! account to the heir. Storing it publicly is safe, and that is the whole
//! point. The chain refuses the transaction until the owner has truly gone
//! quiet, so a package that anybody can read is a package nobody can misuse —
//! and once it *is* due, anybody at all can be the courier. No server has to be
//! trusted, and no watcher has to be believed; if every watcher fails, the heir
//! can still walk up and take it.
//!
//! Whether a silence has run out is never decided here. That question belongs
//! to the contract that keeps the record, and this one only asks it.

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, Address,
    Bytes, Env, Vec,
};

/// How the account changes hands when the package is delivered.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Delivery {
    /// `SetOptions`: the heir becomes a signer and the owner's own key stands
    /// down. Assets never move — control does. Works for any account, whatever
    /// it holds.
    Handover = 0,
    /// `AccountMerge`: every lumen lands in the heir's own wallet and the
    /// account ceases to exist. Only possible while the account carries no
    /// subentries, and it takes nothing but XLM with it.
    Merge = 1,
    /// `SetOptions` again, but the owner's key keeps its weight: the heir joins
    /// rather than replaces. Nobody is ever locked out of their own account by
    /// a silence they did not mean — which matters most when the heir is a
    /// spare wallet of your own.
    Joint = 2,
}

/// A sealed package: signed, unsubmitted, waiting.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Envelope {
    pub owner: Address,
    pub heir: Address,
    pub delivery: Delivery,
    /// The signed transaction, as XDR.
    pub tx: Bytes,
    pub sealed_at: u64,
    /// Ledger time the package was handed out, once somebody has come for it.
    pub claimed_at: Option<u64>,
}

#[contracttype]
pub enum DataKey {
    /// The registry this vault trusts for the record. Set once, at deployment.
    Registry,
    /// owner -> Envelope
    Envelope(Address),
    /// Every owner holding a package here, so the vault can be asked what it
    /// contains instead of having to be watched as it fills.
    ///
    /// Without this, the only way to learn a package exists is to have seen the
    /// `Sealed` event go by — and events are kept for about a week, while a
    /// package is meant to wait for months. A courier that starts late, or
    /// misses a run, could never catch up, and the package it could not see
    /// would sit there due and undelivered. The list is the difference between
    /// a promise that holds and one that holds only if somebody was watching.
    ///
    /// One entry that grows: a few hundred owners is comfortable, and every
    /// seal rewrites the whole list, so this is the first thing that would need
    /// splitting if the vault ever filled up.
    Owners,
}

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Error {
    /// The registry knows of no plan in force for this owner.
    NoPlan = 1,
    /// The package names one heir and the plan names another.
    HeirMismatch = 2,
    AlreadySealed = 3,
    EmptyEnvelope = 4,
    NoEnvelope = 5,
    /// The owner has not been quiet for long enough yet.
    NotYet = 6,
    AlreadyClaimed = 7,
}

/// Emitted when a package is placed in the vault.
#[contractevent]
pub struct Sealed {
    #[topic]
    pub owner: Address,
    #[topic]
    pub heir: Address,
    pub delivery: Delivery,
}

/// Emitted when an owner takes their package back.
#[contractevent]
pub struct Unsealed {
    #[topic]
    pub owner: Address,
    #[topic]
    pub heir: Address,
}

/// Emitted when a package is handed out. This is the signal a watcher waits
/// for, and the receipt an heir can point at afterwards.
#[contractevent]
pub struct Claimed {
    #[topic]
    pub owner: Address,
    #[topic]
    pub heir: Address,
    pub delivery: Delivery,
}

/// The part of the registry this vault leans on.
///
/// Declared rather than imported: the vault calls the registry by address, so
/// only the shape of these questions belongs in this wasm, never the record's
/// implementation.
#[contractclient(name = "RegistryClient")]
pub trait RegistryInterface {
    fn active_heir(env: Env, owner: Address) -> Option<Address>;
    fn is_claimable(env: Env, owner: Address) -> bool;
    fn claimable_for(env: Env, heir: Address) -> Vec<Address>;
}

// A package must outlive the silence it waits on. Thirty days of ledgers,
// extended on every write, matching the registry's own window.
const DAY_LEDGERS: u32 = 17_280;
const ENVELOPE_TTL: u32 = DAY_LEDGERS * 30;

fn registry(env: &Env) -> RegistryClient<'_> {
    let address: Address = env
        .storage()
        .instance()
        .get(&DataKey::Registry)
        .expect("vault was deployed without a registry");
    RegistryClient::new(env, &address)
}

#[contract]
pub struct Vault;

#[contractimpl]
impl Vault {
    /// A vault is bound to one registry for life. Letting it be repointed later
    /// would mean the record could be swapped out from under every package
    /// already sealed.
    pub fn __constructor(env: Env, registry: Address) {
        env.storage().instance().set(&DataKey::Registry, &registry);
    }

    /// The registry this vault asks about silences.
    pub fn registry_address(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Registry)
            .expect("vault was deployed without a registry")
    }

    /// Place a signed package in the vault.
    ///
    /// `heir` is not taken on trust and not merely recorded: the package's
    /// transaction hands the account to one specific address, so a plan naming
    /// somebody else would leave a package that delivers to the wrong person.
    /// The registry is asked, and a disagreement is refused.
    pub fn seal(
        env: Env,
        owner: Address,
        heir: Address,
        delivery: Delivery,
        tx: Bytes,
    ) -> Result<(), Error> {
        owner.require_auth();

        if tx.is_empty() {
            return Err(Error::EmptyEnvelope);
        }

        let key = DataKey::Envelope(owner.clone());
        if env.storage().persistent().has(&key) {
            return Err(Error::AlreadySealed);
        }

        let named = registry(&env).active_heir(&owner).ok_or(Error::NoPlan)?;
        if named != heir {
            return Err(Error::HeirMismatch);
        }

        let envelope = Envelope {
            owner: owner.clone(),
            heir: heir.clone(),
            delivery,
            tx,
            sealed_at: env.ledger().timestamp(),
            claimed_at: None,
        };
        env.storage().persistent().set(&key, &envelope);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENVELOPE_TTL, ENVELOPE_TTL);

        let mut owners = Self::owners(env.clone());
        if !owners.contains(&owner) {
            owners.push_back(owner.clone());
            env.storage().persistent().set(&DataKey::Owners, &owners);
            env.storage()
                .persistent()
                .extend_ttl(&DataKey::Owners, ENVELOPE_TTL, ENVELOPE_TTL);
        }

        Sealed {
            owner,
            heir,
            delivery,
        }
        .publish(&env);

        Ok(())
    }

    /// Take a package back. Calling off a plan should not leave a signed
    /// transaction lying in the vault, so the interface does this alongside the
    /// registry's own cancel.
    pub fn unseal(env: Env, owner: Address) -> Result<(), Error> {
        owner.require_auth();

        let key = DataKey::Envelope(owner.clone());
        let envelope: Envelope = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NoEnvelope)?;

        env.storage().persistent().remove(&key);

        // The list names what the vault holds, so it has to shrink with it —
        // otherwise a courier keeps being sent after a package that is gone.
        let mut owners = Self::owners(env.clone());
        if let Some(at) = owners.first_index_of(&owner) {
            owners.remove(at);
            env.storage().persistent().set(&DataKey::Owners, &owners);
            env.storage()
                .persistent()
                .extend_ttl(&DataKey::Owners, ENVELOPE_TTL, ENVELOPE_TTL);
        }

        Unsealed {
            owner,
            heir: envelope.heir,
        }
        .publish(&env);

        Ok(())
    }

    /// Everyone holding a package here, claimed or still waiting.
    ///
    /// This is what makes delivery something anybody can run rather than
    /// something only a watcher who was present at the sealing can run. Ask the
    /// vault what it holds, ask the registry which of those silences have run
    /// out, deliver those. No history to have kept, nothing to have subscribed
    /// to in time.
    pub fn owners(env: Env) -> Vec<Address> {
        env.storage()
            .persistent()
            .get(&DataKey::Owners)
            .unwrap_or_else(|| Vec::new(&env))
    }

    /// The package sealed for `owner`, if there is one.
    ///
    /// Deliberately open. Contract storage is public whatever this says, and
    /// pretending otherwise would only be theatre — the package's safety comes
    /// from the chain refusing it early, not from anybody failing to find it.
    pub fn envelope(env: Env, owner: Address) -> Option<Envelope> {
        env.storage().persistent().get(&DataKey::Envelope(owner))
    }

    /// Hand out the package for `owner`.
    ///
    /// No authorization is asked for, and that is deliberate: the transaction
    /// inside is already signed and the chain will refuse it until it is due,
    /// so requiring a particular caller would buy nothing and would make the
    /// heir dependent on a watcher holding their key. Anybody may be the
    /// courier. What the call does buy is the check that it *is* due, and a
    /// `Claimed` event that says so on the record.
    pub fn claim(env: Env, owner: Address) -> Result<Envelope, Error> {
        let key = DataKey::Envelope(owner.clone());
        let mut envelope: Envelope = env
            .storage()
            .persistent()
            .get(&key)
            .ok_or(Error::NoEnvelope)?;

        if envelope.claimed_at.is_some() {
            return Err(Error::AlreadyClaimed);
        }
        if !registry(&env).is_claimable(&owner) {
            return Err(Error::NotYet);
        }

        envelope.claimed_at = Some(env.ledger().timestamp());
        env.storage().persistent().set(&key, &envelope);
        env.storage()
            .persistent()
            .extend_ttl(&key, ENVELOPE_TTL, ENVELOPE_TTL);

        Claimed {
            owner,
            heir: envelope.heir.clone(),
            delivery: envelope.delivery,
        }
        .publish(&env);

        Ok(envelope)
    }

    /// The owners whose packages `heir` may collect right now: named by the
    /// plan, past the silence, and actually holding a package. An heir looking
    /// at this list is looking at what they can act on and nothing else.
    pub fn claimable_for(env: Env, heir: Address) -> Vec<Address> {
        let due = registry(&env).claimable_for(&heir);

        let mut ready = Vec::new(&env);
        for owner in due.iter() {
            if let Some(envelope) = env
                .storage()
                .persistent()
                .get::<_, Envelope>(&DataKey::Envelope(owner.clone()))
            {
                if envelope.claimed_at.is_none() {
                    ready.push_back(owner);
                }
            }
        }
        ready
    }
}

mod test;
