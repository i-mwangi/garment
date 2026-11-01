"use client";
import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import FinanceButton from "@/presentation/components/Common/FinanceButton";
import {workspaceFetch} from "@/presentation/services/api/seeded-workspace";
import {useNearWallet} from "@/contexts/NearWalletProvider";
import {getNearNetwork} from "@/services/near/network";
import WalletReview from "./WalletReview";
import VaultFunding from "./VaultFunding";
import OwnershipTransfer from "./OwnershipTransfer";
import type {AgentProposal} from "@/types/agent-operation";
export default function HumanWallet(_props:{administrator?:string}) {
 const wallet=useNearWallet();
 const config=useQuery({queryKey:["human-wallet-config"],queryFn:()=>workspaceFetch<{configured:boolean;accountId:string;ownerId:string;executionWallet:string;paused:boolean;networkId:string}>("/api/treasury/human-wallet"),retry:false});
 const [targetAddress,setTargetAddress]=useState(""),[proposal,setProposal]=useState<AgentProposal|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 async function prepare(action:string) {
  if(busy)return;setBusy(true);setMessage("");
  try {const result=await workspaceFetch<{proposal:AgentProposal}>("/api/treasury/human-wallet","POST",{action,address:targetAddress.trim(),requestId:crypto.randomUUID()});setProposal(result.proposal);}
  catch(error){setMessage(error instanceof Error?error.message:"Native action could not be prepared");}
  finally{setBusy(false);}
 }
 const button="rounded-lg border border-primary-divider px-4 py-2 text-sm disabled:opacity-50";
 return <div className="relative max-h-[80dvh] overflow-y-auto overscroll-contain rounded-2xl border border-primary-divider bg-background p-5 space-y-3"><h2 className="text-lg font-semibold">Human approval wallet</h2><p className="text-sm text-text-secondary">Review native NEAR permissions with Web3Auth. Execution uses a separate account whose restricted key cannot administer the vault or approve payments.</p>{config.error&&<p role="alert" className="text-sm text-red-600">{config.error.message}</p>}{wallet.address?<p className="break-all text-sm">{getNearNetwork().name} · {wallet.address}</p>:<FinanceButton className={button} disabled={wallet.isConnecting} onClick={()=>void wallet.connect().catch(error=>setMessage(error.message))}>Sign in with Web3Auth</FinanceButton>}{config.data&&<><p className="break-all text-sm">Vault owner: {config.data.ownerId}</p><p className="break-all text-sm">Restricted execution account: {config.data.executionWallet}</p><p className="text-sm">Vault is {config.data.paused?"paused":"active"}.</p></>}<label className="flex flex-col gap-2 text-sm">Approver, recipient or nominated administrator NEAR account<input value={targetAddress} onChange={event=>setTargetAddress(event.target.value)} disabled={busy} autoCapitalize="none" spellCheck={false} placeholder="recipient.testnet" className="rounded-lg border border-primary-divider p-2 bg-background"/></label>{wallet.address===config.data?.ownerId&&<div className="flex flex-wrap gap-3">{[["allow_approver","Add human approver"],["allow_recipient","Allow recipient"],["pause","Pause vault"],["unpause","Activate vault"],["configure_executor","Review executor assignment"]].map(([action,label])=><FinanceButton key={action} className={button} disabled={busy} onClick={()=>void prepare(action)}>{label}</FinanceButton>)}</div>}{wallet.address&&<>{config.data?.accountId&&<VaultFunding vaultId={config.data.accountId}/>}<OwnershipTransfer address={targetAddress}/></>}<FinanceButton className={button} disabled={config.isFetching} onClick={()=>void config.refetch()}>Refresh native vault details</FinanceButton>{message&&<p role="status" className="text-sm">{message}</p>}{proposal&&<WalletReview proposal={proposal} onClose={()=>setProposal(null)} onUpdated={()=>{void config.refetch();}}/>}</div>;
}
