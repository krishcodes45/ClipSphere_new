# Free-tier hosting

This repository is prepared for a Vercel web deployment and a Render processing service. Keep the existing PostgreSQL database and S3 bucket configured in the supplied environment; the database schema migration has already been applied to that configured database. The desktop app needs a production build after the hosted URLs are known.

## 1. Deploy the web app to Vercel

1. Import this GitHub repository into Vercel.
2. Set the project root directory to `web-app`. Use the detected Next.js framework, `npm ci` for install, and `npm run build` for build.
3. Add these production environment variables in Vercel. Copy their values from your local `web-app/.env.local`; do not commit that file.

   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `DATABASE_URL`
   - `AWS_REGION`
   - `AWS_ACCESS_KEY_ID`
   - `AWS_SECRET_ACCESS_KEY`
   - `S3_BUCKET_NAME`
   - `CLIPSPHERE_WEBHOOK_SECRET`
   - `NEXT_PUBLIC_APP_URL` — the final Vercel URL, including `https://`
   - `NEXT_PUBLIC_DESKTOP_ORIGIN` — `http://localhost:5173` for desktop development; packaged Electron requests use the `null` origin already allowed by the app

4. Use production Clerk keys and add the Vercel domain to the Clerk instance's allowed origins and redirect URLs. Redeploy after setting environment values.

The existing database has the ClipSphere tables. If you create a different PostgreSQL database, set its `DATABASE_URL` and run `npm run db:migrate` from `web-app` before deploying.

## 2. Deploy the processing service to Render

1. In Render, create a Blueprint from this repository and choose the `render.yaml` file. It defines a free Docker web service, installs FFmpeg/FFprobe, and checks `/health`.
2. Set the prompted secret values from the existing `express-server/.env`. Use the same production Clerk secret and webhook secret as Vercel.
3. Set `GOOGLE_SERVICE_ACCOUNT_JSON` to the contents of the Google service-account JSON file as a secret environment variable. The backend passes this credential object directly to Google Speech-to-Text. Alternatively, you can use a Render Secret File named `clipsphere-service-account.json` at `/etc/secrets/clipsphere-service-account.json` and leave `GOOGLE_SERVICE_ACCOUNT_JSON` unset.
4. Set the service values that depend on deployment URLs:

   - `NEXT_API_HOST` — `https://<your-vercel-domain>/api/` (keep the trailing slash)
   - `WEB_APP_API_URL` — `https://<your-vercel-domain>`
   - `CLERK_SECRET_KEY` — the same production Clerk secret as Vercel
   - `CLIPSPHERE_WEBHOOK_SECRET` — the same value as Vercel
   - `BUCKET_NAME`, `ACCESS_KEY`, `SECRET_KEY`, `BUCKET_REGION`, and `GEMINI_API_KEY` — from your existing local server environment
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — the contents of the Google service-account JSON file, stored as a secret env var (or use the Secret File option above)

5. After Render deploys, check `https://<your-render-service>.onrender.com/health` for `{"status":"ok"}`.

## 3. Build a desktop app that uses the hosted services

Copy `desktop-clipsphere/.env.production.example` to `desktop-clipsphere/.env.production.local`, replace the three values with your production Clerk publishable key, Vercel API URL, and Render Socket.IO URL, then run `npm run build` in `desktop-clipsphere`. This creates a Windows installer configured for the hosted services; the existing `.env.local` remains for local development.

## Free-tier limits

Vercel Hobby is limited to personal, non-commercial use. Render free services spin down after 15 minutes without traffic, so the first visit or recording connection can take about a minute to wake. Render may suspend a free service if it drives unusually high external traffic. AWS S3, Google Speech-to-Text, Gemini, and Clerk usage are separate from free hosting and may have their own quotas or charges. Keep usage inside each account's free allowance.

- [Vercel Hobby limits](https://vercel.com/docs/plans/hobby)
- [Render free services and database limits](https://render.com/docs/free)
- [Render WebSocket support](https://render.com/docs/websocket)
- [Render environment variables and secret files](https://render.com/docs/configure-environment-variables)
