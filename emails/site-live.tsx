import {
  Body,
  Container,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";
import { siteLiveAnnouncement } from "@/lib/site-live-announcement";
import { KanonFonts } from "./kanon-fonts";
import { kanonEmailTailwindConfig } from "./kanon-email-theme";

/** Matches `app/globals.css` / login: DieGrotesk as UI sans. */
const sansFontFamily = "'DieGrotesk', 'Helvetica Neue', Arial, sans-serif";

function logoSrc(assetOrigin: string | undefined): string {
  const origin = (assetOrigin ?? process.env.EMAIL_ASSET_ORIGIN ?? "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return `${origin}/KAKA-email-logo.png`;
}

export interface SiteLiveEmailProps {
  /** Public URL of the live app (homepage or landing). */
  siteUrl: string;
  assetOrigin?: string;
}

export const SiteLiveEmail = ({ siteUrl, assetOrigin }: SiteLiveEmailProps) => {
  const { previewText, headline, paragraphs, signoffLines, ctaLabel, footer } = siteLiveAnnouncement;

  return (
    <Tailwind config={kanonEmailTailwindConfig}>
      <Html>
        <KanonFonts assetOrigin={assetOrigin} />
        <Body
          className="m-0 bg-kanon-bg p-0"
          data-kanon-font="sans"
          style={{ fontFamily: sansFontFamily }}
        >
          <Preview>{previewText}</Preview>
          <Container className="mx-auto max-w-[480px] px-8 pb-28 pt-24">
            <Img
              src={logoSrc(assetOrigin)}
              alt="Kanon"
              width={56}
              height={56}
              className="m-0 block"
            />

            <Heading
              as="h1"
              className="m-0 mt-10 text-[28px] font-bold leading-[1.15] tracking-tight text-kanon-title"
              data-kanon-font="sans"
              style={{ fontFamily: sansFontFamily, fontWeight: 700 }}
            >
              {headline}
            </Heading>

            <Section className="mt-6">
              {paragraphs.map((text, i) => (
                <Text
                  key={text}
                  className={`m-0 text-[15px] leading-[1.55] text-kanon-primary${i > 0 ? " mt-5" : ""}`}
                  data-kanon-font="sans"
                  style={{ fontFamily: sansFontFamily }}
                >
                  {text}
                </Text>
              ))}
              {signoffLines.map((line, i) => (
                <Text
                  key={line}
                  className={`m-0 text-[15px] leading-[1.55] text-kanon-primary${i === 0 && paragraphs.length > 0 ? " mt-5" : i > 0 ? " mt-1" : ""}`}
                  data-kanon-font="sans"
                  style={{ fontFamily: sansFontFamily }}
                >
                  {line}
                </Text>
              ))}
            </Section>

            <Section className="mt-12">
              <Link
                href={siteUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[18px] font-semibold leading-snug text-kanon-primary"
                data-kanon-font="sans"
                style={{
                  fontFamily: sansFontFamily,
                  fontWeight: 600,
                  color: "#d4d4d8",
                  textDecoration: "underline",
                  textUnderlineOffset: "4px",
                }}
              >
                {ctaLabel}
              </Link>
            </Section>

            <Hr
              className="mx-0 my-14 w-full border-0 border-t border-solid border-kanon-stroke"
              style={{ borderTop: "1px solid #3f3f46" }}
            />

            <Text
              className="m-0 text-[13px] leading-relaxed text-kanon-quiet"
              data-kanon-font="sans"
              style={{ fontFamily: sansFontFamily }}
            >
              {footer}
            </Text>
          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
};

SiteLiveEmail.PreviewProps = {
  siteUrl: "https://example.com",
} satisfies SiteLiveEmailProps;

export default SiteLiveEmail;
