import {createHash} from 'node:crypto';
import * as cheerio from 'cheerio';
import {getText,SourceHTTPError} from './http.js';
import {resolveParcels} from './cadastre.js';
import {db,allListings,getListing,saveListing} from './store.js';
import {cadastralNumbers} from './scraper.js';
import type {Listing} from './types.js';
export const LEIAKV_API='https://leiakv.ee/api/public/v1/listings';
const KEY='leiakv-sync';
export interface LeiakvState {lastAttemptAt:string|null;lastSuccessAt:string|null;nextRunAt:string|null;lastError:string|null;total:number;processed:number;geometryErrors:number;failures:number;}
const empty:LeiakvState={lastAttemptAt:null,lastSuccessAt:null,nextRunAt:null,lastError:null,total:0,processed:0,geometryErrors:0,failures:0};
function state():LeiakvState{const row=db.prepare('SELECT document FROM tracker_state WHERE key=?').get(KEY);return row?{...empty,...JSON.parse(String(row.document))}:{...empty};}
function storeState(s:LeiakvState){db.prepare('INSERT INTO tracker_state VALUES(?,?) ON CONFLICT(key) DO UPDATE SET document=excluded.document').run(KEY,JSON.stringify(s));}
export function leiakvSearchURL(cursor:string|null=null){const u=new URL(LEIAKV_API);u.search=new URLSearchParams({dealType:'sale',propertyType:'land',sort:'newest',limit:'50',...(cursor?{cursor}:{})}).toString();return u.href;}
export function parseLeiakvPage(data:any):{items:any[];nextCursor:string|null;totalCount:number}{
 if(!data||data.error||!Array.isArray(data.items)||data.items.length>50||!Number.isInteger(data.totalCount)||data.totalCount<0||(data.nextCursor!==null&&(typeof data.nextCursor!=='string'||!data.nextCursor.length||data.nextCursor.length>8192)))throw Error('Unexpected Leiakv search response; existing listings were preserved.');
 return data;
}
const amount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
function plain(v:unknown):string{const text=typeof v==='string'?v:'';return cheerio.load(text.replace(/<br\s*\/?\s*>/gi,'\n').replace(/<\/p>/gi,'\n')).text().trim();}
function localized(v:any){return plain(typeof v==='string'?v:v?.et||v?.en||v?.fi||v?.ru);}
function date(v:unknown){return typeof v==='string'&&Number.isFinite(Date.parse(v))?new Date(v).toISOString():null;}
export function normalizeLeiakv(raw:any,now=new Date().toISOString()):Omit<Listing,'parcels'|'unmatchedNumbers'>{
 if(!raw||typeof raw.id!=='string'||!/^[a-zA-Z0-9_-]{1,200}$/.test(raw.id)||raw.dealType!=='sale'||raw.propertyType!=='land'||(raw.status&&!['active','reserved'].includes(raw.status)))throw Error('Leiakv returned a listing outside active land-for-sale inventory.');
 const url=new URL(raw.url);if(url.origin!=='https://leiakv.ee'||url.username||url.password||!url.pathname.startsWith('/et/kuulutused/'))throw Error('Unexpected Leiakv listing URL.');
 const redacted=raw.location?.redacted===true;
 const description=localized(raw.description);
 const allDescriptions=typeof raw.description==='object'&&raw.description?Object.values(raw.description).map(plain).join('\n'):description;
 const structured=redacted?[]:[...new Set((Array.isArray(raw.cadastralNumbers)?raw.cadastralNumbers:[]).flatMap((n:unknown)=>typeof n==='string'?cadastralNumbers(n):[]))] as string[];
 const extras=redacted?[]:cadastralNumbers(allDescriptions);
 const numbers=[...new Set([...structured,...extras])];
 const area=amount(raw.size)??amount(raw.plotArea),price=amount(raw.discountPrice)??amount(raw.price);
 const title=plain(raw.location?.formattedAddress)||localized(raw.slogan)||raw.id;
 const result={id:`leiakv:${raw.id}`,source:'leiakv' as const,sourceId:raw.id,sourceStatus:raw.status??'active',sourceUpdatedAt:date(raw.contentUpdatedAt)??date(raw.updatedAt),vatStatus:typeof raw.vatStatus==='string'?raw.vatStatus:undefined,title,price,area,pricePerM2:null,url:url.href,description,cadastralNumbers:numbers,structuredNumbers:structured,descriptionNumbers:extras,firstSeen:now,lastSeen:now,lastChecked:now,active:true,removedAt:null,postedAt:date(raw.publishedAt)??date(raw.createdAt)};
 return {...result,sourceFingerprint:createHash('sha256').update(JSON.stringify({...result,firstSeen:undefined,lastSeen:undefined,lastChecked:undefined})).digest('hex')};
}
interface Dependencies {json:(url:string)=>Promise<any>;geometry:typeof resolveParcels;now:()=>number;}
const defaults:Dependencies={json:async url=>JSON.parse(await getText(url,{accept:'application/json'})),geometry:resolveParcels,now:Date.now};
export class LeiakvCollector {
 private busy=false;
 constructor(private deps:Dependencies=defaults){}
 status(){const rows=allListings().filter(l=>l.source==='leiakv');return {...state(),enabled:process.env.LEIAKV_SYNC!=='false',running:this.busy,imported:rows.length,active:rows.filter(l=>l.active).length,mapped:rows.filter(l=>l.active&&l.parcels.features.length).length};}
 async run(force=false){
  if(this.busy)return this.status();const s=state();if(!force&&s.nextRunAt&&Date.parse(s.nextRunAt)>this.deps.now())return this.status();
  this.busy=true;const observedAt=new Date(this.deps.now()).toISOString();s.lastAttemptAt=observedAt;s.geometryErrors=0;s.processed=0;storeState(s);
  try{
   let cursor:string|null=null;const cursors=new Set<string>();const seen=new Set<string>();let complete=false;
   for(let pageIndex=0;pageIndex<100;pageIndex++){
    const page=parseLeiakvPage(await this.deps.json(leiakvSearchURL(cursor)));s.total=page.totalCount;
    for(const raw of page.items){
     const normalized=normalizeLeiakv(raw,observedAt);if(seen.has(normalized.id))continue;seen.add(normalized.id);const prior=getListing(normalized.id);
     const fresh=prior?.geometryCheckedAt&&this.deps.now()-Date.parse(prior.geometryCheckedAt)<30*86400000;
     if(prior?.sourceFingerprint===normalized.sourceFingerprint&&fresh&&!prior.geometryError){saveListing({...prior,...normalized});}
     else{
      try{const geometry=await this.deps.geometry(normalized.cadastralNumbers);saveListing({...normalized,...geometry,geometryCheckedAt:observedAt,geometryError:undefined});}
      catch(e){s.geometryErrors++;const validOld=prior?.parcels.features.filter(f=>normalized.cadastralNumbers.includes(String(f.properties?.tunnus)))??[];saveListing({...normalized,parcels:{type:'FeatureCollection',features:validOld},unmatchedNumbers:normalized.cadastralNumbers.filter(n=>!validOld.some(f=>f.properties?.tunnus===n)),geometryError:(e as Error).message,geometryCheckedAt:prior?.geometryCheckedAt});}
     }
     s.processed++;storeState(s);
    }
    if(page.nextCursor===null){complete=true;break;}
    if(!page.items.length||cursors.has(page.nextCursor))throw Error('Leiakv pagination did not advance; no listings were archived.');
    cursors.add(page.nextCursor);cursor=page.nextCursor;
   }
   if(!complete)throw Error('Leiakv exceeded 100 pages; no listings were archived.');
   // Only a confirmed not-public detail response can archive an absent listing.
   for(const previous of allListings().filter(l=>l.source==='leiakv'&&l.active&&!seen.has(l.id)).slice(0,10)){
    const endpoint=`${LEIAKV_API}/${encodeURIComponent(previous.sourceId!)}`;
    try{const data=await this.deps.json(endpoint);if(!data?.listing||data.listing.id!==previous.sourceId)throw Error('Unexpected Leiakv detail response.');}
    catch(e){if(e instanceof SourceHTTPError&&e.sourceURL===endpoint&&e.status===404)saveListing({...previous,active:false,lastChecked:observedAt,removedAt:observedAt});else throw e;}
   }
   s.lastSuccessAt=observedAt;s.failures=0;s.lastError=s.geometryErrors?`${s.geometryErrors} listings could not refresh official parcel geometry; they will be retried.`:null;s.nextRunAt=new Date(this.deps.now()+3600000).toISOString();
  }catch(e){s.failures++;s.lastError=(e as Error).message;const delay=Math.max(e instanceof SourceHTTPError?e.retryAfterMs??0:0,Math.min(3600000,60000*2**Math.min(s.failures-1,6)));s.nextRunAt=new Date(this.deps.now()+delay).toISOString();console.error('Leiakv collection paused:',s.lastError);}
  finally{storeState(s);this.busy=false;}
  return this.status();
 }
 start(){if(process.env.LEIAKV_SYNC==='false')return;void this.run();const timer=setInterval(()=>void this.run(),60000);timer.unref();return timer;}
}
export const leiakv=new LeiakvCollector();

export async function refreshLeiakvURL(input:string){
 const u=new URL(input);if(u.origin!=='https://leiakv.ee'||u.username||u.password)throw Error('Invalid Leiakv URL.');
 const prior=allListings().find(l=>l.source==='leiakv'&&l.url===u.href);
 if(!prior?.sourceId)throw Error('This Leiakv listing must first be discovered through its public API.');
 const data=await defaults.json(`${LEIAKV_API}/${encodeURIComponent(prior.sourceId)}`);
 if(data?.listing?.id!==prior.sourceId)throw Error('Unexpected Leiakv detail response.');
 const normalized=normalizeLeiakv(data.listing);return saveListing({...normalized,...await resolveParcels(normalized.cadastralNumbers),geometryCheckedAt:normalized.lastSeen});
}
