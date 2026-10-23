import {leiakv} from './leiakv.js';
const result=await leiakv.run(true);console.log(JSON.stringify(result,null,2));if(result.lastError)process.exitCode=1;
