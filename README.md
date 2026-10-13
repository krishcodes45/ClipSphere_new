# ClipSphere

ClipSphere is a browser recording studio and collaborative library. After signing in and opening a workspace, an owner or editor can start a screen recording in Chrome or Edge, approve screen, microphone, and optional camera access, and stop the recording from the page or a floating Picture-in-Picture control. The browser streams the recording to the processing service, which stores it in S3, creates a transcript with Google Speech-to-Text, and asks Gemini for a title and summary. The Vercel web app organizes completed recordings into private or public workspaces with invitations, comments, and expiring share links.

## Applications

- `web-app/` — Next.js, Clerk, PostgreSQL, browser capture, S3 playback, workspace and collaboration APIs.
- `express-server/` — authenticated Socket.IO uploads, FFmpeg processing, S3 storage, transcription and metadata callbacks. Deploy this background processor on Render.
- `desktop-clipsphere/` — legacy Electron recorder; new recordings start from a signed-in web workspace.

## Configure and run

Keep `.env.local` and `.env` files local; they are ignored by Git. Use each app's `.env.example` as the key reference and the supplied local environment files as configured for this machine. The Google service-account JSON must exist at `GOOGLE_APPLICATION_CREDENTIALS`. FFmpeg and FFprobe must be available on `PATH`.

Install dependencies from the web app and processing service directories. Start the web app first, then the processing service:

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

The local web app listens on port 3000 and the processing service on 5000. Set `NEXT_PUBLIC_PROCESSING_URL` in `web-app/.env.local` to the processor's browser-reachable URL. Keep Clerk keys, database URL, AWS credentials and bucket, webhook secret, Gemini key, and Google service-account credentials consistent. `CLIPSPHERE_WEBHOOK_SECRET` and `CLERK_SECRET_KEY` must match between the web app and processing service. The web recorder sends a Clerk session token to Socket.IO; the service verifies it before accepting recording chunks.

## Build and operate

Run `npm run build` in `web-app` to build the Vercel app. Run `npm run db:migrate` in `web-app` after configuring PostgreSQL and before first use. The migration creates the account, workspace, invite, recording, studio-settings, share-link, and comments tables.

The recording processing callback uses `CLIPSPHERE_WEBHOOK_SECRET`; it is not a browser credential. Share links contain random bearer tokens and expire after 30 days. Invitations expire after 7 days and can only be accepted by the invited email address. Public workspace pages expose only ready recordings while public visibility is enabled.
