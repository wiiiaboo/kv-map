import type {Listing} from '../server/types';
export function sourceName(listing:Listing){return listing.source==='leiakv'?'Leiakv':'KV.ee';}
export function vatLabel(listing:Listing){return listing.vatStatus==='vatWillBeAdded'?'VAT will be added':listing.vatStatus==='includesVat'?'VAT included':'';}
