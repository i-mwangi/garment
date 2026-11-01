import { account, record, unsigned } from "./contract-snapshot.ts";

export function verifyExecutorPermission(value:unknown,vaultId:string,method:string) {
  account(vaultId);
  if(!["queue_payment","execute_payment"].includes(method))throw new Error("Native executor cannot administer or approve payments");
  const key=record(value,"executor access key"),permission=record(key.permission,"executor permission");
  const access=record(permission.FunctionCall,"restricted function-call permission");
  const allowance=unsigned(access.allowance,"executor gas allowance");
  if(BigInt(allowance)===0n || access.receiver_id!==vaultId || !Array.isArray(access.method_names) || access.method_names.length===0 || !access.method_names.includes(method) || access.method_names.some(name=>!["queue_payment","execute_payment"].includes(String(name))))throw new Error("Executor key must have finite gas allowance and only native vault queue/execute access");
}
