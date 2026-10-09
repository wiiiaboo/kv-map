# Render staging

The deployed app is at https://kv-parcel-map-staging.onrender.com . Source: https://github.com/wiiiaboo/kv-map .

After a source update, Render's automatic deployment should build the latest main branch. If auto-deploy is disabled, open the **kv-parcel-map-staging** service and choose **Manual Deploy → Deploy latest commit**. No new Blueprint is needed.

Once Live, open the app in Safari. The status panel shows discovery and mapping progress; listings appear automatically without pasting URLs. Allow a minute for the first parcels and hours of awake runtime for the entire market. The page refreshes its data every 15 seconds.

The included `render.yaml` keeps the user's chosen free plan. It starts the automatic collector with the web server. Free services sleep when unused, so collection pauses while sleeping. SQLite files, crawl checkpoints, geometry caches and price history can be lost on restart/redeploy. Collection restarts when storage is empty. This staging setup does not guarantee an always-current full feed.

For uninterrupted collection and persistent history later, use an always-on service with a persistent disk at `/app/data`, or migrate storage and run a scheduled worker. This change does not provision any paid resources.

Troubleshooting: `GET /healthz` checks availability; `GET /api/sync` shows collector errors/backoff. If KV.ee blocks Render's address or changes markup, the collector reports the error and retries conservatively. It does not bypass source restrictions or fabricate parcel data.
