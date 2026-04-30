# Kanon

Voice-driven community libraries. A web platform for small communities to build collective knowledge archives with audio testimony, graph visualization, and human curation. Final thesis project for Computing and the Arts at Yale University.

## Tech stack

- **Next.js 16** (App Router, Turbopack) · **React 19** · **TypeScript 5**
- **Tailwind CSS 4**, **Framer Motion**, **dialkit** (live animation tuning)
- **Firebase 12** (Auth, Firestore, Storage) + **firebase-admin** for server-side work
- **Resend** + **react-email** for transactional sign-in emails
- **Anthropic Claude** (Haiku) for metadata extraction and audio transcription
- **D3.js**, **@xyflow/react** (React Flow) for graph visualization
- **pdfjs-dist**, **mupdf** (WASM), **@napi-rs/canvas** for PDF rendering
- **@distube/ytdl-core**, **yt-dlp-exec** for YouTube audio mirroring

See [docs/architecture.md](docs/architecture.md) for diagrams.

## Prerequisites

- **Node.js** 20+ (a `.nvmrc` is committed — `nvm use` will pick it up)
- **npm** (pnpm/yarn also work)
- A **Firebase** project (free Spark tier is fine)
- A **Resend** account with a verified sender domain
- An **Anthropic API key** (for transcription + metadata)

## Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd cpar-thesis
nvm use      # optional, picks Node 20 from .nvmrc
npm install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

Then fill in `.env.local`. Minimum required to boot the app and sign in:

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_*` (6 vars) | Firebase Console → Project settings → General → Your apps → Web app config |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Console → Project settings → Service accounts → Generate new private key. Paste the full JSON as a single-line string. |
| `RESEND_API_KEY`, `RESEND_FROM` | [resend.com/api-keys](https://resend.com/api-keys); `RESEND_FROM` must be on a verified domain |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com/) |
| `NEXT_PUBLIC_APP_URL` | Your production origin (e.g. `https://kanon.yourdomain.com`) |

Optional keys (YouTube, Spotify, Instagram, ElevenLabs, yt-dlp cookies, feature flags) are documented inline in `.env.local.example`.

### 3. Firebase Console setup

In the Firebase Console for your project:

1. **Authentication → Sign-in method**: enable both **Google** and **Email link (passwordless sign-in)**.
2. **Authentication → Settings → Authorized domains**: ensure `localhost` is listed (it is by default) and add your production domain.
3. **Firestore Database**: create a database (production mode is fine — rules are committed).
4. **Storage**: enable Cloud Storage (used for audio uploads and rendered PDF pages).

### 4. Whitelist your email

Kanon gates access via a Firestore `whitelist` collection. Before your first sign-in, add yourself manually:

- Collection: `whitelist`
- Document ID: your email, lowercased (e.g. `kris.aziabor@yale.edu`)
- Fields: `role: "admin"` (or `"member"`), optionally `firstName: "Kris"`

### 5. Deploy Firestore rules (recommended)

```bash
npm install -g firebase-tools
firebase login
firebase use --add               # pick your project
firebase deploy --only firestore:rules
```

The committed `firestore.rules` enforces auth + whitelist semantics for the live collections.

### 6. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign in with Google or request a magic link — local-dev magic links return to localhost (validated server-side against an allowlist).

Other scripts:

- `npm run build` — production build
- `npm run start` — run the production build locally
- `npm run lint` — ESLint

## Deploy (Vercel)

Next.js is detected automatically.

1. Connect the repo at [vercel.com/new](https://vercel.com/new).
2. Copy every variable from `.env.local` into the Vercel project's environment settings (Production + Preview).
3. Add your Vercel deployment domain to Firebase **Authorized domains**.
4. Set `NEXT_PUBLIC_APP_URL` to the canonical production URL.

## Firestore data model

Top-level collections:

- `users` — profile + onboarding state
- `communities` — community metadata + `email_whitelist`
- `items` — library entries (with `voice_recording_url` synced from latest audio version)
- `connections` — links between items
- `connection_items` — junction table for connection ↔ item membership
- `responses` — voice responses to connections
- `whitelist` — access gate keyed by email
- `deletion_requests` — soft-delete approval queue (admin-reviewed)

Subcollections:

- `items/{id}/audio_versions` — every recorded version of an item's testimony
- `connections/{id}/items`, `connections/{id}/responses`

See [DATA_MODEL.md](DATA_MODEL.md) for full field details and [USER_FLOWS.md](USER_FLOWS.md) for the screen-level flows.

## Project structure

- `app/` — Next.js App Router (pages, layout, API routes under `app/api/`)
- `components/` — React components (audio recorder, graph, transcript, installation panels)
- `lib/` — Firebase config, types, auth context, motion primitives, server helpers
- `emails/` — react-email templates for transactional mail
- `docs/` — architecture diagrams + research notes
- `firestore.rules` — committed security rules

## References

- [docs/architecture.md](docs/architecture.md) — system + sequence + state diagrams
- [DATA_MODEL.md](DATA_MODEL.md) — entity model and Firestore collections
- [USER_FLOWS.md](USER_FLOWS.md) — screen-by-screen user flows
