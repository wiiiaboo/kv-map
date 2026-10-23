import {describe,test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.DB_PATH=':memory:';
const {normalizeLeiakv,parseLeiakvPage,leiakvSearchURL,LeiakvCollector,LEIAKV_API}=await import('../src/server/leiakv');
const {db,allListings,getListing,saveListing,history}=await import('../src/server/store');
const {SourceHTTPError}=await import('../src/server/http');
const rawPage=JSON.parse(readFileSync('research/leiakv.fixture.json','utf8'));
const raw=rawPage.items[0];
const geometry={parcels:JSON.parse(readFileSync('research/parcel.json','utf8')),unmatchedNumbers:[]};
let time=Date.parse('2026-10-23T10:00:00Z');
const now=()=>new Date(time).toISOString();
describe('Leiakv public API connector',()=>{
 beforeEach(()=>{db.exec('DELETE FROM listings;DELETE FROM observations;DELETE FROM discovered;DELETE FROM tracker_state;DELETE FROM parcel_cache;');time=Date.parse('2026-10-23T10:00:00Z');});
 test('normalizes a real API result with a namespaced ID, canonical area and VAT status',()=>{const l=normalizeLeiakv(raw,now());assert.equal(l.id,'leiakv:'+raw.id);assert.equal(l.source,'leiakv');assert.equal(l.price,138000);assert.equal(l.area,2681);assert.deepEqual(l.cadastralNumbers,['94901:001:0690']);assert.equal(l.firstSeen,now());assert.equal(l.vatStatus,'vatWillBeAdded');assert.equal(l.postedAt,new Date(raw.publishedAt).toISOString());});
 test('effective discount price wins and descriptions add deduplicated parcel numbers',()=>{const l=normalizeLeiakv({...raw,discountPrice:125000,description:{et:'94901:001:0690 24505:001:0923',en:'24505:001:0923'}});assert.equal(l.price,125000);assert.deepEqual(l.cadastralNumbers,['94901:001:0690','24505:001:0923']);assert.equal(normalizeLeiakv({...raw,discountPrice:0}).price,0);});
 test('respects redacted locations and does not infer hidden parcel numbers',()=>{const l=normalizeLeiakv({...raw,location:{...raw.location,redacted:true},description:{et:'24505:001:0923'}});assert.deepEqual(l.cadastralNumbers,[]);assert.deepEqual(l.descriptionNumbers,[]);});
 test('rejects non-land listings, inactive inventory, invalid IDs and off-site links',()=>{for(const patch of [{propertyType:'apartment'},{dealType:'rent'},{status:'sold'},{id:'../escape'},{url:'https://evil.test/listing'}])assert.throws(()=>normalizeLeiakv({...raw,...patch}));});
 test('rejects malformed/error pages instead of interpreting them as an empty inventory',()=>{for(const input of [{items:[]},{items:[],nextCursor:null,totalCount:0,error:'internal_error'},{items:[],nextCursor:33,totalCount:2}])assert.throws(()=>parseLeiakvPage(input));assert.equal(parseLeiakvPage({items:[],nextCursor:null,totalCount:0}).items.length,0);assert.equal(new URL(leiakvSearchURL('opaque+/=')).searchParams.get('cursor'),'opaque+/=');});
 test('imports cursor pages and reuses geometry for unchanged results on the next run',async()=>{
  let geometryCalls=0;const calls:string[]=[];
  const collector=new LeiakvCollector({now:()=>time,json:async url=>{calls.push(url);return new URL(url).searchParams.has('cursor')?{items:[rawPage.items[1]],nextCursor:null,totalCount:2}:{items:[raw],nextCursor:'opaque+/=',totalCount:2};},geometry:async()=>{geometryCalls++;return structuredClone(geometry);}});
  const first=await collector.run(true);assert.equal(first.imported,2);assert.equal(first.lastError,null);assert.equal(geometryCalls,2);assert.equal(new URL(calls[1]).searchParams.get('cursor'),'opaque+/=');
  const firstSeen=getListing('leiakv:'+raw.id)!.firstSeen;time+=3600000;await collector.run(true);assert.equal(geometryCalls,2);assert.equal(getListing('leiakv:'+raw.id)!.firstSeen,firstSeen);assert.equal(history('leiakv:'+raw.id).length,2);
 });
 test('a partial failed scan preserves absent listings',async()=>{
  saveListing({...normalizeLeiakv({...raw,id:'existing'},now()),...geometry});
  const collector=new LeiakvCollector({now:()=>time,json:async url=>{if(new URL(url).searchParams.has('cursor'))throw new SourceHTTPError(403,url);return {items:[raw],nextCursor:'next',totalCount:44};},geometry:async()=>structuredClone(geometry)});
  const s=await collector.run(true);assert.match(s.lastError!,/403/);assert.equal(s.lastSuccessAt,null);assert.equal(getListing('leiakv:existing')!.active,true);
 });
 test('a cadastral failure retains the listing and never treats it as removed',async()=>{
  const collector=new LeiakvCollector({now:()=>time,json:async()=>({items:[raw],nextCursor:null,totalCount:1}),geometry:async()=>{throw new SourceHTTPError(404,'https://gsavalik.envir.ee/geoserver/kataster/wfs');}});
  const s=await collector.run(true);assert.equal(s.geometryErrors,1);const l=getListing('leiakv:'+raw.id)!;assert.equal(l.active,true);assert.equal(l.parcels.features.length,0);assert.match(l.geometryError!,/404/);
 });
 test('confirmed detail not-found archives an absent listing while preserving lastSeen',async()=>{
  const saved=saveListing({...normalizeLeiakv(raw,now()),...geometry});time+=3600000;
  const collector=new LeiakvCollector({now:()=>time,json:async url=>{if(url.startsWith(LEIAKV_API+'?'))return {items:[],nextCursor:null,totalCount:0};throw new SourceHTTPError(404,url);},geometry:async()=>structuredClone(geometry)});await collector.run(true);const l=getListing(saved.id)!;assert.equal(l.active,false);assert.equal(l.lastSeen,saved.lastSeen);assert.equal(l.firstSeen,saved.firstSeen);assert.equal(history(saved.id).length,2);
 });
 test('rate limiting honors Retry-After and a repeated cursor cannot finish a scan',async()=>{
  const limited=new LeiakvCollector({now:()=>time,json:async url=>{throw new SourceHTTPError(429,url,900000);},geometry:async()=>structuredClone(geometry)});const result=await limited.run(true);assert.equal(Date.parse(result.nextRunAt!)-time,900000);
  db.exec('DELETE FROM tracker_state;');const repeated=new LeiakvCollector({now:()=>time,json:async()=>({items:[raw],nextCursor:'repeat',totalCount:44}),geometry:async()=>structuredClone(geometry)});const bad=await repeated.run(true);assert.match(bad.lastError!,/pagination/);assert.equal(bad.lastSuccessAt,null);
 });
});
