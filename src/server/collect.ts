import {Tracker} from './tracker.js';
import {allListings} from './store.js';
import {mkdirSync,writeFileSync,renameSync} from 'node:fs';
const steps=Number(process.argv[2]??20);
if(!Number.isSafeInteger(steps)||steps<1||steps>10000)throw Error('Usage: npm run collect -- <steps: 1..10000>');
const tracker=new Tracker();
for(let i=0;i<steps;i++){
 await tracker.tick();const state=tracker.status();
 console.log(JSON.stringify({step:i+1,discovered:state.discovered,imported:state.imported,mapped:state.mapped,error:state.lastError}));
 if(state.lastError){process.exitCode=1;break;}
 if(i<steps-1)await new Promise(r=>setTimeout(r,5000));
}
mkdirSync('data',{recursive:true});
writeFileSync('data/bootstrap.json.tmp',JSON.stringify({capturedAt:new Date().toISOString(),listings:allListings()},null,2));
renameSync('data/bootstrap.json.tmp','data/bootstrap.json');
