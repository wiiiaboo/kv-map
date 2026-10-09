# Parcel Atlas

A small TypeScript / React / Leaflet app that imports individual KV.ee land-for-sale listings and draws their verified Estonian cadastral boundaries over OpenStreetMap.

## Run

Requires Node 24 (uses built-in SQLite).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Paste an individual KV.ee HTTPS URL or click **Try the verified Haapse listing**. Imports are saved locally. Repeating an import within an hour returns the saved result; **Refresh this listing** explicitly checks it again.

```sh
npm run import -- 'https://www.kv.ee/100-elamumaaehitamiseks-on-vaja-teha-detailplaneer-3736287.html'
npm run build
NODE_ENV=production npm start
npm test
```

Docker: `docker compose up --build`, then open http://localhost:3000. The named volume retains observations and listing data. To import from the CLI in Docker: `docker compose exec app npm run import -- 'LISTING_URL'`.

## First verified example

KV.ee #3736287: Lauri tee 10, Haapse, Jõelähtme vald, Harjumaa. Observed asking price €75,000; listed area 1,060 m²; structured cadastral number `24505:001:0923`. The official WFS returned a Polygon in CRS:84 (longitude, latitude). `research/listing.fixture.html` and `research/parcel.json` contain the fetched verification inputs; these are observations, not a promise that the listing remains for sale.

## Data flow

1. Validate a single KV.ee URL. Ordinary HTTP retrieves HTML; no browser automation.
2. Parse the dedicated Katastrinumber field and description separately, then deduplicate cadastral numbers. Read title, price, listed area, supplied €/m² and KV posted date.
3. Query Maa- ja Ruumiamet's official `kataster:ky_kehtiv` WFS with an exact `tunnus` filter and `srsName=CRS:84`.
4. Accept only exact matching Polygon/MultiPolygon features. Unmatched numbers are shown as unmatched and never given guessed geometry.
5. Save the listing and an immutable observation atomically in SQLite. Preserve firstSeen; update lastSeen only after a successful import. Render all matched parcels on Leaflet with a popup linking to KV.ee.

Official service: https://gsavalik.envir.ee/geoserver/kataster/wfs . Official `pindala` is cadastral area; listing area is kept separately and never replaced silently. Multiple listing parcels do not each inherit a separate asking price.

## Scope and limitations

This is a single-listing milestone, not a complete active-market feed. No bulk crawling, background refresh, automatic removal detection or advanced filtering yet. Active means observed active on the last successful check. Network failures or parsing changes do not mark a listing removed. History includes explicit refresh observations and price changes; days since firstSeen are tracking age, not the total advertised duration. KV posted date is shown separately.

SQLite keeps this milestone small and Docker-compatible. PostgreSQL/PostGIS is the planned next storage step for spatial queries and incremental crawling. History is stored as complete snapshots so parser changes do not discard earlier values.

The app is intended for local use. Add authentication and operational rate limiting before exposing its import endpoint publicly. Existing URL validation restricts fetches to individual KV.ee pages and disables redirects. Source failures are shown to the user; no fabricated fixtures are substituted. Scraper selectors may need maintenance when KV.ee markup changes.

Build and parser tests run with `npm run build` and `npm test`. Browser rendering and Docker execution have not been verified in the development workspace. For an iPad-accessible staging deployment on Render, see [RENDER.md](RENDER.md). This project runs as a Node server.
