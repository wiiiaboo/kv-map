import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
process.env.DB_PATH=':memory:';
const {Tracker}=await import('../src/server/tracker.js');
const {db,saveListing,getListing,history}=await import('../src/server/store.js');
const {syncState,saveSyncState,discoverPage,nextDue,checked,completeFullScan,cachedParcel,cacheParcel}=await import('../src/server/tracker-store.js');
const {parseSearch,searchURL}=await import('../src/server/discovery.js');
const {parseListing}=await import('../src/server/scraper.js');
const {SourceHTTPError}=await import('../src/server/http.js');
const page=readFileSync('research/discovery.fixture.html','utf8');
const results=parseSearch(page,0);
const listing={...parseListing(readFileSync('research/listing.fixture.html','utf8'),'https://www.kv.ee/100-elamumaaehitamiseks-on-vaja-teha-detailplaneer-3736287.html'),parcels:JSON.parse(readFileSync('research/parcel.json','utf8')),unmatchedNumbers:[]};
let time=Date.parse('2026-10-09T12:00:00Z');
const now=()=>new Date(time).toISOString();
beforeEach(()=>{db.exec('DELETE FROM listings;DELETE FROM observations;DELETE FROM discovered;DELETE FROM tracker_state;DELETE FROM parcel_cache;');time=Date.parse('2026-10-09T12:00:00Z');});
test('discovers only land cards, handles extensionless URLs and follows offset pagination',()=>{assert.equal(results.listings.length,3);assert.match(results.listings[0].url,/-\d+$/);assert.equal(results.nextOffset,50);assert.equal(searchURL(50),'https://www.kv.ee/maa-muuk?orderby=cdwl&start=50');assert.throws(()=>parseSearch('<h1>Just a moment</h1>',0));});
test('unchanged summaries keep their scheduled detail refresh; price changes make details due',()=>{
 const scan={id:now(),kind:'full' as const,offset:0,pages:0,startedAt:now()};const entry={...results.listings[0],id:listing.id,url:listing.url};
 discoverPage([entry],scan,now());saveListing({...listing});checked(entry.id,now());const due=db.prepare('SELECT due_at FROM discovered WHERE id=?').get(entry.id)!.due_at;
 time+=3600000;discoverPage([entry],scan,now());assert.equal(db.prepare('SELECT due_at FROM discovered WHERE id=?').get(entry.id)!.due_at,due);assert.equal(nextDue(now()),undefined);
 discoverPage([{...entry,fingerprint:'new-price'}],scan,now());assert.equal(nextDue(now())?.id,entry.id);
});
test('collector resumes its pagination checkpoint and interleaves one detail import',async()=>{
 const calls:string[]=[];const imports:string[]=[];
 const deps={now:()=>time,fetchText:async(url:string)=>{calls.push(url);return page;},importListing:async(url:string)=>{imports.push(url);return {...listing};}};
 await new Tracker(deps).tick();assert.equal(syncState().scan?.offset,50);assert.equal(imports.length,0);
 time+=5000;await new Tracker(deps).tick();assert.equal(imports.length,1);assert.equal(calls.length,1);assert.equal(syncState().scan?.offset,50);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM discovered WHERE checked_at IS NOT NULL').get()!.n,1);
});
test('failed search does not finish a scan or mark anything removed and backs off',async()=>{
 saveListing({...listing});const tracker=new Tracker({now:()=>time,fetchText:async()=>{throw new SourceHTTPError(403);},importListing:async()=>listing});await tracker.tick();
 assert.equal(syncState().lastFullAt,null);assert.equal(syncState().scan?.offset,0);assert.equal(getListing(listing.id)!.active,true);assert.ok(Date.parse(syncState().retryAt!)>time);
 await tracker.tick();assert.equal(syncState().consecutiveErrors,1);
});
test('missing results only schedule verification after two completed scans',()=>{
 const entry={id:listing.id,url:listing.url,fingerprint:'first'};const scan={id:'first',kind:'full' as const,offset:0,pages:0,startedAt:now()};
 discoverPage([entry],scan,now());saveListing({...listing});checked(entry.id,now());completeFullScan('second',now());assert.equal(nextDue(now()),undefined);completeFullScan('third',now());assert.equal(nextDue(now())?.id,listing.id);assert.equal(getListing(listing.id)!.active,true);
});
test('confirmed detail 404 archives without changing firstSeen or lastSeen; history is retained',async()=>{
 const entry={id:listing.id,url:listing.url,fingerprint:'x'},scan={id:'scan',kind:'full' as const,offset:0,pages:0,startedAt:now()};discoverPage([entry],scan,now());saveListing({...listing});saveSyncState({...syncState(),lastFullAt:now(),lastRecentAt:now()});
 await new Tracker({now:()=>time,fetchText:async()=>page,importListing:async()=>{throw new SourceHTTPError(404);}}).tick();const archived=getListing(listing.id)!;assert.equal(archived.active,false);assert.equal(archived.firstSeen,listing.firstSeen);assert.equal(archived.lastSeen,listing.lastSeen);assert.equal(archived.removedAt,now());assert.equal(history(listing.id).length,2);
});
test('403 detail failure preserves active data and sets a per-listing retry',async()=>{
 discoverPage([{id:listing.id,url:listing.url,fingerprint:'x'}],{id:'scan',kind:'full',offset:0,pages:0,startedAt:now()},now());saveListing({...listing});saveSyncState({...syncState(),lastFullAt:now(),lastRecentAt:now()});
 await new Tracker({now:()=>time,fetchText:async()=>page,importListing:async()=>{throw new SourceHTTPError(403);}}).tick();assert.equal(getListing(listing.id)!.active,true);assert.equal(history(listing.id).length,1);assert.equal(nextDue(now()),undefined);
});
test('price history preserves firstSeen and cached parcel geometry expires',()=>{
 saveListing({...listing});saveListing({...listing,firstSeen:now(),price:70000,lastSeen:now()});assert.equal(getListing(listing.id)!.firstSeen,listing.firstSeen);assert.equal(history(listing.id)[0].listing.price,70000);assert.equal(history(listing.id)[1].listing.price,75000);
 cacheParcel('24505:001:0923',listing.parcels);assert.ok(cachedParcel('24505:001:0923'));assert.equal(cachedParcel('24505:001:0923',Date.now()+31*86400000),undefined);
});
