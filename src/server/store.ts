import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Listing} from './types.js';
const dbPath=process.env.DB_PATH??'data/listings.sqlite';
mkdirSync(dirname(dbPath),{recursive:true});
const db=new DatabaseSync(dbPath);
db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS observations(id INTEGER PRIMARY KEY, listing_id TEXT NOT NULL, observed_at TEXT NOT NULL, document TEXT NOT NULL);`);
export function getListing(id:string):Listing|undefined{const r=db.prepare('SELECT document FROM listings WHERE id=?').get(id);return r?JSON.parse(String(r.document)):undefined;}
export function allListings():Listing[]{return db.prepare('SELECT document FROM listings ORDER BY id').all().map(r=>JSON.parse(String(r.document)));}
export function history(id:string){return db.prepare('SELECT observed_at,document FROM observations WHERE listing_id=? ORDER BY id DESC').all(id).map(r=>({observedAt:r.observed_at,listing:JSON.parse(String(r.document))}));}
export function saveListing(listing:Listing){const prior=getListing(listing.id);listing.firstSeen=prior?.firstSeen??listing.firstSeen;db.exec('BEGIN');try{db.prepare('INSERT INTO observations(listing_id,observed_at,document) VALUES(?,?,?)').run(listing.id,listing.lastSeen,JSON.stringify(listing));db.prepare('INSERT INTO listings VALUES(?,?) ON CONFLICT(id) DO UPDATE SET document=excluded.document').run(listing.id,JSON.stringify(listing));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return listing;}
