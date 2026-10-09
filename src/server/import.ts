import {importListing} from './importer.js';
try{const listing=await importListing(process.argv[2],process.argv.includes('--refresh'));console.log(JSON.stringify(listing,null,2));}catch(e){console.error((e as Error).message);process.exitCode=1;}
