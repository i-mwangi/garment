import { assertNearAccountId, isNearTransactionHash } from "./account-id.ts";
import { createNearReader } from "./rpc.ts";
import type { NearContractBinding } from "../../types/near-contracts.ts";

export type ContractRpc = <T>(method: string, params: unknown) => Promise<T>;
const EMPTY_CODE_HASH = "1".repeat(32);
export const MINIMUM_CONTRACT_PROTOCOL = 84;
export function assertRequestId(value: unknown): asserts value is string {
  if(typeof value!=="string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("Invalid native contract request ID");
}
export function unsigned(value: unknown, label: string, maximum=(1n<<128n)-1n): string {
  if(typeof value!=="string" || !/^(0|[1-9]\d*)$/.test(value) || BigInt(value)>maximum) throw new Error(`Invalid ${label}`);
  return value;
}
export function record(value: unknown, label: string): Record<string,unknown> {
  if(!value || typeof value!=="object" || Array.isArray(value)) throw new Error(`Invalid ${label}`);
  return value as Record<string,unknown>;
}
export function account(value: unknown): string { assertNearAccountId(value); return value; }
export function count(value: unknown,label:string,maximum:number): number {
  if(typeof value!=="number" || !Number.isSafeInteger(value) || value<0 || value>maximum) throw new Error(`Invalid ${label}`);
  return value;
}
export const U64_MAX=(1n<<64n)-1n;

/** All identity, policy and token reads refer to one final block. */
export async function contractSnapshot(binding: NearContractBinding, injectedRpc?: ContractRpc) {
  for(const id of [binding.accountId,binding.tokenId]) assertNearAccountId(id);
  if(binding.accountId===binding.tokenId || !isNearTransactionHash(binding.codeHash) || binding.codeHash===EMPTY_CODE_HASH) throw new Error("Invalid deployed contract identity");
  if(binding.networkId==="sandbox") {
    if(!injectedRpc || ["mainnet","testnet"].includes(binding.expectedRpcChainId)) throw new Error("Sandbox requires an explicit isolated RPC transport");
  } else if(!["mainnet","testnet"].includes(binding.networkId) || binding.expectedRpcChainId!==binding.networkId) throw new Error("Contract network mismatch");
  const rpc=injectedRpc ?? createNearReader().rpc;
  const status=await rpc<{chain_id:string;protocol_version:number}>("status",[]);
  if(status.chain_id!==binding.expectedRpcChainId) throw new Error("Contract RPC chain identity mismatch");
  if(!Number.isSafeInteger(status.protocol_version) || status.protocol_version<MINIMUM_CONTRACT_PROTOCOL) throw new Error("NEAR protocol cannot execute the pinned contract build");
  const block=await rpc<{header:{hash:string;height:number;timestamp_nanosec:string}}>("block",{finality:"final"});
  const header=record(block.header,"final block");
  if(!isNearTransactionHash(header.hash)) throw new Error("Invalid final block hash");
  const blockHash=header.hash;
  const blockHeight=count(header.height,"block height",Number.MAX_SAFE_INTEGER);
  const timestampNs=unsigned(header.timestamp_nanosec,"block timestamp",U64_MAX);
  const chainAccount=await rpc<{code_hash:string}>("query",{request_type:"view_account",account_id:binding.accountId,block_id:blockHash});
  if(chainAccount.code_hash!==binding.codeHash) throw new Error("Deployed native contract code does not match the approved artifact");
  async function view<T>(contractId:string,methodName:string,args:object):Promise<T> {
    assertNearAccountId(contractId);
    if(!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(methodName)) throw new Error("Invalid contract view method");
    const bytes=new TextEncoder().encode(JSON.stringify(args));
    const argsBase64=typeof Buffer!=="undefined"?Buffer.from(bytes).toString("base64"):btoa(String.fromCharCode(...bytes));
    const response=await rpc<{result:number[]}>("query",{request_type:"call_function",account_id:contractId,method_name:methodName,args_base64:argsBase64,block_id:blockHash});
    if(!Array.isArray(response.result) || response.result.length>65536 || response.result.some(byte=>!Number.isInteger(byte)||byte<0||byte>255)) throw new Error("Invalid contract view response");
    return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(new Uint8Array(response.result))) as T;
  }
  const metadata=record(await view(binding.tokenId,"ft_metadata",{}),"USDC metadata");
  if(metadata.symbol!=="USDC" || metadata.decimals!==6) throw new Error("Native contract token must be six-decimal USDC");
  return {binding,blockHash,blockHeight,timestampNs,view,read:<T>(method:string,args:object={})=>view<T>(binding.accountId,method,args)};
}
