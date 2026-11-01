"use client";
import {useMutation,useQuery,useQueryClient} from '@tanstack/react-query';
import {PaymentLinkRequestError} from './payment-link';
import {useNearWallet} from '@/contexts/NearWalletProvider';
import {getNearNetwork} from '@/services/near/network';
import {createNearReader} from '@/services/near/rpc';
import {verifyExecutorCall} from '@/services/near/vault-settlement';
import {pendingSubmission,reconcilePendingSubmission} from '@/services/wallet/web3auth-near';
import type {NearContractCall} from '@/types/near-contracts';
export type {NativeTreasuryView as TreasuryView} from '@/types/near-finance';
import type {NativeTreasuryView,NativeTreasuryPayment} from '@/types/near-finance';
async function request<T>(path:string,method='GET',body?:unknown):Promise<T>{const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const result=await response.json();if(!response.ok)throw new PaymentLinkRequestError(result?.error||'Native treasury request failed',response.status);return result as T;}
export function useTreasury(){return useQuery({queryKey:['treasury'],queryFn:()=>request<NativeTreasuryView>('/api/treasury'),retry:(attempt,error)=>!(error instanceof PaymentLinkRequestError && error.status===401)&&attempt<2});}
export async function authorizeNativeTreasuryPayment(id:string,wallet:{address:string|null;callContract:(call:NearContractCall)=>Promise<string>},operation:"approve"|"cancel"="approve") {
 if(!wallet.address)throw new Error('Sign in with the native NEAR approver wallet');
 const key=`settlbox:near:treasury-${operation}:${getNearNetwork().networkId}:${wallet.address}:${id}`,raw=localStorage.getItem(key);
 const prepared:{call:NearContractCall;signerId:string;networkId:string;hash?:string}=raw?JSON.parse(raw):await request(`/api/treasury/payments/${encodeURIComponent(id)}/${operation}`,'POST');
 if(prepared.signerId!==wallet.address || prepared.networkId!==getNearNetwork().networkId)throw new Error('Native approval belongs to another wallet or network');
 localStorage.setItem(key,JSON.stringify(prepared));
 const prior=pendingSubmission(wallet.address);
 if(!prepared.hash && prior?.contractId===prepared.call.contractId && prior.methodName===prepared.call.methodName && JSON.stringify(prior.args)===JSON.stringify(prepared.call.args))prepared.hash=prior.hash;
 if(!prepared.hash)prepared.hash=await wallet.callContract(prepared.call);
 localStorage.setItem(key,JSON.stringify(prepared));
 const outcome=await createNearReader().getReceipt(prepared.hash,wallet.address);
 if(outcome.final_execution_status==='FINAL' && 'Failure' in outcome.status){if(pendingSubmission(wallet.address)?.hash===prepared.hash){try{await reconcilePendingSubmission(wallet.address);}catch{}}localStorage.removeItem(key);throw new Error('Native approval failed. Review the saved payment before another signature');}
 verifyExecutorCall(outcome,prepared.call,{hash:prepared.hash,executorId:wallet.address});
 const result=await request<NativeTreasuryPayment>(`/api/treasury/payments/${encodeURIComponent(id)}/${operation}`,'POST',{transactionHash:prepared.hash});
 if(pendingSubmission(wallet.address)?.hash===prepared.hash)await reconcilePendingSubmission(wallet.address);
 localStorage.removeItem(key);return result;
}
export function useApproveTreasuryPayment(){const wallet=useNearWallet(),client=useQueryClient();return useMutation({mutationFn:(id:string)=>authorizeNativeTreasuryPayment(id,wallet),onSuccess:async()=>{await Promise.all([client.invalidateQueries({queryKey:['treasury']}),client.invalidateQueries({queryKey:['business-records']}),client.invalidateQueries({queryKey:['agent-payments']})]);}});}
