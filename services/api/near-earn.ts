"use client";
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {useNearWallet} from '@/contexts/NearWalletProvider';
import {getNearNetwork} from '@/services/near/network';
import {pendingSubmission,reconcilePendingSubmission} from '@/services/wallet/web3auth-near';
import type {openNativeEarn} from '@/services/server/near-earn';
import type {AgentProposal} from '@/types/agent-operation';
type Position=Awaited<ReturnType<typeof openNativeEarn>>['data'] & {activity:{id:string;type:'deposit'|'withdraw';amount:number;date:string;wallet:string;status:string}[]};
type Prepared=Awaited<ReturnType<Awaited<ReturnType<typeof openNativeEarn>>['prepare']>> & {proposal:AgentProposal};
async function request<T>(body?:unknown):Promise<T>{const response=await fetch('/api/earn/near',{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store'});const result=await response.json();if(!response.ok)throw new Error(result.error||'Native Earn request failed');return result;}
export function useNativeEarn(){return useQuery({queryKey:['near-earn'],queryFn:()=>request<Position>(),retry:false,retryOnMount:false,refetchInterval:60000});}
export function useNativeEarnAction(){const wallet=useNearWallet(),client=useQueryClient();return useMutation({mutationFn:async({action,amount}:{action:'supply'|'withdraw';amount:string})=>{
 if(!wallet.address)throw new Error('Sign in with the company reserve NEAR wallet');
 const key=`settlbox:near:earn:${getNearNetwork().networkId}:${wallet.address}:${action}`,raw=localStorage.getItem(key);
 const intent:{requestId:string;amount:string;prepared?:Prepared;hash?:string}=raw?JSON.parse(raw):{requestId:crypto.randomUUID(),amount};
 if(intent.amount!==amount)throw new Error(`A saved ${action} of ${intent.amount} USDC needs verification before changing the amount`);
 localStorage.setItem(key,JSON.stringify(intent));
 if(!intent.prepared)intent.prepared=await request<Prepared>({action,amount,requestId:intent.requestId});
 const prepared=intent.prepared;
 if(prepared.wallet!==wallet.address || prepared.networkId!==getNearNetwork().networkId || prepared.action!==action || prepared.amount!==amount)throw new Error('Saved Earn review does not match the reserve wallet or amount');
 localStorage.setItem(key,JSON.stringify(intent));
 const prior=pendingSubmission(wallet.address);
 if(!intent.hash && prior && prior.contractId===prepared.call.contractId && prior.methodName===prepared.call.methodName && JSON.stringify(prior.args)===JSON.stringify(prepared.call.args))intent.hash=prior.hash;
 if(!intent.hash){if(Date.parse(prepared.proposal.expiresAt)<=Date.now())throw new Error('Earn review expired; check any submitted transaction before preparing another');intent.hash=await wallet.callContract(prepared.call);}
 localStorage.setItem(key,JSON.stringify(intent));
 const result=await request<Position & {registrationOnly:boolean}>({action:'verify',id:prepared.proposal.id,transactionHash:intent.hash});
 if(pendingSubmission(wallet.address)?.hash===intent.hash)await reconcilePendingSubmission(wallet.address);
 localStorage.removeItem(key);return result;
 },onSuccess:async()=>{await wallet.refreshBalance();await client.invalidateQueries({queryKey:['near-earn']});}});}
