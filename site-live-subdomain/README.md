# Site live note (subdomain deploy)

Minimal Next.js app: one page that matches your main repo’s `/announcements/site-live` look, with **“Open Kanon”** pointing at your real Kanon deployment via `NEXT_PUBLIC_KANON_URL`.

## Use as its own repo

1. Copy this entire `site-live-subdomain` folder to a new directory (or push only this folder as a new git repo root).
2. `cd site-live-subdomain`
3. `npm install`
4. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_KANON_URL` to your Kanon URL (e.g. `https://kanon.krisaziabor.com`).
5. `npm run dev` — open [http://localhost:3000](http://localhost:3000).

`public/` already includes `KAKA-email-logo.png` and `fonts/DieGrotesk-A-Regular.woff2` (copied from the thesis project when this kit was generated). If you replace the logo, keep the path `/KAKA-email-logo.png` or update `app/page.tsx`.

## Merge into `create-next-app` instead

If you already ran `npx create-next-app@latest`:

- Align versions in `package.json` with this kit if you want parity (Next 16, React 19, Tailwind 4).
- Replace `app/globals.css`, `app/layout.tsx`, add `app/page.tsx`, `lib/*`, `postcss.config.mjs`, and merge `public/` assets.
- Set `paths: { "@/*": ["./*"] }` in `tsconfig.json` if missing.

## Nested in another repo

If this folder temporarily sits inside a larger repo that already has a `package-lock.json` at the parent, `next dev` may warn about multiple lockfiles. Either open **only** this folder in your editor / deploy from here as the project root, or rely on `turbopack.root` in `next.config.ts` (already set) to quiet Turbopack.

## Deploy (e.g. Vercel)

- Root directory: this folder.
- Environment variable: **`NEXT_PUBLIC_KANON_URL`** = your Kanon production URL (no trailing slash).
- Assign your subdomain (e.g. `hello.krisaziabor.com`) in the Vercel project domains.

## Copy edits from the main thesis repo

- **Message text:** `lib/site-live-announcement.ts`
- **Layout / styles:** `app/page.tsx`, `app/globals.css`

After changing copy in the main `cpar-thesis` repo, paste updates into the same files here (or symlink / submodule if you prefer).
