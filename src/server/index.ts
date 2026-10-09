import express from 'express';
import {allListings,history} from './store.js';
import {importListing} from './importer.js';
const app=express();app.disable('x-powered-by');app.use(express.json({limit:'8kb'}));
app.get('/healthz',(_,res)=>res.json({status:'ok'}));
app.get('/api/listings',(_,res)=>res.json(allListings()));
app.get('/api/listings/:id/history',(req,res)=>res.json(history(req.params.id)));
let busy=false,lastImport=0;
app.post('/api/import',async(req,res)=>{if(busy||Date.now()-lastImport<3000){res.status(429).json({error:'An import is running. Please retry shortly.'});return;}busy=true;lastImport=Date.now();try{if(typeof req.body.url!=='string')throw new Error('A listing URL is required.');res.json(await importListing(req.body.url,req.body.refresh===true));}catch(e){res.status(422).json({error:(e as Error).message});}finally{busy=false;}});
if(process.env.NODE_ENV==='production'){app.use(express.static('dist'));}else{const{createServer}=await import('vite');const vite=await createServer({server:{middlewareMode:true},appType:'spa'});app.use(vite.middlewares);}
app.listen(Number(process.env.PORT??3000),'0.0.0.0',()=>console.log('Parcel Atlas listening on http://localhost:3000'));
