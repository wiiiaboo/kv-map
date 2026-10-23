import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {EMPTY_FILTERS,filterListings,filterErrors,changeAreaUnit,pricePerM2,type Filters} from '../src/client/filters';
import {landUses,landUseText,UNKNOWN_USE} from '../src/shared/land-use';
import type {Listing,Parcels} from '../src/server/types';
const snapshot=JSON.parse(readFileSync('data/bootstrap.json','utf8')).listings as Listing[];
const parcel=(code:string|null,percentage:number|null=100):Parcels['features'][number]=>({...structuredClone(snapshot[0].parcels.features[0]),properties:{tunnus:code??'unknown',siht1:code,so_prts1:percentage}});
const listing=(patch:Partial<Listing>={}):Listing=>({...structuredClone(snapshot[0]),id:'1000000',price:100000,area:10000,pricePerM2:null,...patch});
const filters=(patch:Partial<Filters>):Filters=>({...EMPTY_FILTERS,...patch});
test('inclusive combined price, size and calculated €/m² ranges',()=>{
 const l=listing();assert.equal(pricePerM2(l),10);
 assert.equal(filterListings([l],filters({minPrice:'100000',maxPrice:'100000',minArea:'1',maxArea:'1',areaUnit:'ha',minUnitPrice:'10',maxUnitPrice:'10'})).length,1);
 assert.equal(filterListings([l],filters({maxPrice:'99999'})).length,0);assert.equal(filterListings([l],filters({maxArea:'0.99',areaUnit:'ha'})).length,0);
});
test('empty and zero ranges differ; missing values do not pass a numeric constraint',()=>{
 const l=listing({price:null,area:null,pricePerM2:null});assert.equal(filterListings([l],filters({})).length,1);assert.equal(filterListings([l],filters({minPrice:'0'})).length,0);assert.equal(filterListings([l],filters({minArea:'0'})).length,0);assert.equal(filterListings([l],filters({minUnitPrice:'0'})).length,0);
 assert.equal(filterListings([listing({price:0})],filters({minPrice:'0',maxPrice:'0'})).length,1);
});
test('invalid and reversed ranges produce a validation error and no matches',()=>{for(const patch of [{minPrice:'200',maxPrice:'100'},{maxArea:'-1'},{minUnitPrice:'NaN'},{minArea:'Infinity'}]){assert.ok(filterErrors(filters(patch)).length);assert.equal(filterListings([listing()],filters(patch)).length,0);}});
test('switching area units preserves the physical bounds',()=>{const original=filters({minArea:'1500',maxArea:'125000'});const ha=changeAreaUnit(original,'ha');assert.equal(ha.minArea,'0.15');assert.equal(ha.maxArea,'12.5');assert.deepEqual(changeAreaUnit(ha,'m2'),original);assert.equal(changeAreaUnit(filters({}),'ha').minArea,'');});
test('mixed-purpose parcels retain official percentages and support secondary land uses',()=>{
 const f=parcel('ELAMUMAA',60);Object.assign(f.properties!,{siht2:'ARIMAA',so_prts2:40,siht3:'TRANSPORDIMAA',so_prts3:0});const uses=landUses(f);assert.deepEqual(uses.map(u=>[u.label,u.percentage]),[['Residential',60],['Commercial',40]]);assert.equal(landUseText(f),'Residential 60% · Commercial 40%');
 const l=listing({parcels:{type:'FeatureCollection',features:[f]}});assert.equal(filterListings([l],filters({landUse:'ARIMAA'})).length,1);assert.equal(filterListings([l],filters({landUse:'TRANSPORDIMAA'})).length,0);
});
test('land use filters individual shapes without splitting or changing the bundle price',()=>{
 const l=listing({parcels:{type:'FeatureCollection',features:[parcel('ELAMUMAA'),parcel('MAATULUNDUSMAA')]}});const result=filterListings([l],filters({landUse:'ELAMUMAA'}));assert.equal(result.length,1);assert.equal(result[0].parcels.length,1);assert.equal(result[0].parcels[0].properties!.siht1,'ELAMUMAA');assert.equal(result[0].listing.price,100000);assert.equal(result[0].listing.parcels.features.length,2);
});
test('missing purposes and unmatched geometry remain explicit unknowns',()=>{
 const a=listing({id:'unknown',parcels:{type:'FeatureCollection',features:[parcel(null)]}}),b=listing({id:'no-geometry',parcels:{type:'FeatureCollection',features:[]}});assert.equal(landUseText(a.parcels.features[0]),'Land use unknown');assert.equal(filterListings([a,b],filters({landUse:UNKNOWN_USE})).length,2);assert.equal(filterListings([a,b],filters({landUse:'ELAMUMAA'})).length,0);
});
test('sorts numeric values with missing values last, and supports official location fields',()=>{
 const a=listing({id:'a',price:50000}),b=listing({id:'b',price:100000}),c=listing({id:'c',price:null});assert.deepEqual(filterListings([c,b,a],filters({}),'price-desc').map(r=>r.listing.id),['b','a','c']);
 a.parcels.features[0].properties!.mk_nimi='Harju maakond';a.title='Test';assert.equal(filterListings([a],filters({query:'HARJU MAAKOND'})).length,1);
});
test('real snapshot land-use results only include matching official parcel purposes',()=>{
 const result=filterListings(snapshot,filters({landUse:'ELAMUMAA'}));assert.ok(result.length>0);assert.ok(result.length<snapshot.length);for(const r of result)for(const f of r.parcels)assert.ok(landUses(f).some(u=>u.code==='ELAMUMAA'));
});

test('source filtering keeps KV snapshots separate from live Leiakv offers',()=>{
 const kv=listing({id:'1234567'}),lei=listing({id:'leiakv:1234567',source:'leiakv',sourceId:'1234567'});
 assert.deepEqual(filterListings([kv,lei],filters({source:'kv'})).map(r=>r.listing.id),['1234567']);
 assert.deepEqual(filterListings([kv,lei],filters({source:'leiakv'})).map(r=>r.listing.id),['leiakv:1234567']);
 assert.equal(filterListings([kv,lei],filters({})).length,2);
});
