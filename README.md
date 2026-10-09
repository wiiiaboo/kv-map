# Parcel Atlas

React / TypeScript / Leaflet app that automatically collects KV.ee land-for-sale listings and maps their real, validated Estonian cadastral parcel boundaries over OpenStreetMap.

## Run

Requires Node 24 (built-in SQLite).

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Collection starts automatically; verified plots appear as detail checks complete. The page polls progress every 15 seconds. Search by location or cadastral number, click a parcel for listing details, or expand **Add a specific KV.ee listing** for a manual import.

```sh
npm run build
NODE_ENV=production npm start
npm test
# From a host allowed to fetch KV.ee: run 20 collector operations and export a snapshot
npm run collect -- 20
npm run import -- 'https://www.kv.ee/100-elamumaaehitamiseks-on-vaja-teha-detailplaneer-3736287.html'
```

Set `AUTO_SYNC=false` to disable background collection. `DB_PATH` selects the SQLite file, default `data/listings.sqlite`. Docker: `docker compose up --build`; its named volume retains data. See [RENDER.md](RENDER.md) for iPad-accessible staging.

## Collection and refresh

- The initial scan walks all `/maa-muuk?orderby=cdwl` search pages using KV.ee's `start` offsets. Only land result cards are discovered; duplicate listing IDs are merged.
- One search page is interleaved with five detail checks. A five-second timer drives one operation at a time; HTTP requests to KV.ee are spaced at least five seconds apart, including manual requests. Importing the entire market takes hours of awake runtime, not seconds.
- The database records the current scan offset, queued detail checks and retries. A restart resumes from that checkpoint if the database survives.
- Once initialized, the first two newest pages are scanned hourly and a full search-summary pass runs daily. New IDs and changed summary fingerprints become due for a detail check. Unchanged listing details are refreshed at most weekly, rather than on every discovery pass.
- Official parcel responses are cached for 30 days by cadastral number. Listings can reference multiple cadastral parcels, and parcels can be shared by listings.
- HTTP failures and parsing changes preserve the last successful listing. Failed listings back off exponentially from one hour to one day; repeated source failures pause the collector for up to one hour.
- A listing absent from two completed full scans is scheduled for verification. Only an explicit listing-page HTTP 404 or 410 archives it; absence, redirects, partial scans, and network errors never mark it removed. Archived listings remain in the database and observation history but are omitted from the default map API. `GET /api/listings?includeInactive=true` includes them.

Hourly discovery checks the first 100 recent results; the daily pass catches additions beyond that window. Offset pagination is not a transactional snapshot of KV.ee: listings can move while scanning, so daily repeated passes reconcile changes. A free sleeping host cannot promise uninterrupted schedules or complete coverage.

## Listing and cadastral data

Dedicated Katastrinumber/Katastritunnus fields and descriptions are scanned independently, then deduplicated. The importer records title, price, listed area, supplied €/m², listing URL, description, KV posted date, first/last seen and last checked. Both extensionless and `.html` listing URLs are supported, as are HTML and KV JSON page envelopes.

Maa- ja Ruumiamet's official WFS, https://gsavalik.envir.ee/geoserver/kataster/wfs , supplies `kataster:ky_kehtiv` with an exact `tunnus` filter and `srsName=CRS:84` (longitude/latitude). Only exactly matching Polygon/MultiPolygon features are drawn. Listings without cadastral numbers or matches are retained with empty geometry and clearly labelled. No guessed boundaries or listing point markers are substituted. Listing area is kept separate from official parcel `pindala`; the asking price belongs to the whole listing.

SQLite stores listing snapshots and immutable successful observations atomically. `firstSeen` survives refresh; `lastSeen` records the last successful active observation. `lastChecked` and `removedAt` record confirmed removal without rewriting lastSeen. Price changes are available in `GET /api/listings/:id/history` and the listing details panel.

## API

- `GET /healthz` — process health.
- `GET /api/sync` — discovered/imported/mapped counts, pending checks, errors and scan progress.
- `GET /api/listings` — active listing records with validated GeoJSON.
- `GET /api/listings/:id/history` — successful observation snapshots, including removals.
- `POST /api/import` with `{ "url": "...", "refresh": false }` — import a specific listing; reuse a result checked within the last hour unless refresh is requested.

## Verification and limits

`npm run build` checks TypeScript and builds the frontend; `npm test` covers real listing fixtures, multi-parcel extraction, discovery/pagination, incremental scheduling, scan resumption, failure backoff, safe removal detection, geometry coordinates, caching and price history. Fixtures are trimmed observations of actual source pages, not a promise a listing remains available. No fixtures are used as runtime data.

SQLite keeps staging small. PostgreSQL/PostGIS, durable hosting, authentication, broader filters and a continuously running worker remain follow-up work. The public manual-import endpoint has a process-level concurrency limit and fixed source host validation; it is not a production account-management system. Browser rendering and Docker execution have not been verified in this workspace.

## Staging source access

KV.ee returned HTTP 403 to the deployed Render collector during verification. Automatic collection works from the development workspace but remains blocked on that host. A partial verified initial snapshot is included in `data/bootstrap.json` so an empty staging database displays real mapped listings immediately. It retains original observation dates; the UI labels its capture time and partial coverage. This does not solve the blocked ongoing refreshes or constitute a full-market import.
