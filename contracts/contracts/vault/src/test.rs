#![cfg(test)]

use super::*;
use registry::{Mode, Registry, RegistryClient as RealRegistry};
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Env,
};

/// A vault wired to a real registry — the cross-contract call is the thing
/// under test, so nothing here is mocked.
struct World<'a> {
    env: Env,
    vault: VaultClient<'a>,
    registry: RealRegistry<'a>,
}

fn world() -> World<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register(Registry, ());
    let vault_id = env.register(Vault, (registry_id.clone(),));

    World {
        vault: VaultClient::new(&env, &vault_id),
        registry: RealRegistry::new(&env, &registry_id),
        env,
    }
}

fn envelope_bytes(env: &Env) -> Bytes {
    // Stands in for a signed transaction envelope; the vault never reads into it.
    Bytes::from_slice(env, b"AAAAAgAAAAB-pre-signed-takeover")
}

#[test]
fn the_vault_remembers_its_registry() {
    let w = world();
    let stored = w.vault.registry_address();
    assert_eq!(stored, w.registry.address);
}

#[test]
fn sealing_needs_a_plan_in_the_registry() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    let result = w
        .vault
        .try_seal(&owner, &heir, &Delivery::Handover, &envelope_bytes(&w.env));
    assert_eq!(result, Err(Ok(Error::NoPlan)));
}

#[test]
fn sealing_refuses_a_package_for_the_wrong_heir() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);
    let stranger = Address::generate(&w.env);

    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);

    let result = w.vault.try_seal(
        &owner,
        &stranger,
        &Delivery::Handover,
        &envelope_bytes(&w.env),
    );
    assert_eq!(result, Err(Ok(Error::HeirMismatch)));
}

#[test]
fn sealing_refuses_an_empty_package() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);

    let result = w
        .vault
        .try_seal(&owner, &heir, &Delivery::Handover, &Bytes::new(&w.env));
    assert_eq!(result, Err(Ok(Error::EmptyEnvelope)));
}

#[test]
fn a_package_is_sealed_once_and_kept() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);
    let tx = envelope_bytes(&w.env);

    w.env.ledger().set_timestamp(1_000);
    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault.seal(&owner, &heir, &Delivery::Merge, &tx);

    let stored = w.vault.envelope(&owner).unwrap();
    assert_eq!(stored.owner, owner);
    assert_eq!(stored.heir, heir);
    assert_eq!(stored.delivery, Delivery::Merge);
    assert_eq!(stored.tx, tx);
    assert_eq!(stored.sealed_at, 1_000);
    assert_eq!(stored.claimed_at, None);

    let again = w.vault.try_seal(&owner, &heir, &Delivery::Merge, &tx);
    assert_eq!(again, Err(Ok(Error::AlreadySealed)));
}

#[test]
fn sealing_requires_the_owners_authorization() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault
        .seal(&owner, &heir, &Delivery::Handover, &envelope_bytes(&w.env));

    let auths = w.env.auths();
    assert_eq!(auths[0].0, owner);
}

#[test]
fn a_package_cannot_be_collected_before_the_silence_runs_out() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    w.env.ledger().set_timestamp(1_000);
    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault
        .seal(&owner, &heir, &Delivery::Handover, &envelope_bytes(&w.env));

    w.env.ledger().set_timestamp(1_499);
    assert_eq!(w.vault.try_claim(&owner), Err(Ok(Error::NotYet)));
    assert!(w.vault.claimable_for(&heir).is_empty());
}

#[test]
fn a_due_package_is_handed_to_whoever_asks() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);
    let tx = envelope_bytes(&w.env);

    w.env.ledger().set_timestamp(1_000);
    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault.seal(&owner, &heir, &Delivery::Handover, &tx);

    w.env.ledger().set_timestamp(1_500);
    let claimable = w.vault.claimable_for(&heir);
    assert_eq!(claimable.len(), 1);
    assert_eq!(claimable.get(0).unwrap(), owner);

    let collected = w.vault.claim(&owner);
    assert_eq!(collected.tx, tx);
    assert_eq!(collected.claimed_at, Some(1_500));

    // Claiming asks nobody's permission — the courier need not be the heir.
    assert!(w.env.auths().is_empty());
}

#[test]
fn a_package_is_handed_out_only_once() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    w.env.ledger().set_timestamp(1_000);
    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault
        .seal(&owner, &heir, &Delivery::Handover, &envelope_bytes(&w.env));

    w.env.ledger().set_timestamp(1_500);
    w.vault.claim(&owner);

    assert_eq!(w.vault.try_claim(&owner), Err(Ok(Error::AlreadyClaimed)));
    // And it drops off the heir's list, having been dealt with.
    assert!(w.vault.claimable_for(&heir).is_empty());
}

#[test]
fn a_sign_of_life_puts_the_package_back_out_of_reach() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    w.env.ledger().set_timestamp(1_000);
    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault
        .seal(&owner, &heir, &Delivery::Handover, &envelope_bytes(&w.env));

    w.env.ledger().set_timestamp(1_600);
    assert_eq!(w.vault.claimable_for(&heir).len(), 1);

    w.registry.heartbeat(&owner);
    assert_eq!(w.vault.try_claim(&owner), Err(Ok(Error::NotYet)));
    assert!(w.vault.claimable_for(&heir).is_empty());
}

#[test]
fn calling_off_a_plan_stops_the_package_being_collected() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    w.env.ledger().set_timestamp(1_000);
    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault
        .seal(&owner, &heir, &Delivery::Handover, &envelope_bytes(&w.env));

    w.registry.cancel(&owner);

    // Long past the silence, and still refused — the record decides, not the vault.
    w.env.ledger().set_timestamp(9_000);
    assert_eq!(w.vault.try_claim(&owner), Err(Ok(Error::NotYet)));
    assert!(w.vault.claimable_for(&heir).is_empty());
}

#[test]
fn an_owner_can_take_their_package_back_and_seal_another() {
    let w = world();
    let owner = Address::generate(&w.env);
    let heir = Address::generate(&w.env);

    w.registry.register(&owner, &heir, &500u64, &Mode::Standing);
    w.vault
        .seal(&owner, &heir, &Delivery::Handover, &envelope_bytes(&w.env));

    w.vault.unseal(&owner);
    assert_eq!(w.vault.envelope(&owner), None);

    // The slot is free again, and a different delivery can go in it.
    w.vault
        .seal(&owner, &heir, &Delivery::Merge, &envelope_bytes(&w.env));
    assert_eq!(w.vault.envelope(&owner).unwrap().delivery, Delivery::Merge);
}

#[test]
fn unsealing_nothing_errors() {
    let w = world();
    let owner = Address::generate(&w.env);

    assert_eq!(w.vault.try_unseal(&owner), Err(Ok(Error::NoEnvelope)));
}

#[test]
fn claiming_nothing_errors() {
    let w = world();
    let owner = Address::generate(&w.env);

    assert_eq!(w.vault.try_claim(&owner), Err(Ok(Error::NoEnvelope)));
}

#[test]
fn an_heir_sees_only_their_own_due_packages() {
    let w = world();
    let due = Address::generate(&w.env);
    let waiting = Address::generate(&w.env);
    let unsealed = Address::generate(&w.env);
    let someone_elses = Address::generate(&w.env);
    let heir = Address::generate(&w.env);
    let other_heir = Address::generate(&w.env);
    let tx = envelope_bytes(&w.env);

    w.env.ledger().set_timestamp(1_000);
    w.registry.register(&due, &heir, &500u64, &Mode::Standing);
    w.registry
        .register(&waiting, &heir, &5_000u64, &Mode::Standing);
    w.registry
        .register(&unsealed, &heir, &500u64, &Mode::Standing);
    w.registry
        .register(&someone_elses, &other_heir, &500u64, &Mode::Standing);

    w.vault.seal(&due, &heir, &Delivery::Handover, &tx);
    w.vault.seal(&waiting, &heir, &Delivery::Handover, &tx);
    w.vault
        .seal(&someone_elses, &other_heir, &Delivery::Handover, &tx);
    // `unsealed` has a plan past its silence but never left a package.

    w.env.ledger().set_timestamp(1_600);

    let mine = w.vault.claimable_for(&heir);
    assert_eq!(mine.len(), 1);
    assert_eq!(mine.get(0).unwrap(), due);

    let theirs = w.vault.claimable_for(&other_heir);
    assert_eq!(theirs.len(), 1);
    assert_eq!(theirs.get(0).unwrap(), someone_elses);
}
