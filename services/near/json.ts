export function canonicalJson(value:unknown,depth=0):string {
 if(depth>20)throw new Error("JSON action exceeds supported nesting");
 if(value===null || typeof value==="string" || typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number" && Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value)){if(value.length>1000)throw new Error("JSON action array is too large");return `[${value.map(item=>canonicalJson(item,depth+1)).join(",")}]`;}
 if(value && typeof value==="object"){const entries=Object.entries(value).sort(([a],[b])=>a.localeCompare(b));if(entries.length>1000)throw new Error("JSON action object is too large");return `{${entries.map(([key,item])=>`${JSON.stringify(key)}:${canonicalJson(item,depth+1)}`).join(",")}}`;}
 throw new Error("Invalid JSON action value");
}
export function sameJson(a:unknown,b:unknown){return canonicalJson(a)===canonicalJson(b);}
