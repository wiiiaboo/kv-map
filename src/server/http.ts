import { fetch, EnvHttpProxyAgent } from 'undici';
const dispatcher=(process.env.HTTPS_PROXY||process.env.HTTP_PROXY)?new EnvHttpProxyAgent():undefined;
export async function getText(url:string) {
 const r=await fetch(url,{dispatcher,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'KVParcelMap/0.1 (single-listing research importer)','Accept':'text/html'}});
 if(r.status>=300&&r.status<400)throw new Error('Source redirected; use the current full listing URL.');
 if(!r.ok)throw new Error(`Source returned HTTP ${r.status}.`);
 const text=await r.text(); if(text.length>5_000_000)throw new Error('Source response too large.');return text;
}
