"use client";

import { useQuery } from "@tanstack/react-query";
import type { NearGift, GiftEscrowConfiguration } from "@/types/near-gift";

export async function giftRequest<T>(path: string, method = "GET", input?: unknown): Promise<T> {
  const response = await fetch(`/api/gifts${path}`, { method, headers: { "Content-Type": "application/json" }, body: input === undefined ? undefined : JSON.stringify(input) });
  const result: unknown = await response.json();
  if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result ? String(result.error) : "Gift request failed");
  return result as T;
}

export function useGifts() { return useQuery({ queryKey: ["gifts"], queryFn: () => giftRequest<NearGift[]>(""), retry: false }); }
export function useGiftEscrow() { return useQuery({ queryKey: ["gift-escrow"], queryFn: () => giftRequest<GiftEscrowConfiguration>("/config"), retry: false }); }
export function useNearGift(id: string) { return useQuery({ queryKey: ["gift", id], queryFn: () => giftRequest<NearGift>(`/${id}`), enabled: !!id, retry: false, refetchInterval: 30000 }); }
