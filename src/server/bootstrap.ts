import {existsSync,readFileSync} from 'node:fs';
import {allListings,saveListing} from './store.js';
import type {Listing} from './types.js';
let info:{capturedAt:string;count:number}|null=null;
export function seedFromSnapshot(){
 const path='data/bootstrap.json';if(!existsSync(path))return;
 const snapshot=JSON.parse(readFileSync(path,'utf8')) as {capturedAt:string;listings:Listing[]};
 if(!Array.isArray(snapshot.listings)||!Number.isFinite(Date.parse(snapshot.capturedAt)))throw Error('Invalid bootstrap snapshot');
 info={capturedAt:snapshot.capturedAt,count:snapshot.listings.length};
 if(allListings().length)return;
 for(const listing of snapshot.listings){
  if(!/^\d{5,10}$/.test(listing.id)||listing.parcels?.type!=='FeatureCollection')throw Error('Invalid bootstrap listing');
  for(const f of listing.parcels.features){if(!['Polygon','MultiPolygon'].includes(f.geometry.type)||!listing.cadastralNumbers.includes(String(f.properties?.tunnus)))throw Error('Unverified bootstrap geometry');}
  saveListing(listing);
 }
 console.log(`Loaded ${snapshot.listings.length} verified listings from snapshot captured ${snapshot.capturedAt}`);
}
export function snapshotInfo(){return info;}
