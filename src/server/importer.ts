import { getText } from './http.js';
import { listingURL, parseListing } from './scraper.js';
import { resolveParcels } from './cadastre.js';
import {saveListing,getListing} from './store.js';
export async function importListing(input:string,force=false){const url=listingURL(input);const id=url.match(/(\d{5,10})(?:\.html)?$/)![1];const prior=getListing(id);if(prior&&!force&&Date.now()-Date.parse(prior.lastSeen)<3600000)return prior;const listing=parseListing(await getText(url),url);return saveListing({...listing,lastChecked:listing.lastSeen,removedAt:null,...await resolveParcels(listing.cadastralNumbers)});}
