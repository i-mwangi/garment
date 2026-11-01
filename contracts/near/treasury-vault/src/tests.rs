use super::*;
use near_sdk::PromiseResult;

#[test]
fn dispatch_binds_token_recipient_amount_and_private_callback() {
    use near_sdk::{mock::MockAction, test_utils::get_created_receipts};
    let mut vault = fixture();
    queue(&mut vault, "wire", 1_000_000, 10);
    execute(&mut vault, "wire", 10);
    let receipts = get_created_receipts();
    assert_eq!(receipts.len(), 2);
    assert_eq!(receipts[0].receiver_id, account("usdc.testnet"));
    let token_index = match &receipts[0].actions[0] {
        MockAction::FunctionCallWeight {
            receipt_index,
            method_name,
            args,
            attached_deposit,
            prepaid_gas,
            ..
        } => {
            assert_eq!(method_name, b"ft_transfer");
            assert_eq!(attached_deposit.as_yoctonear(), 1);
            assert_eq!(*prepaid_gas, Gas::from_tgas(30));
            assert_eq!(
                near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(args).unwrap(),
                near_sdk::serde_json::json!({"receiver_id":"recipient.testnet","amount":"1000000","memo":"settlbox-vault:wire"})
            );
            *receipt_index
        }
        _ => panic!("Expected native token function call"),
    };
    assert_eq!(receipts[1].receiver_id, account("vault.testnet"));
    assert_eq!(receipts[1].receipt_indices, vec![token_index]);
    match &receipts[1].actions[0] {
        MockAction::FunctionCallWeight {
            method_name,
            args,
            attached_deposit,
            ..
        } => {
            assert_eq!(method_name, b"on_transfer");
            assert_eq!(attached_deposit.as_yoctonear(), 0);
            assert_eq!(
                near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(args).unwrap(),
                near_sdk::serde_json::json!({"payment_id":"wire","attempt":"1"})
            );
        }
        _ => panic!("Expected dependent callback"),
    }
}

#[test]
fn oversized_successful_result_does_not_refund_spent_funds() {
    let mut vault = fixture();
    queue(&mut vault, "payload", 1_000_000, 10);
    execute(&mut vault, "payload", 10);
    context(
        "vault.testnet",
        0,
        10,
        vec![PromiseResult::Successful(vec![7; 4096])],
    );
    assert!(vault.on_transfer("payload".into(), U64(1)));
    assert_eq!(vault.liquid, 99_000_000);
    assert_eq!(
        vault.get_payment("payload".into()).unwrap().status,
        Status::Paid
    );
}
use near_sdk::{test_utils::VMContextBuilder, testing_env};

fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}
fn context(caller: &str, deposit: u128, day: u64, results: Vec<PromiseResult>) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("vault.testnet"))
        .predecessor_account_id(account(caller))
        .signer_account_id(account(caller))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(day * DAY_NS)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(
        builder.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}
fn fixture() -> TreasuryVault {
    context("owner.testnet", 0, 10, vec![]);
    let mut vault = TreasuryVault::new(
        account("owner.testnet"),
        account("executor.testnet"),
        account("usdc.testnet"),
        Policy {
            payment_limit: U128(20_000_000),
            daily_limit: U128(30_000_000),
            lifetime_limit: U128(100_000_000),
            approval_threshold: U128(10_000_000),
            liquidity_floor: U128(5_000_000),
            required_approvals: 2,
        },
    );
    context("owner.testnet", 1, 10, vec![]);
    vault.set_recipient(account("recipient.testnet"), true);
    vault.set_approver(account("owner.testnet"), true);
    vault.set_approver(account("reviewer.testnet"), true);
    vault.set_paused(false);
    context("usdc.testnet", 0, 10, vec![]);
    let accepted = vault.ft_on_transfer(
        account("owner.testnet"),
        U128(100_000_000),
        "deposit".into(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));
    vault
}
fn queue(vault: &mut TreasuryVault, id: &str, amount: u128, day: u64) {
    context("executor.testnet", 0, day, vec![]);
    vault.queue_payment(
        id.into(),
        account("recipient.testnet"),
        U128(amount),
        U64((day + 7) * 86400),
    );
}
fn approve(vault: &mut TreasuryVault, id: &str, day: u64) {
    for caller in ["owner.testnet", "reviewer.testnet"] {
        context(caller, 1, day, vec![]);
        vault.approve_payment(id.into());
    }
}
fn execute(vault: &mut TreasuryVault, id: &str, day: u64) {
    context("executor.testnet", 0, day, vec![]);
    drop(vault.execute_payment(id.into()));
}

#[test]
fn failed_transfer_restores_dispatch_day_and_retry_commits_once() {
    let mut vault = fixture();
    queue(&mut vault, "payment_1", 15_000_000, 10);
    approve(&mut vault, "payment_1", 10);
    execute(&mut vault, "payment_1", 10);
    assert_eq!(vault.liquid, 85_000_000);
    assert_eq!(vault.in_flight, 1);
    assert_eq!(vault.daily_committed(U64(10)).0, 15_000_000);
    context("vault.testnet", 0, 11, vec![PromiseResult::Failed]);
    assert!(!vault.on_transfer("payment_1".into(), U64(1)));
    assert_eq!(vault.liquid, 100_000_000);
    assert_eq!(vault.lifetime_committed, 0);
    assert_eq!(vault.in_flight, 0);
    assert_eq!(vault.daily_committed(U64(10)).0, 0);
    assert_eq!(
        vault.get_payment("payment_1".into()).unwrap().status,
        Status::Queued
    );
    execute(&mut vault, "payment_1", 11);
    context(
        "vault.testnet",
        0,
        11,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(vault.on_transfer("payment_1".into(), U64(2)));
    assert_eq!(vault.liquid, 85_000_000);
    assert_eq!(vault.lifetime_committed, 15_000_000);
    assert_eq!(vault.in_flight, 0);
    assert_eq!(vault.daily_committed(U64(11)).0, 15_000_000);
    assert_eq!(
        vault.get_payment("payment_1".into()).unwrap().status,
        Status::Paid
    );
}
#[test]
#[should_panic(expected = "More approvals required")]
fn payments_above_threshold_need_independent_approvals() {
    let mut vault = fixture();
    queue(&mut vault, "large", 15_000_000, 10);
    context("owner.testnet", 1, 10, vec![]);
    vault.approve_payment("large".into());
    execute(&mut vault, "large", 10);
}
#[test]
#[should_panic(expected = "Already approved")]
fn one_person_cannot_supply_two_approvals() {
    let mut vault = fixture();
    queue(&mut vault, "large", 15_000_000, 10);
    context("owner.testnet", 1, 10, vec![]);
    vault.approve_payment("large".into());
    vault.approve_payment("large".into());
}
#[test]
#[should_panic(expected = "Not an active human approver")]
fn executor_cannot_approve() {
    let mut vault = fixture();
    queue(&mut vault, "large", 15_000_000, 10);
    context("executor.testnet", 1, 10, vec![]);
    vault.approve_payment("large".into());
}
#[test]
#[should_panic(expected = "Spending limits exceeded")]
fn concurrent_dispatches_reserve_daily_limit_before_callbacks() {
    let mut vault = fixture();
    for id in ["first", "second"] {
        queue(&mut vault, id, 20_000_000, 10);
        approve(&mut vault, id, 10);
    }
    execute(&mut vault, "first", 10);
    execute(&mut vault, "second", 10);
}
#[test]
#[should_panic(expected = "Liquidity floor protected")]
fn liquidity_floor_cannot_be_spent() {
    let mut vault = fixture();
    context("owner.testnet", 1, 10, vec![]);
    let mut policy = vault.policy.clone();
    policy.liquidity_floor = U128(95_000_000);
    vault.set_policy(policy);
    queue(&mut vault, "floor", 10_000_000, 10);
    execute(&mut vault, "floor", 10);
}
#[test]
#[should_panic(expected = "policy changed")]
fn policy_change_invalidates_previous_queue() {
    let mut vault = fixture();
    queue(&mut vault, "policy", 1_000_000, 10);
    context("owner.testnet", 1, 10, vec![]);
    vault.set_policy(vault.policy.clone());
    execute(&mut vault, "policy", 10);
}
#[test]
#[should_panic(expected = "Duplicate payment")]
fn request_ids_cannot_be_reused() {
    let mut vault = fixture();
    queue(&mut vault, "same", 1_000_000, 10);
    queue(&mut vault, "same", 2_000_000, 10);
}
#[test]
#[should_panic(expected = "Unsupported token")]
fn arbitrary_tokens_cannot_credit_usdc() {
    let mut vault = fixture();
    context("fake.testnet", 0, 10, vec![]);
    let _ = vault.ft_on_transfer(account("owner.testnet"), U128(1), "deposit".into());
}
#[test]
#[should_panic(expected = "Private callback only")]
fn callers_cannot_forge_successful_callbacks() {
    let mut vault = fixture();
    queue(&mut vault, "small", 1_000_000, 10);
    execute(&mut vault, "small", 10);
    context(
        "attacker.testnet",
        0,
        10,
        vec![PromiseResult::Successful(vec![])],
    );
    vault.on_transfer("small".into(), U64(1));
}
#[test]
#[should_panic(expected = "Stale callback")]
fn completed_callbacks_cannot_be_replayed() {
    let mut vault = fixture();
    queue(&mut vault, "small", 1_000_000, 10);
    execute(&mut vault, "small", 10);
    context(
        "vault.testnet",
        0,
        10,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(vault.on_transfer("small".into(), U64(1)));
    vault.on_transfer("small".into(), U64(1));
}
#[test]
#[should_panic(expected = "pending transfers")]
fn paused_recovery_cannot_take_in_flight_funds() {
    let mut vault = fixture();
    queue(&mut vault, "small", 1_000_000, 10);
    execute(&mut vault, "small", 10);
    context("owner.testnet", 1, 10, vec![]);
    vault.set_paused(true);
    vault
        .recover("recovery".into(), account("owner.testnet"), U128(1))
        .detach();
}
#[test]
fn removing_required_approver_pauses_vault_and_owner_handover_is_explicit() {
    let mut vault = fixture();
    context("owner.testnet", 1, 10, vec![]);
    vault.set_approver(account("reviewer.testnet"), false);
    assert!(vault.paused);
    vault.propose_owner(account("next-owner.testnet"));
    assert_eq!(vault.owner, account("owner.testnet"));
    context("next-owner.testnet", 1, 10, vec![]);
    vault.accept_ownership();
    assert_eq!(vault.owner, account("next-owner.testnet"));
    assert!(vault.pending_owner.is_none());
}

#[test]
#[should_panic(expected = "Spending limits exceeded")]
fn lifetime_limit_does_not_reset_on_new_days() {
    let mut vault = fixture();
    context("owner.testnet", 1, 10, vec![]);
    let mut policy = vault.policy.clone();
    policy.lifetime_limit = U128(50_000_000);
    vault.set_policy(policy);
    for day in 10..13 {
        let id = format!("daily_{day}");
        queue(&mut vault, &id, 20_000_000, day);
        approve(&mut vault, &id, day);
        execute(&mut vault, &id, day);
        context(
            "vault.testnet",
            0,
            day,
            vec![PromiseResult::Successful(vec![])],
        );
        assert!(vault.on_transfer(id, U64(1)));
    }
}
#[test]
#[should_panic(expected = "Payment expired")]
fn execution_rejects_exact_expiry_boundary() {
    let mut vault = fixture();
    queue(&mut vault, "expired", 1_000_000, 10);
    execute(&mut vault, "expired", 17);
}
#[test]
fn failed_paused_recovery_restores_liquidity_without_spend() {
    let mut vault = fixture();
    context("owner.testnet", 1, 10, vec![]);
    vault.set_paused(true);
    drop(vault.recover(
        "recover_1".into(),
        account("owner.testnet"),
        U128(100_000_000),
    ));
    assert_eq!(vault.liquid, 0);
    assert_eq!(vault.in_flight, 1);
    context("vault.testnet", 0, 10, vec![PromiseResult::Failed]);
    assert!(!vault.on_transfer("recover_1".into(), U64(1)));
    assert_eq!(vault.liquid, 100_000_000);
    assert_eq!(vault.in_flight, 0);
    assert_eq!(vault.lifetime_committed, 0);
    assert_eq!(
        vault.get_payment("recover_1".into()).unwrap().status,
        Status::Cancelled
    );
}
