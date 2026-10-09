import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseListing,listingURL,cadastralNumbers} from '../src/server/scraper.js';
const url='https://www.kv.ee/100-elamumaaehitamiseks-on-vaja-teha-detailplaneer-3736287.html';
test('real listing fields and exact parcel',()=>{const l=parseListing(readFileSync('research/listing.fixture.html','utf8'),url);assert.equal(l.id,'3736287');assert.equal(l.price,75000);assert.equal(l.area,1060);assert.equal(l.pricePerM2,70.8);assert.deepEqual(l.cadastralNumbers,['24505:001:0923']);assert.match(l.title,/Lauri tee 10/);});
test('description adds parcels without duplicates or invalid digit lengths',()=>{const html=readFileSync('research/listing.fixture.html','utf8').replace('class="description-content">','class="description-content">24505:001:0923 ja 24505:001:0924 ');assert.deepEqual(parseListing(html,url).cadastralNumbers,['24505:001:0923','24505:001:0924']);assert.deepEqual(cadastralNumbers('124505:001:0923 24505:001:09234 24505:001:0923'),['24505:001:0923']);});
test('rejects other hosts, credentials, and nonlisting URLs',()=>{for(const s of ['http://www.kv.ee/3736287','https://evil.test/3736287','https://www.kv.ee@evil.test/3736287','https://www.kv.ee/search','https://www.kv.ee:444/3736287'])assert.throws(()=>listingURL(s));});
test('rejects challenge or nonland pages',()=>{assert.throws(()=>parseListing('<h1>Just a moment</h1>',url));});

test('KV JSON page envelope is parsed',()=>{const l=parseListing(readFileSync('research/envelope.fixture.json','utf8'),url);assert.equal(l.price,75000);assert.equal(l.area,1060);assert.equal(l.pricePerM2,70.8);assert.deepEqual(l.cadastralNumbers,['24505:001:0923']);});
