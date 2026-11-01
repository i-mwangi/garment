//! Draft native token escrow. Not deployed or represented as verified functionality.
use near_sdk::json_types::{U128, U64};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};
use std::collections::BTreeMap;

#[cfg(test)]
mod tests;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Active,
    Claiming,
    Refunding,
    Claimed,
    Refunded,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Gift {
    pub sender: AccountId,
    pub recipient: AccountId,
    pub amount: U128,
    pub expires_at_sec: U64,
    pub status: Status,
    pub attempt: U64,
}

#[near(serializers = [json])]
pub struct GiftDeposit {
    pub gift_id: String,
    pub recipient: AccountId,
    pub expires_at_sec: U64,
}

#[allow(dead_code)]
#[ext_contract(ft)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}
#[allow(dead_code)]
#[ext_contract(callback)]
trait Callback {
    fn on_transfer(&mut self, gift_id: String, attempt: U64) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct GiftEscrow {
    token_id: AccountId,
    gifts: BTreeMap<String, Gift>,
}

#[near]
impl GiftEscrow {
    #[init]
    pub fn new(token_id: AccountId) -> Self {
        Self {
            token_id,
            gifts: BTreeMap::new(),
        }
    }
    pub fn get_token_id(&self) -> AccountId {
        self.token_id.clone()
    }
    pub fn get_gift(&self, gift_id: String) -> Option<Gift> {
        self.gifts.get(&gift_id).cloned()
    }

    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        require!(
            env::predecessor_account_id() == self.token_id,
            "Unsupported token"
        );
        require!(
            amount.0 > 0 && msg.len() <= 1024 && self.gifts.len() < 1000,
            "Invalid gift or capacity reached"
        );
        let deposit: GiftDeposit =
            near_sdk::serde_json::from_str(&msg).expect("Invalid gift message");
        require!(
            !deposit.gift_id.is_empty()
                && deposit.gift_id.len() <= 128
                && deposit
                    .gift_id
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "Invalid gift ID"
        );
        require!(
            deposit.recipient != env::current_account_id()
                && deposit.expires_at_sec.0 > env::block_timestamp() / 1_000_000_000,
            "Invalid gift recipient or expiry"
        );
        require!(
            !self.gifts.contains_key(&deposit.gift_id),
            "Gift already exists"
        );
        self.gifts.insert(
            deposit.gift_id.clone(),
            Gift {
                sender: sender_id.clone(),
                recipient: deposit.recipient.clone(),
                amount,
                expires_at_sec: deposit.expires_at_sec,
                status: Status::Active,
                attempt: U64(0),
            },
        );
        Self::event(
            "gift_created",
            near_sdk::serde_json::json!({"gift_id":deposit.gift_id,"sender":sender_id,"recipient":deposit.recipient,"amount":amount,"expires_at_sec":deposit.expires_at_sec}),
        );
        PromiseOrValue::Value(U128(0))
    }

    #[payable]
    pub fn claim_gift(&mut self, gift_id: String) -> Promise {
        near_sdk::assert_one_yocto();
        let mut gift = self.gifts.get(&gift_id).expect("Gift not found").clone();
        require!(
            gift.status == Status::Active
                && env::block_timestamp() / 1_000_000_000 < gift.expires_at_sec.0,
            "Gift is unavailable or expired"
        );
        require!(
            env::predecessor_account_id() == gift.recipient,
            "Recipient authorization required"
        );
        gift.status = Status::Claiming;
        gift.attempt.0 = gift.attempt.0.checked_add(1).expect("Attempt overflow");
        self.gifts.insert(gift_id.clone(), gift.clone());
        self.dispatch(gift_id, &gift, gift.recipient.clone())
    }

    #[payable]
    pub fn refund_gift(&mut self, gift_id: String) -> Promise {
        near_sdk::assert_one_yocto();
        let mut gift = self.gifts.get(&gift_id).expect("Gift not found").clone();
        require!(
            gift.status == Status::Active
                && env::block_timestamp() / 1_000_000_000 >= gift.expires_at_sec.0,
            "Gift is unavailable or not expired"
        );
        require!(
            env::predecessor_account_id() == gift.sender,
            "Sender authorization required"
        );
        gift.status = Status::Refunding;
        gift.attempt.0 = gift.attempt.0.checked_add(1).expect("Attempt overflow");
        self.gifts.insert(gift_id.clone(), gift.clone());
        self.dispatch(gift_id, &gift, gift.sender.clone())
    }

    #[private]
    pub fn on_transfer(&mut self, gift_id: String, attempt: U64) -> bool {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Private callback only"
        );
        require!(
            env::promise_results_count() == 1,
            "One transfer result required"
        );
        let gift = self.gifts.get_mut(&gift_id).expect("Gift not found");
        require!(
            gift.attempt.0 == attempt.0
                && (gift.status == Status::Claiming || gift.status == Status::Refunding),
            "Stale gift callback"
        );
        let success = match env::promise_result_checked(0, 0) {
            Err(near_sdk::PromiseError::Failed) => false,
            // TooLong still means the token call succeeded; never refund its ledger.
            Ok(_) | Err(near_sdk::PromiseError::TooLong(_)) => true,
            Err(_) => env::panic_str("Unsupported transfer result; keep gift pending"),
        };
        let claiming = gift.status == Status::Claiming;
        gift.status = if success {
            if claiming {
                Status::Claimed
            } else {
                Status::Refunded
            }
        } else {
            Status::Active
        };
        Self::event(
            if success {
                if claiming {
                    "gift_claimed"
                } else {
                    "gift_refunded"
                }
            } else {
                "gift_transfer_failed"
            },
            near_sdk::serde_json::json!({"gift_id":gift_id,"attempt":attempt}),
        );
        success
    }
}

impl GiftEscrow {
    fn dispatch(&self, gift_id: String, gift: &Gift, recipient: AccountId) -> Promise {
        ft::ext(self.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(30))
            .ft_transfer(
                recipient,
                gift.amount,
                Some(format!("settlbox-gift:{}", gift_id)),
            )
            .then(
                callback::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(30))
                    .on_transfer(gift_id, gift.attempt),
            )
    }
    fn event(name: &str, data: near_sdk::serde_json::Value) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"settlbox_gift","version":"1.0.0","event":name,"data":[data]})
        ));
    }
}
