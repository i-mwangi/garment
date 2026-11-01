"use client";
import React, { useState, useEffect, useMemo } from "react";
import { useDemo } from "@/presentation/contexts/DemoProvider";
import { useTitle } from "@/presentation/contexts/TitleProvider";
import { PrimaryButton } from "@/presentation/components/Common/PrimaryButton";
import { SecondaryButton } from "@/presentation/components/Common/SecondaryButton";
import { Badge, BadgeStatus } from "@/presentation/components/Common/Badge";
import { TabContainer } from "@/presentation/components/Common/TabContainer";
import { Table } from "@/presentation/components/Common/Table";
import { ModalHeader } from "@/presentation/components/Common/ModalHeader";
import BaseModal from "@/presentation/components/Modal/BaseModal";
import InputFilled from "@/presentation/components/Common/Input/InputFilled";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, } from "recharts";
import toast from "react-hot-toast";
import {useNativeEarn,useNativeEarnAction} from "@/services/api/near-earn";
import {parseAmount} from "@/services/near/amount";
import { useEarnDashboard } from "@/presentation/services/api/provider-history";
function fmtUsd(n: number): string {
    if(!Number.isFinite(n))return "Unavailable";
    return n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}
function StatCard({ title, text }: {
    title: string;
    text: React.ReactNode;
}) {
    return (<div className="relative w-full h-full rounded-xl border border-primary-divider p-4 flex flex-col overflow-hidden gap-3" style={{
            backgroundImage: "url(/card/background.svg)",
            backgroundSize: "30%",
            backgroundPosition: "right",
            backgroundRepeat: "no-repeat",
        }}>
      <span className="text-text-secondary text-sm leading-none">{title}</span>
      {text}
    </div>);
}
function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length)
        return null;
    return (<div className="bg-background border border-primary-divider rounded-[8px] px-3 py-2 shadow-lg text-xs">
      <p className="font-semibold text-text-primary mb-1">{label}</p>
      <p style={{ color: "var(--badge-success-text)" }}>Earned: {fmtUsd(payload[0].value)}</p>
    </div>);
}
function HowItWorksModal({ isOpen, onClose }: {
    isOpen: boolean;
    onClose: () => void;
}) {
    const { EARN_APR, TVL } = useEarnDashboard();
    return (<BaseModal isOpen={isOpen} onClose={onClose}>
      <ModalHeader title="How Settlbox Earn Works" onClose={onClose} icon="/sidebar/earn.svg"/>
      <div className="flex flex-col w-[520px] p-5 rounded-b-2xl border-2 border-t-0 border-primary-divider bg-background gap-5">
        <div className="grid grid-cols-1 gap-4">
          {[
            {
                step: "1",
                title: "Deposit idle funds",
                desc: "USDC is supplied to Rhea on native NEAR without enabling collateral or borrowing.",
            },
            {
                step: "2",
                title: "Earn variable lending interest",
                desc: "The supply rate changes with borrowing demand. Historical yield records do not guarantee a current return.",
            },
            {
                step: "3",
                title: "Withdraw subject to liquidity",
                desc: "Redemption depends on wallet permissions, provider limits, available liquidity and applicable fees.",
            },
        ].map(({ step, title, desc }) => (<div key={step} className="flex items-start gap-3 bg-app-background rounded-xl p-4">
              <div className="w-7 h-7 rounded-full text-white flex items-center justify-center text-sm font-bold shrink-0" style={{ background: "var(--primary-button)" }}>
                {step}
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-text-primary">{title}</span>
                <span className="text-xs text-text-secondary leading-relaxed">{desc}</span>
              </div>
            </div>))}
        </div>

        <div className="flex gap-2">
          <div className="flex-1 bg-app-background rounded-lg px-3 py-2 flex flex-col gap-1">
            <span className="text-xs text-text-secondary">USDC pool supplied</span>
            <span className="text-base font-semibold text-text-primary">{fmtUsd(TVL)}</span>
          </div>
          <div className="flex-1 bg-app-background rounded-lg px-3 py-2 flex flex-col gap-1">
            <span className="text-xs text-text-secondary">Backing</span>
            <span className="text-base font-semibold text-text-primary">USDC lending</span>
          </div>
        </div>

        <SecondaryButton text="Got it" onClick={onClose} variant="light" buttonClassName="w-full"/>
      </div>
    </BaseModal>);
}
function DepositModal({ isOpen, onClose, accounts, }: {
    isOpen: boolean;
    onClose: () => void;
    accounts: {
        accountId: string;
        name: string;
    }[];
}) {
    const { EARN_APR } = useEarnDashboard();
    const [amount, setAmount] = useState("");
    const [selectedWallet, setSelectedWallet] = useState(accounts[0]?.accountId ?? "");
    const monthlyEst = Number(amount || 0) * (EARN_APR / 100 / 12);
    const actionMutation=useNativeEarnAction();
    const handleDeposit = async () => {
      try {
        if(parseAmount(amount)<=0n)throw new Error("Enter a positive six-decimal USDC amount");
        const result=await actionMutation.mutateAsync({action:"supply",amount});
        toast.success(result.registrationOnly?"Storage registered. Review the reserve transaction again.":"Native NEAR reserve transaction confirmed");
        if(!result.registrationOnly)onClose();
      }catch(error){toast.error(error instanceof Error?error.message:"Native Earn action could not be verified");}
    };
    return (<BaseModal isOpen={isOpen} onClose={onClose}>
      <ModalHeader title="Deposit to Earn" onClose={onClose} icon="/sidebar/earn.svg"/>
      <div className="flex flex-col w-[480px] p-5 rounded-b-2xl border-2 border-t-0 border-primary-divider bg-background gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="text-[14px] text-text-secondary font-barlow">From Wallet</p>
          <div className="flex gap-2">
            {accounts.map((acc) => (<button key={acc.accountId} onClick={() => setSelectedWallet(acc.accountId)} className={`flex-1 py-2 rounded-[12px] text-sm font-medium transition-all cursor-pointer border-b ${selectedWallet === acc.accountId
                ? "bg-app-background border-primary-blue text-text-primary" : "bg-app-background border-primary-divider text-text-secondary"}`}>
                {acc.name}
              </button>))}
          </div>
        </div>

        <InputFilled label="Amount (USDC)" placeholder="0.00" value={amount} type="number" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}/>

        {Number(amount) > 0 && (<div className="bg-badge-success-background border border-badge-success-border rounded-[12px] p-4 flex flex-col gap-2">
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Current supply APR</span>
              <span className="text-badge-success-text font-semibold">{Number.isFinite(EARN_APR)?`${EARN_APR}%`:"Unavailable"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Est. monthly yield</span>
              <span className="text-text-primary font-medium">{fmtUsd(monthlyEst)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">Est. annual yield</span>
              <span className="text-text-primary font-medium">{fmtUsd(monthlyEst * 12)}</span>
            </div>
          </div>)}

        <div className="bg-app-background rounded-[12px] border-b border-primary-divider p-3 flex items-start gap-2">
          <img src="/misc/info-icon.svg" alt="info" className="w-4 h-4 mt-0.5 shrink-0 opacity-40" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
          <p className="text-xs text-text-secondary leading-relaxed">
            USDC is supplied to the Rhea lending pool. Rates vary with borrowing demand.
            Withdrawals depend on available pool liquidity and provider controls.
          </p>
        </div>

        <div className="flex flex-row gap-2">
          <SecondaryButton text="Cancel" onClick={onClose} variant="light" buttonClassName="flex-1"/>
          <PrimaryButton text="Deposit" disabled={actionMutation.isPending} loading={actionMutation.isPending} onClick={handleDeposit} containerClassName="flex-1"/>
        </div>
      </div>
    </BaseModal>);
}
function WithdrawModal({ isOpen, onClose, accounts, }: {
    isOpen: boolean;
    onClose: () => void;
    accounts: {
        accountId: string;
        name: string;
    }[];
}) {
    const { AVAILABLE_TO_WITHDRAW } = useEarnDashboard();
    const [amount, setAmount] = useState("");
    const [selectedWallet, setSelectedWallet] = useState(accounts[0]?.accountId ?? "");
    const actionMutation=useNativeEarnAction();
    const handleWithdraw = async () => {
      try {
        if(parseAmount(amount)<=0n)throw new Error("Enter a positive six-decimal USDC amount");
        const result=await actionMutation.mutateAsync({action:"withdraw",amount});
        toast.success(result.registrationOnly?"Storage registered. Review the reserve transaction again.":"Native NEAR reserve transaction confirmed");
        if(!result.registrationOnly)onClose();
      }catch(error){toast.error(error instanceof Error?error.message:"Native Earn action could not be verified");}
    };
    return (<BaseModal isOpen={isOpen} onClose={onClose}>
      <ModalHeader title="Withdraw from Earn" onClose={onClose} icon="/sidebar/earn.svg"/>
      <div className="flex flex-col w-[480px] p-5 rounded-b-2xl border-2 border-t-0 border-primary-divider bg-background gap-5">
        <div className="flex flex-col gap-1.5">
          <p className="text-[14px] text-text-secondary font-barlow">Withdraw to Wallet</p>
          <div className="flex gap-2">
            {accounts.map((acc) => (<button key={acc.accountId} onClick={() => setSelectedWallet(acc.accountId)} className={`flex-1 py-2 rounded-[12px] text-sm font-medium transition-all cursor-pointer border-b ${selectedWallet === acc.accountId
                ? "bg-app-background border-primary-blue text-text-primary" : "bg-app-background border-primary-divider text-text-secondary"}`}>
                {acc.name}
              </button>))}
          </div>
        </div>

        <div className="relative">
          <InputFilled label="Amount (USDC)" placeholder="0.00" value={amount} type="number" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(e.target.value)}/>
          <button className="absolute right-3 top-9 text-xs font-semibold cursor-pointer" style={{ color: "var(--primary-blue)" }} onClick={() => setAmount(String(AVAILABLE_TO_WITHDRAW))}>
            MAX
          </button>
        </div>

        <div className="flex justify-between text-sm px-1">
          <span className="text-text-secondary">Available balance</span>
          <span className="text-text-primary font-medium">{fmtUsd(AVAILABLE_TO_WITHDRAW)}</span>
        </div>

        <div className="bg-app-background rounded-[12px] border-b border-primary-divider p-3 flex items-start gap-2">
          <img src="/misc/info-icon.svg" alt="info" className="w-4 h-4 mt-0.5 shrink-0 opacity-40" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}/>
          <p className="text-xs text-text-secondary leading-relaxed">
            Redemption requires current provider permissions and available liquidity. Fees may apply.
          </p>
        </div>

        <div className="flex flex-row gap-2">
          <SecondaryButton text="Cancel" onClick={onClose} variant="light" buttonClassName="flex-1"/>
          <PrimaryButton text="Withdraw" disabled={actionMutation.isPending} loading={actionMutation.isPending} onClick={handleWithdraw} containerClassName="flex-1"/>
        </div>
      </div>
    </BaseModal>);
}
export default function EarnPage() {
    const { error, EARN_APR, TOTAL_DEPOSITED, AVAILABLE_TO_WITHDRAW, TOTAL_EARNED, MONTHLY_YIELD, TVL, DAILY_YIELD_DATA, MONTHLY_YIELD_DATA, activity: historicalActivity } = useEarnDashboard();
    const reserve=useNativeEarn();
    const { setTitle, setShowBackArrow } = useTitle();
    const [showDepositModal, setShowDepositModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [chartPeriod, setChartPeriod] = useState("daily");
    const [activityTab, setActivityTab] = useState("all");
    const [currentPage, setCurrentPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    useEffect(() => {
        setTitle(<span className="text-[14px] font-medium text-text-primary">Earn</span>);
        setShowBackArrow(false);
    }, []);
    const accounts=useMemo(()=>reserve.data?[{accountId:reserve.data.wallet,name:"Company reserve"}]:[],[reserve.data?.wallet]);
    const chartData = chartPeriod === "daily" ? DAILY_YIELD_DATA : MONTHLY_YIELD_DATA;
    const filteredActivity = useMemo(() => {
        if (activityTab === "all")
            return historicalActivity;
        return historicalActivity.filter((a) => a.type === activityTab);
    }, [activityTab, historicalActivity]);
    const tableData = useMemo(() => {
        return filteredActivity.map((tx) => {
            const badgeStatus = tx.type === "yield"
                ? BadgeStatus.SUCCESS
                : tx.type === "deposit"
                    ? BadgeStatus.PUBLIC
                    : BadgeStatus.AWAITING;
            const badgeText = tx.type === "yield" ? "Yield" : tx.type === "deposit" ? "Deposit" : "Withdraw";
            const prefix = tx.type === "yield" ? "+" : tx.type === "deposit" ? "+" : "-";
            return {
                Type: (<div className="flex justify-start">
            <Badge status={badgeStatus} text={badgeText}/>
          </div>),
                Date: new Date(tx.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                }),
                Wallet: tx.wallet,
                Amount: (<span className="font-semibold" style={{
                        color: tx.type === "yield"
                            ? "var(--badge-success-text)" : tx.type === "withdraw"
                            ? "var(--badge-awaiting-text)" : "var(--text-primary)",
                    }}>
            {prefix}{fmtUsd(tx.amount)}
          </span>),
                Status: (<div className="flex justify-center">
            <Badge status={BadgeStatus.SUCCESS} text={tx.status}/>
          </div>),
            };
        });
    }, [filteredActivity]);
    if (reserve.isLoading) {
        return (<div className="flex w-full h-full flex-col gap-5 px-6 pt-6">
        <div className="w-48 h-8 rounded bg-gray-200 animate-pulse"/>
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (<div key={i} className="h-20 rounded-xl bg-gray-200 animate-pulse"/>))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (<div key={i} className="h-56 rounded-xl bg-gray-200 animate-pulse"/>))}
        </div>
        <div className="h-[300px] rounded-xl bg-gray-200 animate-pulse"/>
      </div>);
    }
    return (<>
      <div className="flex w-full h-full flex-col overflow-y-auto">{error && <div role="alert" className="mx-6 mt-4 rounded-xl border border-primary-divider p-4 text-sm text-text-primary"><p>{error.message}</p><button type="button" className="mt-2 text-primary-blue" onClick={() => void reserve.refetch()}>Retry reserve data</button></div>}{reserve.data && (!reserve.data.supported || !reserve.data.codeApproved) && <p role="status" className="mx-6 mt-4 text-sm text-text-secondary">{!reserve.data.supported ? "Native USDC is not available in this network's Rhea pool." : "Reserve transfers are unavailable until provider setup is complete."}</p>}
        
        <div className="flex w-full items-start justify-between gap-4 px-6 pt-6 pb-3">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-text-primary">Earn</h1>
              <button onClick={() => setShowInfoModal(true)} className="w-5 h-5 rounded-full border border-primary-divider flex items-center justify-center cursor-pointer hover:bg-app-background transition-colors">
                <span className="text-xs text-text-secondary font-medium leading-none">i</span>
              </button>
            </div>
            <p className="text-[14px] text-text-secondary">
              Manage treasury reserves and view yield activity.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <SecondaryButton text="Withdraw" variant="light" disabled={!reserve.data?.supported || !reserve.data?.codeApproved || !reserve.data?.canWithdraw || BigInt(reserve.data.withdrawableBaseUnits) === 0n} onClick={() => setShowWithdrawModal(true)} buttonClassName="w-fit whitespace-nowrap"/>
            <PrimaryButton text="Deposit" disabled={!reserve.data?.supported || !reserve.data?.codeApproved || !reserve.data?.canSupply} icon="/misc/plus-icon.svg" iconPosition="left" onClick={() => setShowDepositModal(true)} containerClassName="w-fit" buttonClassName="w-fit whitespace-nowrap"/>
          </div>
        </div>

        
        <div className="flex w-full flex-row gap-2 px-6 pb-2">
          <StatCard title="Supply APR" text={<span className="num text-2xl leading-none" style={{ color: "var(--badge-success-text)" }}>
                {Number.isFinite(EARN_APR)?`${EARN_APR}%`:"Unavailable"}
              </span>}/>
          <StatCard title="Supplied USDC" text={<span className="num text-text-primary text-2xl leading-none">
                {fmtUsd(TOTAL_DEPOSITED)}
              </span>}/>
          <StatCard title="Available to Withdraw" text={<span className="num text-text-primary text-2xl leading-none">
                {fmtUsd(AVAILABLE_TO_WITHDRAW)}
              </span>}/>
          <StatCard title="Historical earnings" text={<span className="num text-2xl leading-none" style={{ color: "var(--badge-success-text)" }}>
                +{fmtUsd(TOTAL_EARNED)}
              </span>}/>
        </div>

        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 pt-3">
          
          <div className="rounded-xl border border-primary-divider bg-background p-5">
            <div className="flex items-center justify-between mb-5">
              <span className="text-text-primary text-lg font-medium">Historical yield records</span>
              <TabContainer tabs={[
            { id: "daily", label: "Daily" },
            { id: "monthly", label: "Monthly" },
        ]} activeTab={chartPeriod} setActiveTab={setChartPeriod} textSize="sm" tabWidth={70}/>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--primary-divider)" vertical={false}/>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} interval={chartPeriod === "daily" ? 4 : 0}/>
                <YAxis tickFormatter={(v) => `$${v}`} tick={{ fontSize: 11, fill: "var(--text-secondary)" }} axisLine={false} tickLine={false} width={50}/>
                <RechartsTooltip content={<ChartTooltip />}/>
                <Line type="monotone" dataKey="earned" stroke="var(--primary-blue)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--primary-blue)", stroke: "var(--background)", strokeWidth: 2 }}/>
              </LineChart>
            </ResponsiveContainer>
          </div>

          
          <div className="rounded-xl border border-primary-divider bg-background p-5 flex flex-col gap-4">
            <span className="text-text-primary text-lg font-medium">Earnings Summary</span>
            <div className="flex-1 flex flex-col">
              {[
            { label: "Recorded Monthly Yield", value: MONTHLY_YIELD, sub: "Monthly" },
            { label: "Historical earnings", value: TOTAL_EARNED, sub: "All time" },
        ].map(({ label, value, sub }) => (<div key={label} className="flex items-center justify-between py-3 border-b border-primary-divider last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-text-primary">{label}</span>
                    <span className="text-xs text-text-secondary">{sub}</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: "var(--badge-success-text)" }}>
                    +{fmtUsd(value)}
                  </span>
                </div>))}
            </div>

            
            <div className="flex gap-2">
              <div className="flex-1 bg-app-background rounded-lg px-3 py-2 flex flex-col gap-1">
                <span className="text-xs text-text-secondary">USDC pool supplied</span>
                <span className="text-base font-semibold text-text-primary">{fmtUsd(TVL)}</span>
              </div>
              <div className="flex-1 bg-app-background rounded-lg px-3 py-2 flex flex-col gap-1">
                <span className="text-xs text-text-secondary">Backing</span>
                <span className="text-base font-semibold text-text-primary">USDC lending</span>
              </div>
            </div>
          </div>
        </div>

        
        <div className="flex w-full items-start justify-between gap-4 px-6 pt-6">
          <div className="flex flex-col gap-0.5">
            <h2 className="text-[20px] font-bold leading-tight tracking-tight text-text-primary">Activity</h2>
            <p className="text-[14px] text-text-secondary">All deposit, withdrawal, and yield transactions</p>
          </div>
        </div>

        
        <div className="mt-2 flex w-full items-center justify-between gap-2 border-b border-primary-divider px-6 pb-3">
          <TabContainer tabs={[
            { id: "all", label: "All" },
            { id: "deposit", label: "Deposits" },
            { id: "yield", label: "Yield" },
            { id: "withdraw", label: "Withdrawals" },
        ]} activeTab={activityTab} setActiveTab={setActivityTab} textSize="sm"/>
          <span className="text-sm text-text-secondary">{filteredActivity.length} transactions</span>
        </div>

        
        <div className="w-full p-5">
          <Table headers={["Type", "Date", "Wallet", "Amount", "Status"]} data={tableData} className="w-full" rowClassName="py-5" headerClassName="py-3" showPagination={true} showFooter={false} currentPage={currentPage} onPageChange={setCurrentPage} rowsPerPage={rowsPerPage} onRowsPerPageChange={setRowsPerPage}/>
        </div>
      </div>

      
      <HowItWorksModal isOpen={showInfoModal} onClose={() => setShowInfoModal(false)}/>
      <DepositModal isOpen={showDepositModal} onClose={() => setShowDepositModal(false)} accounts={accounts}/>
      <WithdrawModal isOpen={showWithdrawModal} onClose={() => setShowWithdrawModal(false)} accounts={accounts}/>
    </>);
}
