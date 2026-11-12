"use client";
import {useNativeEarn} from "@/services/api/near-earn";
import { useQuery } from "@tanstack/react-query";
import { useDemo } from "@/presentation/contexts/DemoProvider";
import { workspaceFetch } from "./seeded-workspace";
import type { GlobalAccountHistory, LiveCollectionView, YieldHistory } from "@/types/provider-history";

export function useProviderHistory() {
  const { activeEntityId } = useDemo();
  return useQuery({ queryKey: ["provider-history", activeEntityId], queryFn: () => workspaceFetch<{ globalAccounts: GlobalAccountHistory; yield: YieldHistory; liveCollection?: LiveCollectionView }>(`/api/provider-history?entity=${encodeURIComponent(activeEntityId)}`), staleTime: 0 });
}
export function useYieldHistory() {
  const history = useProviderHistory();
  const activity = history.data?.yield.activity || [];
  const monthly = history.data?.yield.monthly || [];
  return {
    error: history.error,
    EARN_APY: history.data?.yield.apy || 0,
    TOTAL_DEPOSITED: activity.reduce((sum, row) => sum + (row.type === "deposit" ? row.amount : row.type === "withdraw" ? -row.amount : 0), 0),
    AVAILABLE_TO_WITHDRAW: 0,
    TOTAL_EARNED: activity.filter(row => row.type === "yield").reduce((sum, row) => sum + row.amount, 0),
    MONTHLY_YIELD: monthly.at(-1)?.earned || 0,
    TVL: 0,
    DAILY_YIELD_DATA: activity.filter(row => row.type === "yield").map(row => ({ date: row.date.slice(0, 10), earned: row.amount })),
    MONTHLY_YIELD_DATA: monthly,
    activity,
  };
}

export function useEarnDashboard(){
 const historical=useYieldHistory(),native=useNativeEarn(),data=native.data;
 return {...historical,error:native.error || historical.error,EARN_APR:data?.apr===null || data?.apr===undefined?Number.NaN:Number(data.apr)*100,TOTAL_DEPOSITED:data?Number(data.suppliedUsdc):Number.NaN,AVAILABLE_TO_WITHDRAW:data?Number(data.withdrawableUsdc):Number.NaN,TVL:data?Number(data.poolSuppliedUsdc):Number.NaN,activity:[...(data?.activity||[]),...historical.activity.map(row=>({...row,status:'Historical provider record'}))]};
}
