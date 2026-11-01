"use client";
import {useRef,useState} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useNearWallet} from "@/contexts/NearWalletProvider";
import {workspaceFetch} from "@/presentation/services/api/seeded-workspace";
import {createNearReader} from "@/services/near/rpc";
import {getNearNetwork} from "@/services/near/network";
import {vaultFundingCall} from "@/services/near/contract-actions";
import {verifyVaultFunding} from "@/services/near/vault-settlement";
import {parseAmount} from "@/services/near/amount";
import {pendingSubmission,reconcilePendingSubmission} from "@/services/wallet/web3auth-near";
export default function VaultFunding({vaultId}:{vaultId:string}) {
 const wallet=useNearWallet(),queries=useQueryClient(),sending=useRef(false);
 const [amount,setAmount]=useState(""),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function fund() {
  if(sending.current || !wallet.address)return;sending.current=true;setBusy(true);setMessage("");
  try {
   const network=getNearNetwork(),key=`settlbox:near:vault-funding:${network.networkId}:${vaultId}:${wallet.address}`;
   const deployment=await workspaceFetch<{accountId:string;networkId:string}>("/api/treasury/human-wallet");
   if(deployment.accountId!==vaultId || deployment.networkId!==network.networkId)throw new Error("Native funding deployment changed");
   const raw=localStorage.getItem(key);
   const intent:{id:string;amount:string;hash?:string}=raw?JSON.parse(raw):{id:crypto.randomUUID(),amount:amount.trim()};
   const call=vaultFundingCall(network.usdcContractId,vaultId,intent.amount,intent.id);
   localStorage.setItem(key,JSON.stringify(intent));
   const prior=pendingSubmission(wallet.address);
   if(!intent.hash && prior?.contractId===call.contractId && prior.methodName===call.methodName && JSON.stringify(prior.args)===JSON.stringify(call.args))intent.hash=prior.hash;
   const reader=createNearReader();
   if(!intent.hash) {
    if(prior)await reconcilePendingSubmission(wallet.address);
    if(await reader.getUsdcBalance(wallet.address)<parseAmount(intent.amount))throw new Error("Insufficient native USDC for the saved funding amount");
    if(!await reader.view(network.usdcContractId,"storage_balance_of",{account_id:vaultId})) {
     const bounds=await reader.view<{min:string}>(network.usdcContractId,"storage_balance_bounds",{});
     const registration=await wallet.callContract({contractId:network.usdcContractId,methodName:"storage_deposit",args:{account_id:vaultId,registration_only:true},deposit:bounds.min});
     throw new Error(`Vault USDC storage registration submitted: ${registration}. Check confirmation, then review the saved funding amount again. No USDC was sent.`);
    }
    intent.hash=await wallet.callContract(call);
   }
   localStorage.setItem(key,JSON.stringify(intent));
   verifyVaultFunding(await reader.getReceipt(intent.hash,wallet.address),call,vaultId,{hash:intent.hash,signerId:wallet.address});
   if(pendingSubmission(wallet.address)?.hash===intent.hash)await reconcilePendingSubmission(wallet.address);
   localStorage.removeItem(key);setAmount("");await wallet.refreshBalance();await queries.invalidateQueries({queryKey:["treasury-vault"]});
   setMessage(`Native vault deposit confirmed: ${intent.amount} USDC.`);
  }catch(error){setMessage(error instanceof Error?error.message:"Funding is unresolved. Check the original transaction before retrying");}
  finally{sending.current=false;setBusy(false);}
 }
 return <div className="space-y-2 rounded-lg border border-primary-divider p-3"><p className="font-medium">Fund the native vault</p><p className="text-sm text-text-secondary">Funding uses the token's deposit callback to credit the vault ledger. NEAR pays gas and token storage.</p><label className="block text-sm">USDC amount<input value={amount} onChange={event=>setAmount(event.target.value)} disabled={busy} inputMode="decimal" className="block rounded-lg border border-primary-divider bg-background p-2"/></label><button disabled={busy||!wallet.address} onClick={()=>void fund()} className="rounded-lg border border-primary-divider px-3 py-2 text-sm disabled:opacity-50">{busy?"Checking deposit…":"Fund or check saved deposit"}</button>{message&&<p role="status" className="break-all text-sm">{message}</p>}</div>;
}
