import React from 'react';
import type {Listing} from '../server/types';
import {landUses,UNKNOWN_USE} from '../shared/land-use';
import {changeAreaUnit,EMPTY_FILTERS,filterErrors,type Filters} from './filters';
export function FilterPanel({filters,setFilters,listings}:{filters:Filters;setFilters:(next:Filters)=>void;listings:Listing[]}){
 const options=new Map<string,string>();let unknown=false;
 for(const l of listings){if(!l.parcels.features.length)unknown=true;for(const f of l.parcels.features){const uses=landUses(f);if(!uses.length)unknown=true;for(const u of uses)options.set(u.code,`${u.label} · ${u.estonian}`);}}
 const update=(key:keyof Filters,value:string)=>setFilters({...filters,[key]:value});
 const active=Object.entries(filters).filter(([k,v])=>k!=='areaUnit'&&v!=='').length;
 function range(title:string,min:keyof Filters,max:keyof Filters,step:string='any'){
  return <fieldset className="range-group"><legend>{title}</legend><div className="range-inputs"><label><span>Minimum</span><input type="number" inputMode="decimal" min="0" step={step} placeholder="No minimum" value={filters[min]} onChange={e=>update(min,e.target.value)}/></label><span className="range-dash" aria-hidden="true">–</span><label><span>Maximum</span><input type="number" inputMode="decimal" min="0" step={step} placeholder="No maximum" value={filters[max]} onChange={e=>update(max,e.target.value)}/></label></div></fieldset>;
 }
 return <section className="filter-section" aria-label="Listing filters">
  <label htmlFor="plot-search">Location or cadastral number</label><input id="plot-search" className="search-input" placeholder="e.g. Harjumaa, Haapse, 24505:…" value={filters.query} onChange={e=>update('query',e.target.value)}/>
  <details className="filters-panel" open><summary>Filters <span className="filter-badge">{active?`${active} set`:'All plots'}</span></summary><div className="filter-fields">
   <label htmlFor="listing-source">Listing source</label><select id="listing-source" value={filters.source} onChange={e=>update('source',e.target.value)}><option value="">All sources</option><option value="leiakv">Leiakv · public API</option><option value="kv">KV.ee · saved snapshot</option></select>
   {range('Asking price (€)' ,'minPrice','maxPrice')}
   <div className="area-unit"><span>Area units</span><div role="group" aria-label="Area units"><button type="button" aria-pressed={filters.areaUnit==='m2'} onClick={()=>setFilters(changeAreaUnit(filters,'m2'))}>m²</button><button type="button" aria-pressed={filters.areaUnit==='ha'} onClick={()=>setFilters(changeAreaUnit(filters,'ha'))}>ha</button></div></div>
   {range(`Listing area (${filters.areaUnit==='ha'?'ha':'m²'})`,'minArea','maxArea')}
   {range('Price per m² (€)','minUnitPrice','maxUnitPrice')}
   <label htmlFor="land-use">Official parcel land use</label><select id="land-use" value={filters.landUse} onChange={e=>update('landUse',e.target.value)}><option value="">All land-use types</option>{[...options].sort((a,b)=>a[1].localeCompare(b[1])).map(([code,label])=><option key={code} value={code}>{label}</option>)}{unknown&&<option value={UNKNOWN_USE}>Unknown / no matched parcel</option>}</select>
   <p className="filter-help">Price and area refer to the whole listing. Land use filters individual parcel boundaries. €/m² is calculated from price ÷ listing area when not supplied.</p>
   <p className="filter-help">Agricultural / forestry is the cadastral purpose, not a forest-cover classification or permission to build.</p>
   {filterErrors(filters).map(message=><p className="filter-validation" role="alert" key={message}>{message}</p>)}
   <button type="button" className="text-button" onClick={()=>setFilters({...EMPTY_FILTERS})}>Reset all filters ↺</button>
  </div></details>
 </section>;
}
