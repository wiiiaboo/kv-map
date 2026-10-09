import { getText } from './http.js';
import type { Parcels } from './types.js';
export const WFS='https://gsavalik.envir.ee/geoserver/kataster/wfs';
export async function resolveParcels(numbers:string[]) {
 const features:Parcels['features']=[],unmatchedNumbers:string[]=[];
 if(numbers.length>30)throw new Error('Listing contains more than 30 parcels; review it before importing.');
 for(const number of numbers){
 if(!/^\d{5}:\d{3}:\d{4}$/.test(number))throw new Error('Invalid cadastral number.');
 const u=new URL(WFS);u.search=new URLSearchParams({service:'WFS',version:'2.0.0',request:'GetFeature',typeNames:'kataster:ky_kehtiv',outputFormat:'application/json',srsName:'CRS:84',CQL_FILTER:`tunnus='${number}'`,count:'10'}).toString();
 const data=JSON.parse(await getText(u.href));
 if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw new Error('Official cadastre did not return GeoJSON.');
 const matches=data.features.filter((f:any)=>f.properties?.tunnus===number&&['Polygon','MultiPolygon'].includes(f.geometry?.type));
 if(!matches.length)unmatchedNumbers.push(number);else features.push(...matches);
 }
 return {parcels:{type:'FeatureCollection' as const,features},unmatchedNumbers};
}
