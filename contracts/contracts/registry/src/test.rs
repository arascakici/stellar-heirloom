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
