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

// require_auth is the entire security model — a plan may only be changed by its
// owner. mock_all_auths lets every call through but still records what was
// required, so env.auths() proves the owner's signature was demanded each time.

#[test]
fn register_requires_owner_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, owner);
}

#[test]
fn heartbeat_requires_owner_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    client.heartbeat(&owner);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, owner);
}

#[test]
fn cancel_requires_owner_auth() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    client.cancel(&owner);
    let auths = env.auths();
    assert_eq!(auths.len(), 1);
    assert_eq!(auths[0].0, owner);
}

// ---- the eligibility reads the vault leans on ----

#[test]
fn active_heir_names_the_heir_only_while_the_plan_stands() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);
    let stranger = Address::generate(&env);

    assert_eq!(client.active_heir(&owner), None);

    client.register(&owner, &heir, &1_000u64, &Mode::Standing);
    assert_eq!(client.active_heir(&owner), Some(heir.clone()));
    assert_eq!(client.active_heir(&stranger), None);

    client.cancel(&owner);
    assert_eq!(client.active_heir(&owner), None);
}

#[test]
fn is_claimable_turns_true_only_once_the_silence_has_run_out() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    env.ledger().set_timestamp(1_000);
    client.register(&owner, &heir, &500u64, &Mode::Standing);

    assert!(!client.is_claimable(&owner));

    // One second short of due.
    env.ledger().set_timestamp(1_499);
    assert!(!client.is_claimable(&owner));

    env.ledger().set_timestamp(1_500);
    assert!(client.is_claimable(&owner));
}

#[test]
fn a_heartbeat_pushes_the_claim_back_out_of_reach() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    env.ledger().set_timestamp(1_000);
    client.register(&owner, &heir, &500u64, &Mode::Standing);

    env.ledger().set_timestamp(1_600);
    assert!(client.is_claimable(&owner));

    // A sign of life takes it away again.
    client.heartbeat(&owner);
    assert!(!client.is_claimable(&owner));

    env.ledger().set_timestamp(2_100);
    assert!(client.is_claimable(&owner));
}

#[test]
fn a_cancelled_plan_is_never_claimable() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let owner = Address::generate(&env);
    let heir = Address::generate(&env);

    env.ledger().set_timestamp(1_000);
    client.register(&owner, &heir, &500u64, &Mode::Standing);
    client.cancel(&owner);

    env.ledger().set_timestamp(9_000);
    assert!(!client.is_claimable(&owner));
    assert!(client.claimable_for(&heir).is_empty());
}

#[test]
fn claimable_for_lists_only_what_the_heir_may_act_on() {
    let env = Env::default();
    env.mock_all_auths();
    let client = setup(&env);

    let due = Address::generate(&env);
    let waiting = Address::generate(&env);
    let someone_elses = Address::generate(&env);
    let heir = Address::generate(&env);
    let other_heir = Address::generate(&env);

    env.ledger().set_timestamp(1_000);
    client.register(&due, &heir, &500u64, &Mode::Standing);
    client.register(&waiting, &heir, &5_000u64, &Mode::Standing);
    client.register(&someone_elses, &other_heir, &500u64, &Mode::Standing);

    // Past the short silence, nowhere near the long one.
    env.ledger().set_timestamp(1_600);

    let claimable = client.claimable_for(&heir);
    assert_eq!(claimable.len(), 1);
    assert_eq!(claimable.get(0).unwrap(), due);

    // The other heir sees their own, and only their own.
    let theirs = client.claimable_for(&other_heir);
    assert_eq!(theirs.len(), 1);
    assert_eq!(theirs.get(0).unwrap(), someone_elses);
}
