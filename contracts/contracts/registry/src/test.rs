#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env};

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
