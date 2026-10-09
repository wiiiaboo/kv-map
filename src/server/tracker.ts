import {snapshotInfo} from './bootstrap.js';
import {getText,SourceHTTPError} from './http.js';
import {importListing} from './importer.js';
import {parseSearch,searchURL} from './discovery.js';
import {syncState,saveSyncState,discoverPage,completeFullScan,nextDue,checked,failed,markRemoved,summary} from './tracker-store.js';
interface Dependencies {fetchText:typeof getText;importListing:typeof importListing;now:()=>number;}
export class Tracker {
 private busy=false;
 constructor(private deps:Dependencies={fetchText:getText,importListing,now:Date.now}){}
 status(){return {...syncState(),...summary(),running:this.busy,enabled:process.env.AUTO_SYNC!=='false',storage:process.env.STORAGE_MODE??(process.env.RENDER==='true'?'ephemeral':'local'),intervalSeconds:5,snapshot:snapshotInfo()};}
 async tick(){
  if(this.busy)return;
  let state=syncState();const now=new Date(this.deps.now()).toISOString();
  if(state.retryAt&&Date.parse(state.retryAt)>this.deps.now())return;
  this.busy=true;
  try{
   if(!state.scan){
    const full=!state.lastFullAt||this.deps.now()-Date.parse(state.lastFullAt)>=86400000;
    const recent=!state.lastRecentAt||this.deps.now()-Date.parse(state.lastRecentAt)>=3600000;
    if(full||recent)state.scan={id:now,kind:full?'full':'recent',offset:0,pages:0,startedAt:now};
   }
   // Interleave search pages with details so verified polygons appear immediately.
   const due=nextDue(now);
   if(state.scan&&(!due||state.turn%6===0)){
    const scan=state.scan;const page=parseSearch(await this.deps.fetchText(searchURL(scan.offset)),scan.offset);
    if(page.nextOffset!==null&&page.nextOffset<=scan.offset)throw Error('Search pagination did not advance');
    if(scan.pages>=200)throw Error('Search exceeded 200 pages; manual review required');
    discoverPage(page.listings,scan,now);scan.pages++;
    if(page.nextOffset===null||(scan.kind==='recent'&&scan.pages>=2)){
     if(scan.kind==='full'){completeFullScan(scan.id,now);state.lastFullAt=now;}
     state.lastRecentAt=now;state.scan=null;
    }else scan.offset=page.nextOffset;
   }else if(due){
    try{await this.deps.importListing(due.url,true);checked(due.id,now);}
    catch(e){
     if(e instanceof SourceHTTPError&&e.sourceURL===due.url&&[404,410].includes(e.status)){markRemoved(due.id,now);checked(due.id,now);}
     else{failed(due.id,(e as Error).message,now);throw e;}
    }
   }
   state.turn++;state.lastStepAt=now;state.lastError=null;state.retryAt=null;state.consecutiveErrors=0;
  }catch(e){state.consecutiveErrors++;state.lastError=(e as Error).message;const delay=Math.min(3600000,60000*2**Math.min(state.consecutiveErrors-1,6));state.retryAt=new Date(this.deps.now()+delay).toISOString();console.error('Tracker paused:',state.lastError);}
  finally{saveSyncState(state);this.busy=false;}
 }
 start(){if(process.env.AUTO_SYNC==='false')return;const timer=setInterval(()=>void this.tick(),5000);timer.unref();void this.tick();return timer;}
}
export const tracker=new Tracker();
