# Kanon

Voice-driven community libraries. A web platform for small communities to build collective knowledge archives with audio testimony, graph visualization, and human curation.

## Prerequisites

- **Node.js** 20+ (use [nvm](https://github.com/nvm-sh/nvm) and run `nvm use` in the repo, or ensure your system Node matches `.nvmrc`)
- **npm** (or pnpm / yarn)

## Setup

1. **Clone and install**

   ```bash
   git clone <repo-url>
   cd cpar-thesis
   npm install
   ```

2. **Environment variables**

   Copy the example env file and fill in your keys:

   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local`:

   - **Firebase** (required for app functionality): create a [Firebase project](https://console.firebase.google.com/), then in **Project settings → General → Your apps** add a web app and copy the config into the `NEXT_PUBLIC_FIREBASE_*` variables.
   - **OpenAI** (optional, for audio transcription): add `OPENAI_API_KEY` from [OpenAI API keys](https://platform.openai.com/api-keys) to enable the `/api/transcribe` Whisper integration.

3. **Firebase Console setup**

   In your Firebase project:

   - Enable **Firestore** (Create database).
   - Enable **Authentication** → Sign-in method → **Email/Password** (for email whitelist auth).
   - Enable **Storage** (for audio files).

   Firestore layout follows `DATA_MODEL.md`: top-level collections `communities`, `users`, `items`, `connections`; subcollections `connections/{id}/items` and `connections/{id}/responses`.

4. **Firestore security rules (optional for dev)**

   See [Firestore rules](#firestore-rules) below. Deploy with Firebase CLI: `firebase deploy --only firestore:rules` after running `firebase init` in the repo.

## Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use the **Graph view** link for the placeholder D3 force-directed graph.

- **Build:** `npm run build`
- **Start (production):** `npm run start`
- **Lint:** `npm run lint`

## Deploy (Vercel)

Next.js is detected automatically by Vercel.

- **One-click:** Connect the repo at [vercel.com/new](https://vercel.com/new) and add the same env vars from `.env.local` in the Vercel project settings.
- **CLI:** `npx vercel` and follow prompts; set env vars in the dashboard or via CLI.

## Firestore rules

A starter `firestore.rules` file is in the repo. To deploy:

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Log in: `firebase login`
3. In the repo: `firebase init` → choose Firestore, use existing `firestore.rules` if prompted.
4. Deploy rules: `firebase deploy --only firestore:rules`

Adjust the rules for your auth and community-whitelist logic before production.

## Project structure

- `app/` — Next.js App Router (pages, layout, API routes)
- `components/` — React components (e.g. `GraphView` for D3)
- `lib/` — Firebase config, TypeScript types (see `DATA_MODEL.md`)

## References

- [DATA_MODEL.md](DATA_MODEL.md) — Entity model and Firebase collections
- Proposal PDF — Full system architecture and design principles
