# Test on Render from an iPad

1. Put this project's source in a GitHub repository. Include `Dockerfile`, `render.yaml`, source files and package lock; exclude `node_modules`, `dist`, local databases and credentials.
2. In the Render dashboard choose **New → Blueprint** and connect that repository. Render reads `render.yaml` and creates a free Docker web service named `kv-parcel-map-staging`.
3. Once deployment is Live, open the HTTPS `onrender.com` URL shown on the service page in Safari.
4. Click **Try the verified Haapse listing**. The server fetches KV.ee and the official cadastral geometry, then draws the parcel. Check the popup, listing details and refresh action.

The free staging service stores SQLite on an ephemeral filesystem: imports and history can be lost on redeploy or restart. Free services can sleep and take time to wake up. This setup is for testing, not durable market tracking. Persistent history later requires a paid service with a disk mounted at `/app/data`, or a database migration.

The saved local example database is intentionally excluded from the Docker image. Render starts empty and imports the real listing on demand. If KV.ee blocks requests from Render, the app reports the error instead of drawing fabricated data.

No Render API credential is needed for this dashboard workflow. Never put an API key in the repository or chat.
