// Isolated HTTP-test fixture: never load this module in the application startup.
const originalFetch=globalThis.fetch;
const token='3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af';
globalThis.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 if(url.hostname==='127.0.0.1'||url.hostname==='localhost')return originalFetch(input,options);
 if(url.hostname!=='rpc.testnet.near.org')throw new Error('Isolated native fixture rejected an external destination');
 const request=JSON.parse(options.body);
 let result;
 if(request.method==='query' && request.params.request_type==='view_account' && /^[a-f0-9]{64}$/.test(request.params.account_id))return Response.json({jsonrpc:'2.0',id:request.id,error:{code:-32000,data:`account ${request.params.account_id} does not exist while viewing`}});
 if(request.method==='status')result={chain_id:'testnet',protocol_version:84};
 else if(request.method==='query'&&request.params.request_type==='call_function'&&request.params.account_id===token){
  let value;
  if(request.params.method_name==='ft_metadata')value={symbol:'USDC',decimals:6};
  else if(request.params.method_name==='ft_balance_of')value='0';
  else throw new Error('Unexpected native fixture view');
  result={result:[...Buffer.from(JSON.stringify(value))],block_height:100,block_hash:'A'.repeat(44)};
 }else throw new Error('Isolated native fixture permits only network, metadata and zero-balance reads');
 return Response.json({jsonrpc:'2.0',id:request.id,result});
};
