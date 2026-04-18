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

export interface SignInLinkEmailProps {
  /** Firebase magic link (or any sign-in URL you generate). */
  signInUrl: string;
  recipientEmail: string;
  /** When true, copy matches the “Create your account” path on `/login`. */
  isNewUser?: boolean;
  assetOrigin?: string;
}

export const SignInLinkEmail = ({
  signInUrl,
  recipientEmail,
  isNewUser = false,
  assetOrigin,
}: SignInLinkEmailProps) => {
  const previewText = isNewUser ? "Confirm your email — Kanon" : "Your sign-in link — Kanon";
  const headline = isNewUser ? "Confirm your email" : "Your sign-in link is ready";
  const ctaLabel = isNewUser ? "Continue to Kanon" : "Open Kanon";

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
              <Text
                className="m-0 text-[15px] leading-[1.55] text-kanon-primary"
                data-kanon-font="sans"
                style={{ fontFamily: sansFontFamily }}
              >
                We need to confirm{" "}
                <Link
                  href={`mailto:${recipientEmail}`}
                  className="text-[15px] text-kanon-primary"
                  data-kanon-font="sans"
                  style={{
                    fontFamily: sansFontFamily,
                    color: "#d4d4d8",
                  }}
                >
                  {recipientEmail}
                </Link>{" "}
                before you can access your account.
              </Text>
              <Text
                className="m-0 mt-5 text-[15px] leading-[1.55] text-kanon-primary"
                data-kanon-font="sans"
                style={{ fontFamily: sansFontFamily }}
              >
                Use the link below in the browser window where you started—this keeps your sign-in
                secure.
              </Text>
            </Section>

            <Section className="mt-12">
              <Link
                href={signInUrl}
                target="_self"
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
              This link expires after a short time. If it no longer works, request a new one from the
              login page.
            </Text>
            <Text
              className="m-0 mt-4 text-[13px] leading-relaxed text-kanon-quiet"
              data-kanon-font="sans"
              style={{ fontFamily: sansFontFamily }}
            >
              If you didn&apos;t sign in to Kanon, you can safely ignore this email. Someone else may
              have entered your address by mistake.
            </Text>

          </Container>
        </Body>
      </Html>
    </Tailwind>
  );
};

SignInLinkEmail.PreviewProps = {
  signInUrl: "https://example.com/login?apiKey=xxx&oobCode=xxx&mode=signIn&lang=en",
  recipientEmail: "you@example.com",
  isNewUser: false,
} satisfies SignInLinkEmailProps;

export default SignInLinkEmail;
