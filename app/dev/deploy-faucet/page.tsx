import Link from "next/link";
import { getNearNetwork } from "@/services/near/network";

export default function TestnetTokenPage() {
  const network = getNearNetwork();
  return <section className="space-y-4 p-6 text-text-primary"><h1 className="text-2xl font-semibold">{network.name} USDC</h1><p>Native NEAR transfers use six-decimal USDC. Transaction fees are paid in NEAR.</p><dl className="space-y-2"><div><dt>Network ID</dt><dd>{network.networkId}</dd></div><div><dt>NEAR precision</dt><dd>24 decimals</dd></div><div><dt>USDC token contract</dt><dd className="break-all">{network.usdcContractId}</dd></div><div><dt>USDC token precision</dt><dd>{network.usdcDecimals} decimals</dd></div></dl><Link href="/transfer">Open native NEAR transfers</Link></section>;
}
