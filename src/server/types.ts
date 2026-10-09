import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
export type Parcels = FeatureCollection<Polygon | MultiPolygon>;
export interface Listing { id:string; title:string; price:number|null; area:number|null; pricePerM2:number|null; url:string; description:string; cadastralNumbers:string[]; structuredNumbers:string[]; descriptionNumbers:string[]; firstSeen:string; lastSeen:string; active:boolean; postedAt:string|null; parcels:Parcels; unmatchedNumbers:string[]; }
