# ClipSphere

ClipSphere pairs a desktop screen recorder with a collaborative web library. The desktop app records the screen and microphone, then sends the video to the processing service. The service stores the video in S3, creates a transcript with Google Speech-to-Text, and asks Gemini for a title and summary. The web app organizes completed recordings into private or public workspaces with invitations, comments, and expiring share links.

## Applications

- `web-app/` — Next.js, Clerk, PostgreSQL, S3 playback, workspace and collaboration APIs.
- `express-server/` — authenticated Socket.IO uploads, FFmpeg processing, S3 storage, transcription and metadata callbacks.
- `desktop-clipsphere/` — Electron, React, and Vite recorder.

## Configure and run

Keep `.env.local` and `.env` files local; they are ignored by Git. Use each app's `.env.example` as the key reference and the supplied local environment files as configured for this machine. The Google service-account JSON must exist at `GOOGLE_APPLICATION_CREDENTIALS`. FFmpeg and FFprobe must be available on `PATH`.

Install dependencies from each application directory. Start the web app first, then the processing service and desktop app:

```powershell
cd web-app
npm install
npm run db:migrate
npm run dev
```

In separate terminals:

```powershell
cd express-server
npm install
npm run dev
```

```powershell
cd desktop-clipsphere
npm install
npm run dev
```

The local web app listens on port 3000, the desktop Vite app on 5173, and the processing service on 5000. Keep the Clerk keys, database URL, AWS credentials and bucket, webhook secret, Gemini key, and Google service-account credentials consistent with the environment files. `CLIPSPHERE_WEBHOOK_SECRET` must match between the web app and processing service. The desktop app uses the Clerk publishable key and requests a Clerk session token for both the web API and Socket.IO service.

## Build and operate

Run `npm run build` in `web-app` to build the web service and in `desktop-clipsphere` to package the desktop app. Run `npm run db:migrate` in `web-app` after configuring PostgreSQL and before first use. The migration creates the account, workspace, invite, recording, studio-settings, share-link, and comments tables.

The recording processing callback uses `CLIPSPHERE_WEBHOOK_SECRET`; it is not a browser credential. Share links contain random bearer tokens and expire after 30 days. Invitations expire after 7 days and can only be accepted by the invited email address. Public workspace pages expose only ready recordings while public visibility is enabled.
