import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './style.css';
import type {Listing} from '../server/types';
const example='https://www.kv.ee/100-elamumaaehitamiseks-on-vaja-teha-detailplaneer-3736287.html';
const money=(n:number|null)=>n===null?'Not supplied':new Intl.NumberFormat('en-EE',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const area=(n:number|null)=>n===null?'Not supplied':`${n.toLocaleString()} m²`;
interface SyncStatus {enabled:boolean;running:boolean;discovered:number;imported:number;active:number;mapped:number;withoutGeometry:number;pending:number;errors:number;lastError:string|null;retryAt:string|null;lastFullAt:string|null;storage:string;scan:{kind:string;pages:number}|null;}
function App(){
 const [listings,setListings]=useState<Listing[]>([]),[selected,setSelected]=useState<string>(),[url,setUrl]=useState(''),[loading,setLoading]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[history,setHistory]=useState<any[]>([]),[sync,setSync]=useState<SyncStatus|null>(null),[showImport,setShowImport]=useState(false),[query,setQuery]=useState(''),[visible,setVisible]=useState(50);
 const mapEl=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),layer=useRef<L.GeoJSON|null>(null),lastView=useRef<string>(''),dataKey=useRef('');
 const current=listings.find(l=>l.id===selected);
 const filtered=listings.filter(l=>!query||`${l.title} ${l.cadastralNumbers.join(' ')}`.toLowerCase().includes(query.toLowerCase()));
 useEffect(()=>{
  let stopped=false;
  async function poll(){try{const responses=await Promise.all([fetch('/api/listings'),fetch('/api/sync')]);if(responses.some(r=>!r.ok))throw Error('Could not load tracker data.');const [data,status]=await Promise.all(responses.map(r=>r.json()));if(stopped)return;const key=data.map((l:Listing)=>`${l.id}:${l.lastChecked??l.lastSeen}:${l.active}`).join('|');if(key!==dataKey.current){dataKey.current=key;setListings(data);}setSync(status);}catch(e){if(!stopped)setError((e as Error).message);}}
  void poll();const timer=setInterval(()=>void poll(),15000);
  const m=L.map(mapEl.current!,{zoomControl:false,preferCanvas:true}).setView([58.8,25.2],7);map.current=m;L.control.zoom({position:'bottomright'}).addTo(m);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m).on('tileerror',()=>setNotice('Some basemap tiles could not load. Verified parcel boundaries remain available.'));
  return()=>{stopped=true;clearInterval(timer);m.remove();map.current=null;};
 },[]);
 useEffect(()=>{
  if(!map.current)return;layer.current?.remove();
  layer.current=L.geoJSON(filtered.flatMap(l=>l.parcels.features.map(f=>({...f,properties:{...f.properties,listingId:l.id}}))) as any,{
   style:f=>({color:f?.properties.listingId===selected?'#d27731':'#347965',weight:2,fillColor:f?.properties.listingId===selected?'#e2a166':'#63aa90',fillOpacity:.28}),
   onEachFeature:(f,polygon)=>{const listing=listings.find(l=>l.id===f.properties.listingId)!;const el=document.createElement('div');const title=document.createElement('strong');title.textContent=listing.title;const details=document.createElement('p');details.textContent=`${money(listing.price)} · ${area(listing.area)}\n${f.properties.tunnus}`;const a=document.createElement('a');a.href=listing.url;a.target='_blank';a.rel='noopener noreferrer';a.textContent='View listing on KV.ee ↗';el.append(title,details,a);polygon.bindPopup(el).on('click',()=>setSelected(listing.id));}
  }).addTo(map.current);
  const features=current?.parcels.features??filtered.flatMap(l=>l.parcels.features);
  const viewKey=`${selected??'all'}:${query}`;
  // Background imports never reset a visitor's pan or zoom.
  if(features.length&&viewKey!==lastView.current){const bounds=L.geoJSON(features as any).getBounds();map.current.fitBounds(bounds,{padding:[60,60],maxZoom:18});lastView.current=viewKey;}
 },[listings,selected,query]);
 useEffect(()=>{let cancelled=false;setHistory([]);if(selected)fetch(`/api/listings/${selected}/history`).then(r=>r.json()).then(data=>{if(!cancelled)setHistory(data);}).catch(()=>{});return()=>{cancelled=true;};},[selected,current?.lastChecked,current?.lastSeen]);
 async function importURL(value:string,refresh=false){setLoading(true);setError('');setNotice('');try{const r=await fetch('/api/import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:value,refresh})});const data=await r.json();if(!r.ok)throw Error(data.error??'Import failed');setListings(old=>[data,...old.filter(l=>l.id!==data.id)]);setSelected(data.id);setUrl('');setNotice(data.parcels.features.length?`${data.parcels.features.length} official parcels matched.`:'Listing saved; no cadastral geometry could be matched.');}catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 return <div className="app">
  <header><a className="brand" href="/"><span className="logo">◈</span> Parcel Atlas <span className="country">ESTONIA</span></a><span className="header-note"><i/> KV.ee × official cadastre</span></header>
  <main><aside>
   <div className="eyebrow">LAND, WITH ITS REAL BOUNDARIES</div><h1>Find your place.</h1><p className="intro">Land for sale, collected automatically and matched to official cadastral parcels.</p>
   <div className="sync-panel" aria-live="polite">
    <strong>{!sync?'Connecting to tracker…':!sync.enabled?'Automatic collection is paused':sync.lastError?'Collection will retry automatically':sync.scan?'Collecting KV.ee land listings…':'Monitoring KV.ee listings'}</strong>
    {sync&&<><p>{sync.mapped} mapped · {sync.active} tracked · {sync.discovered} discovered</p>{sync.pending>0&&<p>{sync.pending} listings waiting for detail checks. Plots appear as they are verified.</p>}{sync.withoutGeometry>0&&<p>{sync.withoutGeometry} listings have no matched parcel geometry.</p>}{sync.errors>0&&<p>{sync.errors} listings waiting for a retry.</p>}{sync.lastError&&<p className="sync-error">{sync.lastError}{sync.retryAt&&` Retrying after ${new Date(sync.retryAt).toLocaleTimeString()}.`}</p>}{sync.lastFullAt&&<p>Last full discovery: {new Date(sync.lastFullAt).toLocaleString()}</p>}{sync.storage==='ephemeral'&&<p className="storage-note">Free staging: collection runs while the service is awake. Restarts can reset saved data.</p>}</>}
   </div>
   <button className="text-button" onClick={()=>setShowImport(v=>!v)}>{showImport?'Hide manual import ↑':'Add a specific KV.ee listing →'}</button>
   {showImport&&<form onSubmit={e=>{e.preventDefault();void importURL(url);}}><label htmlFor="listing-url">KV.ee land listing URL</label><div className="input-row"><input id="listing-url" type="url" required placeholder="https://www.kv.ee/…" value={url} onChange={e=>setUrl(e.target.value)} disabled={loading}/><button disabled={loading||!url} aria-label="Import listing">{loading?'…':'↗'}</button></div><button className="text-button" type="button" disabled={loading} onClick={()=>void importURL(example)}>Try the verified Haapse listing →</button></form>}
   {loading&&<p role="status" className="notice">Reading listing and validating cadastral boundaries…</p>}{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
   <div className="section-title"><h2>Land for sale</h2><span>{listings.length}</span></div>
   <label className="sr-only" htmlFor="plot-search">Search by location or cadastral number</label><input id="plot-search" className="search-input" placeholder="Search location or cadastral number" value={query} onChange={e=>{setQuery(e.target.value);setVisible(50);}}/>
   <button className="text-button" onClick={()=>{setSelected(undefined);lastView.current='';setQuery('');const features=listings.flatMap(l=>l.parcels.features);if(features.length)map.current?.fitBounds(L.geoJSON(features as any).getBounds(),{padding:[60,60],maxZoom:18});}}>Show all plots on the map →</button>
   <div className="listing-list">{!listings.length&&<p className="empty">No manual import needed. The collector is checking listings; the first verified parcels will appear automatically.</p>}{listings.length>0&&!filtered.length&&<p className="empty">No matching listings.</p>}{filtered.slice(0,visible).map(l=><button className={`listing-card ${l.id===selected?'selected':''}`} key={l.id} onClick={()=>setSelected(l.id)}><div className="card-top"><span className="badge">Observed active</span><span>{l.parcels.features.length?`${l.parcels.features.length} parcels`:'No matched boundary'}</span></div><h3>{l.title}</h3><div className="card-bottom"><strong>{money(l.price)}</strong><span>{area(l.area)}</span></div></button>)}</div>{filtered.length>visible&&<button className="text-button" onClick={()=>setVisible(v=>v+50)}>Show 50 more listings →</button>}
   <footer>Boundaries: Maa- ja Ruumiamet<br/>Only parcels matched to the official cadastre are drawn.</footer>
  </aside><section className="map-panel" aria-label="Map of cadastral parcels"><div ref={mapEl} className="map"/><div className="map-label"><span className="dot"/> OFFICIAL PARCEL BOUNDARIES</div><div className="legend"><span/> Selected parcel <span className="green"/> Other listings</div>
   {current&&<div className="detail"><div className="detail-top"><div><span className="eyebrow">KV.EE #{current.id}</span><h2>{current.title}</h2></div><a href={current.url} target="_blank" rel="noopener noreferrer" className="view-link">View on KV.ee ↗</a></div><div className="metrics"><div><span>Asking price</span><strong>{money(current.price)}</strong></div><div><span>Listing area</span><strong>{area(current.area)}</strong></div><div><span>Price / m²</span><strong>{current.pricePerM2===null?'Not supplied':`€${current.pricePerM2}`}</strong></div></div><details><summary>Parcel & listing details</summary><div className="expanded"><p>{current.cadastralNumbers.map(n=><span className="parcel-id" key={n}>{n} {current.unmatchedNumbers.includes(n)?'· unmatched':'· validated'}</span>)}</p>{!current.cadastralNumbers.length&&<p>No cadastral number supplied; this listing has no polygon.</p>}{current.unmatchedNumbers.length>0&&<p className="error">Unmatched numbers are not drawn on the map.</p>}<p className="description">{current.description}</p><p>First seen {new Date(current.firstSeen).toLocaleDateString()} · Last checked {new Date(current.lastChecked??current.lastSeen).toLocaleString()}</p><p>KV.ee posted date: {current.postedAt??'Not supplied'}. Status reflects the last successful observation.</p>{history.length>0&&<p>{history.length} saved observations · {history.map(h=>money(h.listing.price)).filter((v,i,a)=>i===0||v!==a[i-1]).join(' ← ')}</p>}<button className="text-button" disabled={loading} onClick={()=>void importURL(current.url,true)}>Refresh this listing →</button></div></details></div>}
  </section></main>
 </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
