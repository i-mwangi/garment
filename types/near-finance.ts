export interface NativeWalletReference {id:string;companyId:string;address:string;networkId:"testnet"|"mainnet"}
export interface NativeApprovalPolicy {allowedRecipients:readonly string[];maxPaymentBaseUnits:string;dailyLimitBaseUnits:string;approvalThresholdBaseUnits:string;requiredApprovals:number}
export interface NativePaymentIntent {id:string;companyId:string;walletId:string;recipient:string;amount:{symbol:"USDC";decimals:6;baseUnits:string};purpose:"payroll"|"invoice"|"bill"|"transfer";idempotencyKey:string}
export interface NativePaymentExecution {paymentId:string;status:string;transactionHash?:string;failureReason?:string}
export interface NativeTreasuryPayment {intent:NativePaymentIntent;execution:NativePaymentExecution}
export interface NativeTreasuryView {wallet:NativeWalletReference;balanceBaseUnits:string;policy:NativeApprovalPolicy;payments:NativeTreasuryPayment[]}
