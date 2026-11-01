from pathlib import Path
root=Path(__file__).resolve().parents[1]
p=root/'presentation/components/Invoice/CreateClientInvoice.tsx'
t=p.read_text(encoding='utf-8')
t=t.replace('"use client";', '"use client";\nimport { getNearNetwork } from "@/services/near/network";\nimport { invoiceTotals } from "@/services/near/invoice-total";',1)
t=t.replace('token: { address: "", symbol: "USDC"','token: { address: getNearNetwork().usdcContractId, symbol: "USDC"')
t=t.replace('network: { name: "Arc Testnet", chainId: 1 }','network: { name: getNearNetwork().name, networkId: getNearNetwork().networkId }')
t=t.replace('{ name: network.name, chainId: 1 }','{ name: getNearNetwork().name, networkId: getNearNetwork().networkId }')
t=t.replace('|| "Arc Testnet"','|| getNearNetwork().name').replace('network: "Arc Testnet"','network: getNearNetwork().name')
start=t.index('    const { subtotal, taxAmount, total } = useMemo(')
end=t.index('    const buildCreateInvoiceDto',start)
t=t[:start]+'''    const pricing = useMemo(() => {
        try { return invoiceTotals(formData.items.map(item=>({quantity:item.qty,unitPrice:item.price})),formData.taxRate||"0",formData.discount||"0"); }
        catch { return null; }
    }, [formData.items,formData.taxRate,formData.discount]);
    const subtotal=Number(pricing?.subtotal||"0"),taxAmount=Number(pricing?.tax||"0"),total=Number(pricing?.total||"0");
'''+t[end:]
t=t.replace('        const items: InvoiceItemDto[] = formData.items.map((item, index) => ({','        const exact=invoiceTotals(formData.items.map(item=>({quantity:item.qty,unitPrice:item.price})),formData.taxRate||"0",formData.discount||"0");\n        const items: InvoiceItemDto[] = formData.items.map((item, index) => ({',1)
t=t.replace('total: item.amount || String(parseFloat(item.price) * parseInt(item.qty)),','total: exact.lines[index],')
p.write_text(t,encoding='utf-8')

for file in ['presentation/services/api/invoice.ts','presentation/services/api/payroll.ts']:
 p=root/file;t=p.read_text(encoding='utf-8')
 t='import { getNearNetwork } from "@/services/near/network";\n'+t
 t=t.replace('"native-usdc"','getNearNetwork().usdcContractId').replace('decimals: 18','decimals: 6')
 t=t.replace('{ name: "Arc Testnet", chainId: 5042002 }','{ name: getNearNetwork().name, networkId: getNearNetwork().networkId }')
 if file.endswith('invoice.ts'):
  t='import { invoiceTotals } from "@/services/near/invoice-total";\n'+t
  start=t.index('export const createB2BInvoice = async')
  pos=t.index('    const now =',start)
  t=t[:pos]+'''    if(_data.network.networkId!==getNearNetwork().networkId || _data.token.address!==getNearNetwork().usdcContractId || _data.token.decimals!==6 || _data.token.symbol!=="USDC") throw new Error("Invoice requires the configured native NEAR USDC token");
    if(!workspace.treasuryAddress || _data.walletAddress!==workspace.treasuryAddress) throw new Error("Invoices must collect into the company treasury");
    const exact=invoiceTotals(_data.items,_data.taxRate||"0",_data.discount||"0");
'''+t[pos:]
  t=t.replace('amount: _data.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0), currency: "USDC",','amount: Number(exact.total), amountExact: exact.total, taxRateExact: _data.taxRate||"0", discountExact: _data.discount||"0", lineItemsExact: _data.items.map(item=>({description:item.description,quantity:item.quantity,unitPrice:item.unitPrice})), currency: "USDC",')
  start=t.index('export const updateB2BInvoice = async')
  pos=t.index('    const invoices =',start)
  t=t[:pos]+'''    const lineItems=input.items || current.lineItemsExact || current.items.map(item=>({description:item.description,quantity:String(item.quantity),unitPrice:String(item.unitPrice)}));
    const rate=input.taxRate??current.taxRateExact??"0",discount=input.discount??current.discountExact??"0";
    const exact=invoiceTotals(lineItems,rate||"0",discount||"0");
'''+t[pos:]
  start=t.index('    const invoices =',t.index('export const updateB2BInvoice = async'))
  end=t.index('\n    await saveWorkspaceFields',start)
  t=t[:start]+'''    const invoices = workspace.data.invoices.map(invoice=>invoice.uuid===uuid ? {...invoice,...(input.dueDate?{dueDate:input.dueDate}:{}),lineItemsExact:lineItems,taxRateExact:rate,discountExact:discount,amountExact:exact.total,amount:Number(exact.total),items:lineItems.map(item=>({description:item.description,quantity:Number(item.quantity),unitPrice:Number(item.unitPrice)}))}:invoice);'''+t[end:]
 p.write_text(t,encoding='utf-8')

for file in ['CreateAndReviewPayroll','EditPayroll','PayrollDetail']:
 p=root/f'presentation/components/Payroll/{file}.tsx';t=p.read_text(encoding='utf-8')
 t=t.replace('"use client";','"use client";\nimport { getNearNetwork } from "@/services/near/network";',1)
 t=t.replace('name: "Arc Testnet", value: "5042002"','name: getNearNetwork().name, value: getNearNetwork().networkId')
 t=t.replace('"/chain/arc.svg"','"/chain/near.svg"').replace('faucetId: "native-usdc"','faucetId: getNearNetwork().usdcContractId').replace('decimals: 18','decimals: 6')
 t=t.replace('chainId: parseInt(selectedNetwork.value)','networkId: getNearNetwork().networkId')
 t=t.replace('String(employee.network.chainId)','getNearNetwork().networkId').replace('payrollData.network.chainId.toString()','getNearNetwork().networkId')
 t=t.replace('|| "Arc Testnet"','|| getNearNetwork().name').replace('>Arc Testnet<','>{getNearNetwork().name}<')
 # The native icon does not depend on the display name of the current network.
 t=t.replace('`/chain/${(payrollData.network?.name || getNearNetwork().name).toLowerCase().replace(" ", "-")}.svg`','"/chain/near.svg"')
 p.write_text(t,encoding='utf-8')
