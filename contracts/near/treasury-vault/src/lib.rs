//! Native NEAR port. Draft: must compile and pass sandbox verification before deployment.
use near_sdk::json_types::{U128, U64};
use near_sdk::{
    env, ext_contract, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseOrValue,
};
use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
mod tests;

const MAX_PAYMENTS: usize = 1000;
const MAX_RECIPIENTS: usize = 500;
const DAY_NS: u64 = 86_400_000_000_000;

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Policy {
    pub payment_limit: U128,
    pub daily_limit: U128,
    pub lifetime_limit: U128,
    pub approval_threshold: U128,
    pub liquidity_floor: U128,
    pub required_approvals: u32,
}
impl Policy {
    fn validate(&self) {
        require!(
            self.payment_limit.0 > 0
                && self.payment_limit.0 <= self.daily_limit.0
                && self.daily_limit.0 <= self.lifetime_limit.0,
            "Invalid payment limits"
        );
        require!(
            self.approval_threshold.0 <= self.payment_limit.0
                && self.required_approvals > 0
                && self.required_approvals <= 20,
            "Invalid approval policy"
        );
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Queued,
    Executing,
    Paid,
    Cancelled,
    RecoveryPending,
    Recovered,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug)]
pub struct Payment {
    pub recipient: AccountId,
    pub amount: U128,
    pub expires_at_sec: U64,
    pub policy_version: U64,
    pub approved_by: BTreeSet<AccountId>,
    pub status: Status,
    pub dispatch_day: U64,
    pub attempt: U64,
}

#[allow(dead_code)]
#[ext_contract(ft)]
trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}
#[allow(dead_code)]
#[ext_contract(callback)]
trait Callback {
    fn on_transfer(&mut self, payment_id: String, attempt: U64) -> bool;
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TreasuryVault {
    owner: AccountId,
    pending_owner: Option<AccountId>,
    executor: AccountId,
    token_id: AccountId,
    policy: Policy,
    policy_version: u64,
    paused: bool,
    recipients: BTreeSet<AccountId>,
    approvers: BTreeSet<AccountId>,
    payments: near_sdk::store::IterableMap<String, Payment>,
    // Deduct principal before dispatch. Unresolved transfers cannot consume it twice.
    liquid: u128,
    daily_committed: BTreeMap<u64, u128>,
    lifetime_committed: u128,
    in_flight: u32,
}

#[near]
impl TreasuryVault {
    #[init]
    pub fn new(owner: AccountId, executor: AccountId, token_id: AccountId, policy: Policy) -> Self {
        require!(owner != executor, "Owner and executor must differ");
        policy.validate();
        Self {
            owner,
            pending_owner: None,
            executor,
            token_id,
            policy,
            policy_version: 1,
            paused: true,
            recipients: BTreeSet::new(),
            approvers: BTreeSet::new(),
            payments: near_sdk::store::IterableMap::new(b"payments".to_vec()),
            liquid: 0,
            daily_committed: BTreeMap::new(),
            lifetime_committed: 0,
            in_flight: 0,
        }
    }

    pub fn get_config(&self) -> near_sdk::serde_json::Value {
        near_sdk::serde_json::json!({ "owner": self.owner, "pending_owner": self.pending_owner, "executor": self.executor,
            "token_id": self.token_id, "policy": self.policy, "policy_version": self.policy_version.to_string(), "paused": self.paused,
            "liquid": self.liquid.to_string(), "lifetime_committed": self.lifetime_committed.to_string(),
            "in_flight": self.in_flight, "approver_count": self.approvers.len() })
    }
    pub fn get_payment(&self, payment_id: String) -> Option<Payment> {
        self.payments.get(&payment_id).cloned()
    }
    pub fn is_recipient(&self, account_id: AccountId) -> bool {
        self.recipients.contains(&account_id)
    }
    pub fn is_approver(&self, account_id: AccountId) -> bool {
        self.approvers.contains(&account_id)
    }
    pub fn daily_committed(&self, day: U64) -> U128 {
        U128(*self.daily_committed.get(&day.0).unwrap_or(&0))
    }

    #[payable]
    pub fn set_policy(&mut self, policy: Policy) {
        self.owner_action();
        policy.validate();
        require!(
            policy.lifetime_limit.0 >= self.lifetime_committed,
            "Lifetime limit below committed spend"
        );
        if !self.paused {
            require!(
                self.approvers.len() >= policy.required_approvals as usize,
                "Insufficient approvers"
            );
        }
        self.policy = policy;
        self.bump();
    }
    #[payable]
    pub fn set_executor(&mut self, executor: AccountId) {
        self.owner_action();
        require!(
            executor != self.owner
                && Some(&executor) != self.pending_owner.as_ref()
                && !self.approvers.contains(&executor),
            "Executor must be separate from owners and approvers"
        );
        self.executor = executor;
        self.bump();
    }
    #[payable]
    pub fn set_recipient(&mut self, recipient: AccountId, allowed: bool) {
        self.owner_action();
        require!(
            recipient != env::current_account_id(),
            "Vault cannot pay itself"
        );
        if allowed {
            require!(
                self.recipients.contains(&recipient) || self.recipients.len() < MAX_RECIPIENTS,
                "Recipient capacity reached"
            );
            self.recipients.insert(recipient);
        } else {
            self.recipients.remove(&recipient);
        }
        self.bump();
    }
    #[payable]
    pub fn set_approver(&mut self, approver: AccountId, allowed: bool) {
        self.owner_action();
        require!(approver != self.executor, "Executor cannot approve");
        if allowed {
            require!(
                self.approvers.contains(&approver) || self.approvers.len() < 20,
                "Approver capacity reached"
            );
            self.approvers.insert(approver);
        } else {
            self.approvers.remove(&approver);
            if self.approvers.len() < self.policy.required_approvals as usize {
                self.paused = true;
            }
        }
        self.bump();
    }
    #[payable]
    pub fn set_paused(&mut self, paused: bool) {
        self.owner_action();
        if !paused {
            require!(
                self.approvers.len() >= self.policy.required_approvals as usize,
                "Insufficient approvers"
            );
        }
        self.paused = paused;
        self.bump();
    }
    #[payable]
    pub fn propose_owner(&mut self, owner: AccountId) {
        self.owner_action();
        require!(owner != self.executor, "Executor cannot own vault");
        self.pending_owner = Some(owner);
    }
    #[payable]
    pub fn accept_ownership(&mut self) {
        near_sdk::assert_one_yocto();
        let caller = env::predecessor_account_id();
        require!(
            self.pending_owner.as_ref() == Some(&caller) && caller != self.executor,
            "Only pending owner can accept"
        );
        self.owner = caller;
        self.pending_owner = None;
        self.bump();
    }

    // Only the configured token can credit the USDC ledger. Returning zero accepts it.
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
            amount.0 > 0 && (msg.is_empty() || msg == "deposit"),
            "Invalid deposit message"
        );
        self.liquid = self.liquid.checked_add(amount.0).expect("Deposit overflow");
        Self::event(
            "deposited",
            near_sdk::serde_json::json!({"sender_id": sender_id, "amount": amount}),
        );
        PromiseOrValue::Value(U128(0))
    }

    pub fn queue_payment(
        &mut self,
        payment_id: String,
        recipient: AccountId,
        amount: U128,
        expires_at_sec: U64,
    ) {
        self.executor_action();
        self.id(&payment_id);
        require!(
            !self.paused && self.recipients.contains(&recipient),
            "Vault paused or recipient denied"
        );
        require!(
            amount.0 > 0 && amount.0 <= self.policy.payment_limit.0,
            "Payment limit exceeded"
        );
        let now = env::block_timestamp() / 1_000_000_000;
        require!(
            expires_at_sec.0 > now && expires_at_sec.0 <= now + 30 * 86400,
            "Invalid expiry"
        );
        require!(
            !self.payments.contains_key(&payment_id) && (self.payments.len() as usize) < MAX_PAYMENTS,
            "Duplicate payment or capacity reached"
        );
        self.payments.insert(
            payment_id.clone(),
            Payment {
                recipient,
                amount,
                expires_at_sec,
                policy_version: U64(self.policy_version),
                approved_by: BTreeSet::new(),
                status: Status::Queued,
                dispatch_day: U64(0),
                attempt: U64(0),
            },
        );
        Self::event(
            "payment_queued",
            near_sdk::serde_json::json!({"payment_id": payment_id}),
        );
    }
    #[payable]
    pub fn approve_payment(&mut self, payment_id: String) {
        near_sdk::assert_one_yocto();
        let caller = env::predecessor_account_id();
        require!(
            self.approvers.contains(&caller) && caller != self.executor && !self.paused,
            "Not an active human approver"
        );
        let payment = self
            .payments
            .get_mut(&payment_id)
            .expect("Payment not found");
        require!(
            payment.status == Status::Queued
                && payment.policy_version.0 == self.policy_version
                && payment.expires_at_sec.0 > env::block_timestamp() / 1_000_000_000,
            "Payment changed or expired"
        );
        require!(
            payment.approved_by.insert(caller.clone()),
            "Already approved"
        );
        Self::event(
            "payment_approved",
            near_sdk::serde_json::json!({"payment_id": payment_id, "approver": caller}),
        );
    }
    #[payable]
    pub fn cancel_payment(&mut self, payment_id: String) {
        self.owner_action();
        let payment = self
            .payments
            .get_mut(&payment_id)
            .expect("Payment not found");
        require!(
            payment.status == Status::Queued,
            "Only queued payments can be cancelled"
        );
        payment.status = Status::Cancelled;
        Self::event(
            "payment_cancelled",
            near_sdk::serde_json::json!({"payment_id": payment_id}),
        );
    }
    pub fn execute_payment(&mut self, payment_id: String) -> Promise {
        self.executor_action();
        let mut payment = self
            .payments
            .get(&payment_id)
            .expect("Payment not found")
            .clone();
        require!(
            !self.paused
                && payment.status == Status::Queued
                && payment.policy_version.0 == self.policy_version,
            "Payment unavailable or policy changed"
        );
        require!(
            payment.expires_at_sec.0 > env::block_timestamp() / 1_000_000_000
                && self.recipients.contains(&payment.recipient),
            "Payment expired or recipient denied"
        );
        let amount = payment.amount.0;
        require!(
            amount <= self.policy.payment_limit.0,
            "Payment limit exceeded"
        );
        require!(
            amount <= self.policy.approval_threshold.0
                || payment.approved_by.len() >= self.policy.required_approvals as usize,
            "More approvals required"
        );
        let day = env::block_timestamp() / DAY_NS;
        let committed = self
            .daily_committed
            .get(&day)
            .copied()
            .unwrap_or(0)
            .checked_add(amount)
            .expect("Daily overflow");
        let lifetime = self
            .lifetime_committed
            .checked_add(amount)
            .expect("Lifetime overflow");
        require!(
            committed <= self.policy.daily_limit.0 && lifetime <= self.policy.lifetime_limit.0,
            "Spending limits exceeded"
        );
        let remaining = self
            .liquid
            .checked_sub(amount)
            .expect("Insufficient liquid USDC");
        require!(
            remaining >= self.policy.liquidity_floor.0,
            "Liquidity floor protected"
        );
        self.liquid = remaining;
        self.daily_committed.insert(day, committed);
        self.lifetime_committed = lifetime;
        self.in_flight = self.in_flight.checked_add(1).expect("In-flight overflow");
        payment.status = Status::Executing;
        payment.dispatch_day = U64(day);
        payment.attempt.0 += 1;
        self.payments.insert(payment_id.clone(), payment.clone());
        self.dispatch(payment_id, &payment)
    }

    #[payable]
    pub fn recover(&mut self, recovery_id: String, recipient: AccountId, amount: U128) -> Promise {
        self.owner_action();
        self.id(&recovery_id);
        require!(
            self.paused && self.in_flight == 0 && recipient != env::current_account_id(),
            "Pause and finish all pending transfers before recovery"
        );
        require!(
            amount.0 > 0
                && amount.0 <= self.liquid
                && !self.payments.contains_key(&recovery_id)
                && (self.payments.len() as usize) < MAX_PAYMENTS,
            "Invalid recovery"
        );
        self.liquid -= amount.0;
        self.in_flight += 1;
        let payment = Payment {
            recipient,
            amount,
            expires_at_sec: U64(0),
            policy_version: U64(self.policy_version),
            approved_by: BTreeSet::new(),
            status: Status::RecoveryPending,
            dispatch_day: U64(0),
            attempt: U64(1),
        };
        self.payments.insert(recovery_id.clone(), payment.clone());
        self.dispatch(recovery_id, &payment)
    }

    #[private]
    pub fn on_transfer(&mut self, payment_id: String, attempt: U64) -> bool {
        require!(
            env::predecessor_account_id() == env::current_account_id(),
            "Private callback only"
        );
        require!(
            env::promise_results_count() == 1,
            "One transfer result required"
        );
        let mut payment = self
            .payments
            .get(&payment_id)
            .expect("Payment not found")
            .clone();
        require!(
            payment.attempt.0 == attempt.0
                && (payment.status == Status::Executing
                    || payment.status == Status::RecoveryPending),
            "Stale callback"
        );
        let success = match env::promise_result_checked(0, 0) {
            Err(near_sdk::PromiseError::Failed) => false,
            // TooLong still means the token call succeeded; never refund its ledger.
            Ok(_) | Err(near_sdk::PromiseError::TooLong(_)) => true,
            Err(_) => env::panic_str("Unsupported transfer result; keep payment pending"),
        };
        let recovery = payment.status == Status::RecoveryPending;
        self.in_flight = self
            .in_flight
            .checked_sub(1)
            .expect("In-flight accounting error");
        if success {
            payment.status = if recovery {
                Status::Recovered
            } else {
                Status::Paid
            };
            Self::event(
                if recovery {
                    "recovered"
                } else {
                    "payment_executed"
                },
                near_sdk::serde_json::json!({"payment_id": payment_id, "recipient": payment.recipient, "amount": payment.amount}),
            );
        } else {
            self.liquid = self
                .liquid
                .checked_add(payment.amount.0)
                .expect("Liquid overflow");
            if !recovery {
                let daily = self
                    .daily_committed
                    .get_mut(&payment.dispatch_day.0)
                    .expect("Missing dispatch day");
                *daily = daily
                    .checked_sub(payment.amount.0)
                    .expect("Daily accounting error");
                self.lifetime_committed = self
                    .lifetime_committed
                    .checked_sub(payment.amount.0)
                    .expect("Lifetime accounting error");
                payment.status = Status::Queued;
            } else {
                payment.status = Status::Cancelled;
            }
            Self::event(
                "transfer_failed",
                near_sdk::serde_json::json!({"payment_id": payment_id}),
            );
        }
        self.payments.insert(payment_id, payment);
        success
    }
}

impl TreasuryVault {
    fn owner_action(&self) {
        near_sdk::assert_one_yocto();
        require!(
            env::predecessor_account_id() == self.owner,
            "Owner authorization required"
        );
    }
    fn executor_action(&self) {
        require!(
            env::predecessor_account_id() == self.executor,
            "Executor authorization required"
        );
    }
    fn bump(&mut self) {
        self.policy_version = self.policy_version.checked_add(1).expect("Policy overflow");
        Self::event(
            "policy_changed",
            near_sdk::serde_json::json!({"policy_version": self.policy_version.to_string()}),
        );
    }
    fn id(&self, value: &str) {
        require!(
            !value.is_empty()
                && value.len() <= 128
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_'),
            "Invalid request ID"
        );
    }
    fn dispatch(&self, payment_id: String, payment: &Payment) -> Promise {
        ft::ext(self.token_id.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(30))
            .ft_transfer(
                payment.recipient.clone(),
                payment.amount,
                Some(format!("settlbox-vault:{}", payment_id)),
            )
            .then(
                callback::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(30))
                    .on_transfer(payment_id, payment.attempt),
            )
    }
    fn event(name: &str, data: near_sdk::serde_json::Value) {
        env::log_str(&format!(
            "EVENT_JSON:{}",
            near_sdk::serde_json::json!({"standard":"settlbox_vault","version":"1.0.0","event":name,"data":[data]})
        ));
    }
}
