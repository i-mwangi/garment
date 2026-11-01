use super::*;
use near_sdk::PromiseResult;

#[test]
fn claim_and_refund_dispatch_to_the_correct_entitled_account() {
    use near_sdk::{mock::MockAction, test_utils::get_created_receipts};
    for (caller, seconds) in [("recipient.testnet", 20), ("sender.testnet", 100)] {
        let mut gifts = fixture();
        context(caller, 1, seconds, vec![]);
        if caller == "recipient.testnet" {
            gifts.claim_gift("gift_1".into()).detach();
        } else {
            gifts.refund_gift("gift_1".into()).detach();
        }
        let receipts = get_created_receipts();
        assert_eq!(receipts.len(), 2);
        assert_eq!(receipts[0].receiver_id, account("usdc.testnet"));
        let token_index = match &receipts[0].actions[0] {
            MockAction::FunctionCallWeight {
                receipt_index,
                method_name,
                args,
                attached_deposit,
                ..
            } => {
                assert_eq!(method_name, b"ft_transfer");
                assert_eq!(attached_deposit.as_yoctonear(), 1);
                assert_eq!(
                    near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(args).unwrap(),
                    near_sdk::serde_json::json!({"receiver_id":caller,"amount":"1000000","memo":"settlbox-gift:gift_1"})
                );
                *receipt_index
            }
            _ => panic!("Expected native token function call"),
        };
        assert_eq!(receipts[1].receiver_id, account("gifts.testnet"));
        assert_eq!(receipts[1].receipt_indices, vec![token_index]);
        match &receipts[1].actions[0] {
            MockAction::FunctionCallWeight {
                method_name, args, ..
            } => {
                assert_eq!(method_name, b"on_transfer");
                assert_eq!(
                    near_sdk::serde_json::from_slice::<near_sdk::serde_json::Value>(args).unwrap(),
                    near_sdk::serde_json::json!({"gift_id":"gift_1","attempt":"1"})
                );
            }
            _ => panic!("Expected dependent callback"),
        }
    }
}

#[test]
fn oversized_successful_result_cannot_reopen_a_claimed_gift() {
    let mut gifts = fixture();
    context("recipient.testnet", 1, 20, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
    context(
        "gifts.testnet",
        0,
        20,
        vec![PromiseResult::Successful(vec![7; 4096])],
    );
    assert!(gifts.on_transfer("gift_1".into(), U64(1)));
    assert_eq!(
        gifts.get_gift("gift_1".into()).unwrap().status,
        Status::Claimed
    );
}
use near_sdk::{test_utils::VMContextBuilder, testing_env};
fn account(value: &str) -> AccountId {
    value.parse().unwrap()
}
fn context(caller: &str, deposit: u128, seconds: u64, results: Vec<PromiseResult>) {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(account("gifts.testnet"))
        .predecessor_account_id(account(caller))
        .signer_account_id(account(caller))
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .block_timestamp(seconds * 1_000_000_000)
        .prepaid_gas(Gas::from_tgas(300));
    testing_env!(
        builder.build(),
        near_sdk::test_vm_config(),
        near_sdk::RuntimeFeesConfig::test(),
        Default::default(),
        results
    );
}
fn fixture() -> GiftEscrow {
    context("usdc.testnet", 0, 10, vec![]);
    let mut gifts = GiftEscrow::new(account("usdc.testnet"));
    let accepted = gifts.ft_on_transfer(
        account("sender.testnet"),
        U128(1_000_000),
        r#"{"gift_id":"gift_1","recipient":"recipient.testnet","expires_at_sec":"100"}"#.into(),
    );
    assert!(matches!(accepted, PromiseOrValue::Value(U128(0))));
    gifts
}
#[test]
fn failed_claim_reopens_gift_and_successful_retry_finishes_once() {
    let mut gifts = fixture();
    context("recipient.testnet", 1, 20, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
    assert_eq!(
        gifts.get_gift("gift_1".into()).unwrap().status,
        Status::Claiming
    );
    context("gifts.testnet", 0, 20, vec![PromiseResult::Failed]);
    assert!(!gifts.on_transfer("gift_1".into(), U64(1)));
    assert_eq!(
        gifts.get_gift("gift_1".into()).unwrap().status,
        Status::Active
    );
    context("recipient.testnet", 1, 30, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
    context(
        "gifts.testnet",
        0,
        30,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(gifts.on_transfer("gift_1".into(), U64(2)));
    assert_eq!(
        gifts.get_gift("gift_1".into()).unwrap().status,
        Status::Claimed
    );
}
#[test]
fn sender_can_refund_at_exact_expiry() {
    let mut gifts = fixture();
    context("sender.testnet", 1, 100, vec![]);
    drop(gifts.refund_gift("gift_1".into()));
    context(
        "gifts.testnet",
        0,
        100,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(gifts.on_transfer("gift_1".into(), U64(1)));
    assert_eq!(
        gifts.get_gift("gift_1".into()).unwrap().status,
        Status::Refunded
    );
}
#[test]
#[should_panic(expected = "Recipient authorization required")]
fn sender_cannot_claim_recipient_funds() {
    let mut gifts = fixture();
    context("sender.testnet", 1, 20, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
}
#[test]
#[should_panic(expected = "unavailable or expired")]
fn recipient_cannot_claim_at_expiry() {
    let mut gifts = fixture();
    context("recipient.testnet", 1, 100, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
}
#[test]
#[should_panic(expected = "not expired")]
fn sender_cannot_refund_early() {
    let mut gifts = fixture();
    context("sender.testnet", 1, 99, vec![]);
    drop(gifts.refund_gift("gift_1".into()));
}
#[test]
#[should_panic(expected = "unavailable")]
fn refund_cannot_race_in_flight_claim() {
    let mut gifts = fixture();
    context("recipient.testnet", 1, 99, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
    context("sender.testnet", 1, 100, vec![]);
    drop(gifts.refund_gift("gift_1".into()));
}
#[test]
#[should_panic(expected = "Gift already exists")]
fn deposits_cannot_replace_existing_gift_terms() {
    let mut gifts = fixture();
    context("usdc.testnet", 0, 20, vec![]);
    let _ = gifts.ft_on_transfer(
        account("attacker.testnet"),
        U128(2),
        r#"{"gift_id":"gift_1","recipient":"attacker.testnet","expires_at_sec":"200"}"#.into(),
    );
}
#[test]
#[should_panic(expected = "Unsupported token")]
fn fake_token_cannot_create_a_gift() {
    let mut gifts = fixture();
    context("fake.testnet", 0, 20, vec![]);
    let _ = gifts.ft_on_transfer(account("sender.testnet"), U128(1), "{}".into());
}
#[test]
#[should_panic(expected = "Private callback only")]
fn external_caller_cannot_forge_claim_completion() {
    let mut gifts = fixture();
    context("recipient.testnet", 1, 20, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
    context(
        "attacker.testnet",
        0,
        20,
        vec![PromiseResult::Successful(vec![])],
    );
    gifts.on_transfer("gift_1".into(), U64(1));
}
#[test]
#[should_panic(expected = "Stale gift callback")]
fn prior_attempt_callback_cannot_complete_a_retry() {
    let mut gifts = fixture();
    context("recipient.testnet", 1, 20, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
    context("gifts.testnet", 0, 20, vec![PromiseResult::Failed]);
    gifts.on_transfer("gift_1".into(), U64(1));
    context("recipient.testnet", 1, 30, vec![]);
    drop(gifts.claim_gift("gift_1".into()));
    context(
        "gifts.testnet",
        0,
        30,
        vec![PromiseResult::Successful(vec![])],
    );
    gifts.on_transfer("gift_1".into(), U64(1));
}

#[test]
fn failed_refund_preserves_sender_entitlement_for_retry() {
    let mut gifts = fixture();
    context("sender.testnet", 1, 100, vec![]);
    drop(gifts.refund_gift("gift_1".into()));
    context("gifts.testnet", 0, 100, vec![PromiseResult::Failed]);
    assert!(!gifts.on_transfer("gift_1".into(), U64(1)));
    assert_eq!(
        gifts.get_gift("gift_1".into()).unwrap().status,
        Status::Active
    );
    context("sender.testnet", 1, 101, vec![]);
    drop(gifts.refund_gift("gift_1".into()));
    context(
        "gifts.testnet",
        0,
        101,
        vec![PromiseResult::Successful(vec![])],
    );
    assert!(gifts.on_transfer("gift_1".into(), U64(2)));
    assert_eq!(
        gifts.get_gift("gift_1".into()).unwrap().status,
        Status::Refunded
    );
}
