# Render staging

The deployed app is at https://kv-parcel-map-staging.onrender.com . Source: https://github.com/wiiiaboo/kv-map .

After a source update, Render's automatic deployment should build the latest main branch. If auto-deploy is disabled, open the **kv-parcel-map-staging** service and choose **Manual Deploy → Deploy latest commit**. No new Blueprint is needed.

Once Live, open the app in Safari. The status panel shows discovery and mapping progress; listings appear automatically without pasting URLs. Allow a minute for the first parcels and hours of awake runtime for the entire market. The page refreshes its data every 15 seconds.

The included `render.yaml` keeps the user's chosen free plan. It starts the automatic collector with the web server. Free services sleep when unused, so collection pauses while sleeping. SQLite files, crawl checkpoints, geometry caches and price history can be lost on restart/redeploy. Collection restarts when storage is empty. This staging setup does not guarantee an always-current full feed.

For uninterrupted collection and persistent history later, use an always-on service with a persistent disk at `/app/data`, or migrate storage and run a scheduled worker. This change does not provision any paid resources.

Troubleshooting: `GET /healthz` checks availability; `GET /api/sync` shows collector errors/backoff. If KV.ee blocks Render's address or changes markup, the collector reports the error and retries conservatively. It does not bypass source restrictions or fabricate parcel data.

## Observed source-access limitation

The deployed collector received HTTP 403 from KV.ee on Render on 2026-10-09. It could not discover listings there, although the same normal HTTP importer succeeded from the development workspace. The collector keeps its error visible and backs off; this version does not bypass that restriction.

A partial verified snapshot collected in the development workspace is bundled as `data/bootstrap.json`. On an empty database it populates the map automatically. Its capture time and size are shown on the page. It is not a complete market import, and it does not establish that Render refreshes are working. Full unattended tracking needs a source-access arrangement that allows the collector's host to fetch KV.ee.
