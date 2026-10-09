import {db,allListings,getListing,saveListing} from './store.js';
import type {SearchListing} from './discovery.js';
export interface Scan {id:string;kind:'full'|'recent';offset:number;pages:number;startedAt:string;}
export interface SyncState {scan:Scan|null;lastFullAt:string|null;lastRecentAt:string|null;lastStepAt:string|null;lastError:string|null;retryAt:string|null;consecutiveErrors:number;turn:number;}
const initial:SyncState={scan:null,lastFullAt:null,lastRecentAt:null,lastStepAt:null,lastError:null,retryAt:null,consecutiveErrors:0,turn:0};
db.exec(`CREATE TABLE IF NOT EXISTS tracker_state(key TEXT PRIMARY KEY,document TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS discovered(id TEXT PRIMARY KEY,url TEXT NOT NULL,fingerprint TEXT NOT NULL,seen_at TEXT NOT NULL,full_scan TEXT,due_at TEXT NOT NULL,checked_at TEXT,failures INTEGER NOT NULL DEFAULT 0,last_error TEXT,missing_scans INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS discovery_due ON discovered(due_at);
CREATE TABLE IF NOT EXISTS parcel_cache(number TEXT PRIMARY KEY,document TEXT NOT NULL,checked_at TEXT NOT NULL);`);
export function syncState():SyncState{const row=db.prepare("SELECT document FROM tracker_state WHERE key='sync'").get();return row?{...initial,...JSON.parse(String(row.document))}:{...initial};}
export function saveSyncState(state:SyncState){db.prepare("INSERT INTO tracker_state VALUES('sync',?) ON CONFLICT(key) DO UPDATE SET document=excluded.document").run(JSON.stringify(state));}
export function discoverPage(entries:SearchListing[],scan:Scan,now:string){
 db.exec('BEGIN');try{for(const entry of entries){
 const prior=db.prepare('SELECT * FROM discovered WHERE id=?').get(entry.id);
 if(!prior){db.prepare('INSERT INTO discovered(id,url,fingerprint,seen_at,full_scan,due_at) VALUES(?,?,?,?,?,?)').run(entry.id,entry.url,entry.fingerprint,now,scan.kind==='full'?scan.id:null,now);}
 else{const changed=prior.fingerprint!==entry.fingerprint||!getListing(entry.id)?.active;
 db.prepare('UPDATE discovered SET url=?,fingerprint=?,seen_at=?,full_scan=COALESCE(?,full_scan),missing_scans=0,due_at=CASE WHEN ? THEN ? ELSE due_at END WHERE id=?').run(entry.url,entry.fingerprint,now,scan.kind==='full'?scan.id:null,changed?1:0,changed&&Number(prior.failures)===0?now:String(prior.due_at),entry.id);
 }}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
}
export function completeFullScan(scanId:string,now:string){
 // An absent search result is only a candidate for a detail check, never proof of removal.
 db.prepare('UPDATE discovered SET missing_scans=missing_scans+1,due_at=CASE WHEN missing_scans>=1 AND due_at>? THEN ? ELSE due_at END WHERE full_scan IS NULL OR full_scan<>?').run(now,now,scanId);
}
export function nextDue(now:string){return db.prepare('SELECT id,url FROM discovered WHERE due_at<=? ORDER BY checked_at IS NOT NULL, due_at,id LIMIT 1').get(now) as {id:string;url:string}|undefined;}
export function checked(id:string,now:string){const due=new Date(Date.parse(now)+7*86400000).toISOString();db.prepare('UPDATE discovered SET checked_at=?,due_at=?,failures=0,last_error=NULL WHERE id=?').run(now,due,id);}
export function failed(id:string,error:string,now:string){const prior=db.prepare('SELECT failures FROM discovered WHERE id=?').get(id);const failures=Number(prior?.failures??0)+1;const due=new Date(Date.parse(now)+Math.min(86400000,3600000*2**Math.min(failures-1,5))).toISOString();db.prepare('UPDATE discovered SET failures=?,last_error=?,due_at=? WHERE id=?').run(failures,error.slice(0,500),due,id);}
export function markRemoved(id:string,now:string){const l=getListing(id);if(l?.active)saveListing({...l,active:false,lastChecked:now,removedAt:now});}
export function summary(){const counts=db.prepare('SELECT COUNT(*) AS discovered,SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END) AS errors FROM discovered').get()!;const listings=allListings();return {discovered:Number(counts.discovered),errors:Number(counts.errors??0),imported:listings.length,active:listings.filter(l=>l.active).length,mapped:listings.filter(l=>l.active&&l.parcels.features.length>0).length,withoutGeometry:listings.filter(l=>l.active&&!l.parcels.features.length).length,pending:Number(db.prepare('SELECT COUNT(*) AS n FROM discovered WHERE checked_at IS NULL').get()!.n)};}
export function cachedParcel(number:string,now=Date.now()){const r=db.prepare('SELECT document,checked_at FROM parcel_cache WHERE number=?').get(number);return r&&now-Date.parse(String(r.checked_at))<30*86400000?JSON.parse(String(r.document)):undefined;}
export function cacheParcel(number:string,document:unknown){db.prepare('INSERT INTO parcel_cache VALUES(?,?,?) ON CONFLICT(number) DO UPDATE SET document=excluded.document,checked_at=excluded.checked_at').run(number,JSON.stringify(document),new Date().toISOString());}
