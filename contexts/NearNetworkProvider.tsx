"use client";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { create, useStore } from "zustand";
import { createNearReader } from "@/services/near/rpc";
type NearReader = ReturnType<typeof createNearReader>;
interface NearNetworkState {
  isLoading: boolean; error: string | null; blockNum: number | null; client: NearReader | null;
  initializeSdk: (config?: unknown) => Promise<void>;
  syncState: (client: NearReader) => Promise<void>;
}
function createNearNetworkStore() { return create<NearNetworkState>((set, get) => ({
  isLoading: false, error: null, blockNum: null, client: null,
  initializeSdk: async () => {
    set({ isLoading: true });
    try { const client = createNearReader(); await client.verifyNetwork(); set({ client }); await get().syncState(client); }
    catch (error) { set({ error: error instanceof Error ? error.message : "NEAR connection unavailable" }); }
    finally { set({ isLoading: false }); }
  },
  syncState: async client => { try { set({ blockNum: await client.getBlockNumber(), error: null }); } catch { set({ error: "Current NEAR data is unavailable" }); } },
})); }
const NetworkContext = createContext<ReturnType<typeof createNearNetworkStore> | null>(null);
export type NearNetworkStoreApi = ReturnType<typeof createNearNetworkStore>;
export const tickInterval = 30000;
export function NearNetworkProvider({ children }: { children: ReactNode }) {
  const store = useRef<ReturnType<typeof createNearNetworkStore> | null>(null);
  store.current ||= createNearNetworkStore();
  useEffect(() => {
    const current = store.current!; let active = true; let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => { const { client, syncState, initializeSdk } = current.getState(); if (client) await syncState(client); else await initializeSdk(); if (active) timer = setTimeout(poll, tickInterval); };
    void poll(); return () => { active = false; clearTimeout(timer); };
  }, []);
  return <NetworkContext.Provider value={store.current}>{children}</NetworkContext.Provider>;
}
export function useNearNetworkStore<T>(selector: (state: NearNetworkState) => T): T {
  const store = useContext(NetworkContext); if (!store) throw new Error("NEAR network provider is required"); return useStore(store, selector);
}
export function useInitAndPollSyncState() { /* The shared provider owns the one polling loop. */ }
