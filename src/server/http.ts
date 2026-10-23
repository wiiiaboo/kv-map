import { fetch, EnvHttpProxyAgent } from 'undici';
const dispatcher=(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)?new EnvHttpProxyAgent():undefined;
export class SourceHTTPError extends Error {constructor(public status:number,public sourceURL:string='',public retryAfterMs?:number){super(`${sourceURL.includes("leiakv.ee")?"Leiakv":sourceURL.includes("www.kv.ee")?"KV.ee":sourceURL.includes("gsavalik.envir.ee")?"Official cadastre":"Source"} returned HTTP ${status}.`);}}
const nextRequest=new Map<string,number>();
export async function getText(url:string,options:{accept?:string}={}) {
 const host=new URL(url).hostname;const interval=host==='www.kv.ee'?5000:host==='leiakv.ee'?2100:0;
 if(interval){const start=Math.max(Date.now(),nextRequest.get(host)??0);nextRequest.set(host,start+interval);const delay=start-Date.now();if(delay>0)await new Promise(r=>setTimeout(r,delay));}
 const r=await fetch(url,{dispatcher,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'KVParcelMap/0.2 (land-listing tracker)','Accept':options.accept??'text/html'}});
 if(r.status>=300&&r.status<400)throw new Error('Source redirected; use the current full listing URL.');
 if(!r.ok){const retry=r.headers.get('retry-after');const seconds=retry===null?NaN:Number(retry);const delay=retry===null?undefined:Number.isFinite(seconds)?Math.max(0,seconds*1000):Math.max(0,Date.parse(retry)-Date.now());throw new SourceHTTPError(r.status,url,delay!==undefined&&Number.isFinite(delay)?delay:undefined);}
 const text=await r.text(); if(text.length>5_000_000)throw new Error('Source response too large.');return text;
}
