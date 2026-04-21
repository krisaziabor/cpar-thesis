import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getKanonPublicUrl } from "@/lib/kanon-public-url";
import { siteLiveAnnouncement } from "@/lib/site-live-announcement";

export const metadata: Metadata = {
  title: siteLiveAnnouncement.headline,
  description: siteLiveAnnouncement.previewText,
};

export default function HomePage() {
  const kanonUrl = getKanonPublicUrl();

  return (
    <div className="min-h-dvh bg-black font-sans text-zinc-300 antialiased">
      <main className="mx-auto max-w-[480px] px-8 pb-28 pt-24">
        <Image
          src="/KAKA-email-logo.png"
          alt="Kanon"
          width={56}
          height={56}
          className="block"
          priority
        />

        <h1 className="mt-10 font-lector text-[28px] font-normal leading-[1.15] tracking-tight text-white/90">
          {siteLiveAnnouncement.headline}
        </h1>

        <div className="mt-6 flex flex-col gap-6">
          {siteLiveAnnouncement.paragraphs.map((text) => (
            <p key={text} className="m-0 text-[15px] leading-[1.55] text-zinc-300">
              {text}
            </p>
          ))}
          <div className="flex flex-col">
            {siteLiveAnnouncement.signoffLines.map((line) => (
              <p key={line} className="m-0 text-[15px] leading-[1.55] text-zinc-300">
                {line}
              </p>
            ))}
          </div>
        </div>

        <p className="m-0 mt-10 text-[15px] leading-[1.55] text-zinc-300">
          <Link
            href={kanonUrl}
            className="text-inherit underline decoration-zinc-600 underline-offset-[5px] transition-[color,text-decoration-color] hover:text-zinc-200 hover:decoration-zinc-500"
          >
            {siteLiveAnnouncement.ctaLabel}
          </Link>
        </p>

        <hr className="mx-0 mt-14 mb-0 w-full border-0 border-t border-solid border-zinc-700" />

        <p className="m-0 mt-3 text-[13px] leading-relaxed text-zinc-500">
          {siteLiveAnnouncement.footer}
        </p>
      </main>
    </div>
  );
}
