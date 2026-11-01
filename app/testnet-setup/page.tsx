"use client";
import {useState,useEffect} from 'react';
import {PrimaryButton} from '@/presentation/components/Common/PrimaryButton';
import {SecondaryButton} from '@/presentation/components/Common/SecondaryButton';
import {useTitle} from '@/presentation/contexts/TitleProvider';
import {pendingSubmission,reconcilePendingSubmission} from '@/services/wallet/web3auth-near';
import {useNearWallet} from '@/contexts/NearWalletProvider';
type Plan={networkId:'testnet';parent:string;accounts:{kind:string;accountId:string;near:string;deposit:string;publicKey:string;exists:boolean}[]};
export default function TestnetSetup(){
 const wallet=useNearWallet(),[plan,setPlan]=useState<Plan>(),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const {setTitle,setShowBackArrow}=useTitle();
 useEffect(()=>{setTitle(<span className="text-[14px] font-medium text-text-primary">Wallet setup</span>);setShowBackArrow(false);},[setTitle,setShowBackArrow]);
 async function prepare(){setBusy(true);try{const response=await fetch('/api/setup/embedded',{method:'POST'});const result=await response.json();if(!response.ok)throw new Error(result.error);setPlan(result);setMessage('Review deployment accounts. Funding uses your embedded Web3Auth wallet.');}catch(error){setMessage(String(error));}finally{setBusy(false);}}
 async function fund(account:Plan['accounts'][number]){if(!plan)return;setBusy(true);try{if(wallet.address!==plan.parent)throw new Error('Connect the embedded company wallet shown above');if(pendingSubmission(plan.parent)){await reconcilePendingSubmission(plan.parent);if(pendingSubmission(plan.parent))throw new Error('Wait for the prior transaction to settle');}const response=await fetch('/api/setup/embedded',{method:'POST'});const fresh=await response.json();if(!response.ok)throw new Error(fresh.error);const current=(fresh as Plan).accounts.find(item=>item.kind===account.kind);if(!current||current.accountId!==account.accountId||current.deposit!==account.deposit||current.publicKey!==account.publicKey)throw new Error('Deployment plan changed; prepare it again');setPlan(fresh);if(current.exists){setMessage('This deployment account already exists. No additional transfer was sent.');return;}const hash=await wallet.sendNative(account.accountId,account.deposit);setMessage(`Submitted native transaction: ${hash}. Verify account creation before continuing.`);await wallet.refreshBalance();}catch(error){setMessage(String(error));}finally{setBusy(false);}}
 return <main className="flex h-full w-full flex-col overflow-y-auto bg-background text-[14px] leading-5 text-text-primary">
  <div className="flex w-full items-start justify-between gap-4 px-6 pb-3 pt-6">
   <div className="flex flex-col gap-0.5"><h1 className="text-[26px] font-bold leading-tight tracking-tight">Wallet setup</h1><p className="text-[14px] text-text-secondary">Prepare your treasury accounts with your embedded Web3Auth wallet.</p></div>
  </div>
  <div className="flex flex-col gap-5 px-6 pb-6">
   <section className="flex flex-col gap-4 rounded-xl border border-primary-divider p-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-base font-semibold">Embedded wallet</h2><p className="mt-1 text-text-secondary">Connect the company wallet to review funding transfers.</p></div><PrimaryButton text="Connect Web3Auth wallet" disabled={busy||wallet.isConnecting} onClick={()=>void wallet.connect().catch(error=>setMessage(String(error)))} containerClassName="w-fit whitespace-nowrap"/></div>
    <div className="rounded-xl border border-primary-divider bg-app-background p-3"><p className="mb-1 text-xs text-text-secondary">Wallet address</p><p className="break-all">{wallet.address||'Connect to show address'}</p></div>
    <p className="text-text-secondary">Initial funding totals <span className="num text-text-primary">8.25 NEAR</span> plus network fees. Fund your embedded wallet with testnet NEAR first.</p>
   </section>
   <section className="flex flex-col gap-4 rounded-xl border border-primary-divider p-5">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-base font-semibold">Deployment accounts</h2><p className="mt-1 text-text-secondary">Review each account before funding. Contract deployment follows separately.</p></div><SecondaryButton text="Prepare or verify accounts" variant="light" disabled={busy} onClick={prepare} buttonClassName="w-fit whitespace-nowrap"/></div>
    <p className="text-text-secondary">Deployment keys stay on this computer and control their separate accounts with FullAccess. No external wallet connection is required.</p>
    {plan&&<><div className="rounded-xl border border-primary-divider bg-app-background p-3"><p className="mb-1 text-xs text-text-secondary">Company funding account</p><p className="break-all">{plan.parent}</p></div><div className="grid grid-cols-1 gap-4 xl:grid-cols-3">{plan.accounts.map(account=><div key={account.accountId} className="flex flex-col gap-3 rounded-xl border border-primary-divider bg-app-background p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold capitalize">{account.kind}</h3><span className="text-xs text-text-secondary">{account.exists?'Verified existing account':'Not created'}</span></div><p className="num text-2xl leading-none">{account.near} <span className="text-sm text-text-secondary">NEAR</span></p><div><p className="mb-1 text-xs text-text-secondary">Account ID</p><p className="break-all text-sm">{account.accountId}</p></div><details className="text-text-secondary"><summary className="cursor-pointer text-xs">FullAccess public key</summary><p className="mt-2 break-all text-xs">{account.publicKey}</p></details><SecondaryButton text={`Review ${account.kind} funding`} variant="light" disabled={busy||account.exists||wallet.address!==plan.parent} onClick={()=>void fund(account)} buttonClassName="mt-auto w-full"/></div>)}</div></>}
   </section>
   {message&&<p role="status" className="rounded-xl border border-primary-divider bg-app-background p-4 text-sm text-text-secondary">{message}{/Authentication required|Workspace owner sign-in required/.test(message)&&<> <a className="font-semibold text-text-primary underline" href="/login">Sign in again</a> to continue setup.</>}</p>}
  </div>
 </main>;
}
