import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('official live response matches cadastral ID and has WGS84 polygon coordinates',()=>{const data=JSON.parse(readFileSync('research/parcel.json','utf8'));assert.equal(data.type,'FeatureCollection');assert.equal(data.features.length,1);const f=data.features[0];assert.equal(f.properties.tunnus,'24505:001:0923');assert.equal(f.geometry.type,'Polygon');const ring=f.geometry.coordinates[0];assert.deepEqual(ring[0],ring.at(-1));assert.ok(ring.length>=4);for(const [lon,lat] of ring){assert.ok(lon>21&&lon<29);assert.ok(lat>57&&lat<60);}});
