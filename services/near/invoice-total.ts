import { formatAmount, parseAmount } from "./amount.ts";
export interface InvoiceLine { quantity: string; unitPrice: string }
export function invoiceTotals(items: readonly InvoiceLine[], taxRate = "0", discount = "0") {
  if (!items.length || items.length > 100) throw new Error("An invoice needs between 1 and 100 line items");
  const lines=items.map(item=>{
    if (!/^[1-9]\d{0,5}$/.test(item.quantity)) throw new Error("Line quantities must be whole numbers between 1 and 999999");
    return parseAmount(item.unitPrice)*BigInt(item.quantity);
  });
  const subtotal=lines.reduce((sum,value)=>sum+value,0n);
  const rate=parseAmount(taxRate,4);
  if(rate>1000000n) throw new Error("Tax rate cannot exceed 100 percent");
  const numerator=subtotal*rate;
  if(numerator%1000000n!==0n) throw new Error("Tax produces a fraction smaller than one USDC micro-unit; adjust the invoice terms");
  const tax=numerator/1000000n;
  const reduction=parseAmount(discount);
  if(reduction>subtotal+tax) throw new Error("Discount exceeds the invoice total");
  const total=subtotal+tax-reduction;
  return {subtotal:formatAmount(subtotal),tax:formatAmount(tax),total:formatAmount(total),lines:lines.map(value=>formatAmount(value))};
}
