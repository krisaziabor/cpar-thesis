import { Head } from "@react-email/components";

/** Same Lector source as `app/globals.css`. */
const LECTOR_WOFF2 =
  "https://framerusercontent.com/assets/vVIFTY2PuwIapN7qdnad4UmbNg.woff2";

export interface KanonFontsProps {
  /**
   * Origin where `/fonts/DieGrotesk-*.woff2` is served (your Next `public/` folder).
   * For `email dev`, run `next dev` and keep the default `http://localhost:3000`, or set
   * `EMAIL_ASSET_ORIGIN` in `.env` for a deployed base URL.
   */
  assetOrigin?: string;
}

export function KanonFonts({ assetOrigin }: KanonFontsProps) {
  const origin = (assetOrigin ?? process.env.EMAIL_ASSET_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  const dieGroteskRegular = `${origin}/fonts/DieGrotesk-A-Regular.woff2`;

  return (
    <Head>
      <style>
        {`
@font-face {
  font-family: 'Lector';
  src: url('${LECTOR_WOFF2}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
@font-face {
  font-family: 'DieGrotesk';
  src: url('${dieGroteskRegular}') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
/* Beat preview / Tailwind defaults (e.g. Inter) — email clients still honor inline styles best */
[data-kanon-font="sans"] {
  font-family: 'DieGrotesk', 'Helvetica Neue', Arial, sans-serif !important;
}
[data-kanon-font="lector"] {
  font-family: 'Lector', Georgia, 'Times New Roman', serif !important;
}
`}
      </style>
    </Head>
  );
}
