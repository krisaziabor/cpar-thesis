# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Kanon is a single Next.js 16 application (App Router, TypeScript, Tailwind CSS v4). It uses Firebase (Firestore, Auth, Storage) as its backend-as-a-service. There is no monorepo structure — everything lives in one package.

### Node version

The project requires **Node.js 20** (see `.nvmrc`). Use `source "$HOME/.nvm/nvm.sh" && nvm use 20` before running any npm commands.

### Commands

Standard npm scripts — see `package.json`:
- `npm run dev` — start dev server (Turbopack, port 3000)
- `npm run build` — production build
- `npm run lint` — ESLint (flat config in `eslint.config.mjs`)

### System dependencies for native modules

The `canvas` npm package requires system libraries: `libcairo2-dev`, `libjpeg-dev`, `libgif-dev`, `librsvg2-dev`, `libpango1.0-dev`, `libpixman-1-dev`, `pkg-config`, `build-essential`. The `yt-dlp-exec` postinstall needs a `python` binary (symlink `python3` to `python` if missing).

### Firebase configuration

The app gracefully handles missing Firebase credentials — `lib/firebase.ts` returns `null` for `db`/`auth`/`storage` when env vars are absent. Without Firebase credentials the app starts and renders the login page but cannot authenticate users. Firebase env vars go in `.env.local` (see `README.md` for the full list of `NEXT_PUBLIC_FIREBASE_*` variables).

### Dev auth bypass

In development mode (`NODE_ENV=development`), a **"Dev Sign In"** button appears on the login page. Clicking it signs in as `agent@cursor.com` with admin role — no Firebase Auth or Firestore whitelist needed. The session persists in `sessionStorage` across client-side navigations.

This bypass is implemented in three files:
- `lib/auth-context.tsx` — mock `User` object, `devSignIn` callback, `sessionStorage` persistence
- `lib/whitelist.ts` — dev email bypasses Firestore whitelist lookup
- `app/login/page.tsx` — renders the dev sign-in button

The bypass is **completely stripped from production builds** (`process.env.NODE_ENV !== "development"`). Firestore permission errors in the console are expected when using the dev bypass since the mock token is not a real Firebase ID token.

### Pre-existing lint issues

ESLint reports errors and warnings in the existing codebase (unescaped entities, `setState` in effects, unused vars, `<img>` vs `<Image>`). These are pre-existing and not regressions.
