#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger as _},
    Env,
};

fn setup(env: &Env) -> RegistryClient<'_> {
    let contract_id = env.register(Registry, ());
    RegistryClient::new(env, &contract_id)
}

#[test]
fn register_succeeds_once() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
}

#[test]
fn register_rejects_a_second_active_plan() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    let again = client.try_register(&owner, &heir, &1_000u64, &Mode::Standing);
    assert_eq!(again, Err(Ok(Error::PlanExists)));
}

#[test]
fn register_rejects_a_zero_period() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    let result = client.try_register(&owner, &heir, &0u64, &Mode::Sealed);
    assert_eq!(result, Err(Ok(Error::InvalidPeriod)));
}

#[test]
fn heartbeat_succeeds_on_an_active_plan() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    client.heartbeat(&owner);
}

#[test]
fn heartbeat_without_a_plan_errors() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);

    assert_eq!(client.try_heartbeat(&owner), Err(Ok(Error::NoPlan)));
}

#[test]
fn cancel_marks_the_plan_and_then_heartbeat_and_recancel_fail() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    client.cancel(&owner);

    // A cancelled plan is not active: no more heartbeats, no second cancel.
    assert_eq!(client.try_heartbeat(&owner), Err(Ok(Error::NotActive)));
    assert_eq!(client.try_cancel(&owner), Err(Ok(Error::NotActive)));
}

#[test]
fn cancel_without_a_plan_errors() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);

    assert_eq!(client.try_cancel(&owner), Err(Ok(Error::NoPlan)));
}

#[test]
fn a_cancelled_owner_can_register_again() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    client.cancel(&owner);
    // register() only rejects a *second active* plan, so this is allowed.
    client.register(&owner, &heir, &2_000u64, &Mode::Sealed);
}

#[test]
fn get_plan_reflects_the_full_lifecycle() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    assert_eq!(client.get_plan(&owner), None);

    env.ledger().set_timestamp(500);
    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    let plan = client.get_plan(&owner).unwrap();
    assert_eq!(plan.heir, heir);
    assert_eq!(plan.period, 1_000);
    assert_eq!(plan.status, Status::Active);
    assert_eq!(plan.last_seen, 500);

    env.ledger().set_timestamp(900);
    client.heartbeat(&owner);
    assert_eq!(client.get_plan(&owner).unwrap().last_seen, 900);

    client.cancel(&owner);
    assert_eq!(client.get_plan(&owner).unwrap().status, Status::Cancelled);
}

#[test]
fn plans_for_heir_lists_and_filters() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let heir = Address::generate(&env);
    let stranger = Address::generate(&env);
    let owner_a = Address::generate(&env);
    let owner_b = Address::generate(&env);

    assert_eq!(client.plans_for_heir(&heir).len(), 0);

    client.register(&owner_a, &heir, &1_000u64, &Mode::Standing);
    client.register(&owner_b, &heir, &2_000u64, &Mode::Sealed);
    assert_eq!(client.plans_for_heir(&heir).len(), 2);
    assert_eq!(client.plans_for_heir(&stranger).len(), 0);
}

#[test]
fn plans_for_heir_drops_a_stale_index_entry() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir_a = Address::generate(&env);
    let heir_b = Address::generate(&env);

    client.register(&owner, &heir_a, &1_000u64, &Mode::Standing);
    client.cancel(&owner);
    // Re-register naming a different heir. heir_a's index still lists this
    // owner, but the plan no longer points back, so it must be filtered out.
    client.register(&owner, &heir_b, &1_000u64, &Mode::Standing);

    assert_eq!(client.plans_for_heir(&heir_a).len(), 0);
    assert_eq!(client.plans_for_heir(&heir_b).len(), 1);
}
