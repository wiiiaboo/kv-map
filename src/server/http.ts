import { fetch, EnvHttpProxyAgent } from 'undici';
const dispatcher=(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)?new EnvHttpProxyAgent():undefined;
export class SourceHTTPError extends Error {constructor(public status:number){super(`Source returned HTTP ${status}.`);}}
let nextKVRequest=0;
export async function getText(url:string) {
 if(new URL(url).hostname==='www.kv.ee'){const start=Math.max(Date.now(),nextKVRequest);nextKVRequest=start+5000;const delay=start-Date.now();if(delay>0)await new Promise(r=>setTimeout(r,delay));}
 const r=await fetch(url,{dispatcher,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'KVParcelMap/0.2 (land-listing tracker)','Accept':'text/html'}});
 if(r.status>=300&&r.status<400)throw new Error('Source redirected; use the current full listing URL.');
 if(!r.ok)throw new SourceHTTPError(r.status);
 const text=await r.text(); if(text.length>5_000_000)throw new Error('Source response too large.');return text;
}
