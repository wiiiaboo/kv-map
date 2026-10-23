import type {Listing,Parcels} from '../server/types';
import {landUses,UNKNOWN_USE} from '../shared/land-use';
export type SortOrder='newest'|'price-asc'|'price-desc'|'area-asc'|'area-desc'|'unit-asc';
export interface Filters {query:string;source:string;minPrice:string;maxPrice:string;minArea:string;maxArea:string;areaUnit:'m2'|'ha';minUnitPrice:string;maxUnitPrice:string;landUse:string;}
export const EMPTY_FILTERS:Filters={query:'',source:'',minPrice:'',maxPrice:'',minArea:'',maxArea:'',areaUnit:'m2',minUnitPrice:'',maxUnitPrice:'',landUse:''};
const bound=(value:string)=>value.trim()===''?null:Number(value);
export function pricePerM2(listing:Listing):number|null{return listing.pricePerM2??(listing.price!==null&&listing.area!==null&&listing.area>0?listing.price/listing.area:null);}
export function filterErrors(filters:Filters){
 const errors:string[]=[];
 for(const [name,min,max] of [['Price',filters.minPrice,filters.maxPrice],['Area',filters.minArea,filters.maxArea],['Price per m²',filters.minUnitPrice,filters.maxUnitPrice]]){
  const a=bound(min),b=bound(max);
  if([a,b].some(v=>v!==null&&(!Number.isFinite(v)||v<0)))errors.push(`${name} must be zero or greater.`);
  else if(a!==null&&b!==null&&a>b)errors.push(`${name}: minimum must not exceed maximum.`);
 }
 return errors;
}
function inRange(value:number|null,min:string,max:string,multiplier=1){const a=bound(min),b=bound(max);if(a===null&&b===null)return true;if(value===null||!Number.isFinite(value))return false;return (a===null||value>=a*multiplier)&&(b===null||value<=b*multiplier);}
export function matchingParcels(listing:Listing,use:string):Parcels['features']{
 return listing.parcels.features.filter(f=>!use||(use===UNKNOWN_USE?!landUses(f).length:landUses(f).some(u=>u.code===use)));
}
export interface FilteredListing {listing:Listing;parcels:Parcels['features'];}
export function filterListings(listings:Listing[],filters:Filters,sort:SortOrder='newest'):FilteredListing[]{
 if(filterErrors(filters).length)return [];
 const query=filters.query.trim().toLocaleLowerCase();
 const results=listings.flatMap(listing=>{
  if(filters.source&&(listing.source??'kv')!==filters.source)return [];
  const properties=listing.parcels.features.map(f=>{const p=f.properties??{};return [p.mk_nimi,p.ov_nimi,p.ay_nimi,p.l_aadress].join(' ');}).join(' ');
  if(query&&!`${listing.title} ${listing.cadastralNumbers.join(' ')} ${properties}`.toLocaleLowerCase().includes(query))return [];
  if(!inRange(listing.price,filters.minPrice,filters.maxPrice)||!inRange(listing.area,filters.minArea,filters.maxArea,filters.areaUnit==='ha'?10000:1)||!inRange(pricePerM2(listing),filters.minUnitPrice,filters.maxUnitPrice))return [];
  const parcels=matchingParcels(listing,filters.landUse);
  if(filters.landUse&&!parcels.length&&!(filters.landUse===UNKNOWN_USE&&!listing.parcels.features.length))return [];
  return [{listing,parcels}];
 });
 const compare=(a:number|null,b:number|null,desc=false)=>a===null?(b===null?0:1):b===null?-1:(a-b)*(desc?-1:1);
 return results.sort((a,b)=>{
  let diff=0;const x=a.listing,y=b.listing;
  if(sort.startsWith('price-'))diff=compare(x.price,y.price,sort==='price-desc');
  else if(sort.startsWith('area-'))diff=compare(x.area,y.area,sort==='area-desc');
  else if(sort==='unit-asc')diff=compare(pricePerM2(x),pricePerM2(y));
  else diff=compare(Date.parse(x.postedAt??x.firstSeen)||null,Date.parse(y.postedAt??y.firstSeen)||null,true);
  return diff||x.id.localeCompare(y.id);
 });
}
export function changeAreaUnit(filters:Filters,unit:Filters['areaUnit']):Filters{
 if(filters.areaUnit===unit)return filters;
 const factor=unit==='ha'?1/10000:10000;
 const convert=(v:string)=>v.trim()===''?'':String(Number((Number(v)*factor).toPrecision(12)));
 return {...filters,areaUnit:unit,minArea:convert(filters.minArea),maxArea:convert(filters.maxArea)};
}
