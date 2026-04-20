"use client";

import Link from "next/link";
import ViewportScrollFades from "@/components/ViewportScrollFades";

export default function ColophonPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <ViewportScrollFades top bottom={false} />

      <main className="mx-auto w-full max-w-4xl px-6 pb-24">
        <div className="sticky top-0 z-30 bg-black py-5">
          <h1 className="mx-auto w-full max-w-3xl text-center font-lector text-2xl tracking-tight text-white/90">
            Kanon
          </h1>
        </div>

        <div className="grid min-h-[calc(100dvh-5rem)] w-full grid-cols-1 grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <div className="min-h-0" aria-hidden />
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
            <section className="w-full space-y-8">
              <p className="whitespace-pre-line font-lector text-sm leading-relaxed text-zinc-400">
                {
                  "A social network, library, installation, book, and practice.\nIn partial fulfillment of the requirements for the degree of Bachelor of Arts in Computing and the Arts at Yale University.\nWork of Kristopher Aziabor."
                }
              </p>
              <p className="text-sm leading-6 text-zinc-400">
                Social media platforms optimize for viral reach and algorithmic engagement, minimizing
                the possibility of intimate knowledge-sharing within close communities. Influential apps
                like Instagram and TikTok strip content of personal context and make any act of
                communication or sharing a performance that can be tracked and compared through likes,
                views, and followers.
                <br />
                <br />
                Kanon proposes an alternative. I seek to create a platform that enables small,
                isolated communities to build collective knowledge archives through manual curation of
                media and text. In addition, every element is connected to an audio recording from the
                user, pushing oral traditions to the center of the experience. The system inverts
                contemporary social media design through three principles:
                <br />
                <br />
                <strong>(1) distinct communities</strong> (groups exist independently and communities
                are not connected),
                <br />
                <strong>(2) oral traditions</strong> (every item includes a personal
                narrative recording about why it matters), and{" "}
                <br />
                <strong>(3) human curation</strong> (connections come from conversation, not algorithms).
              </p>
            </section>

            <div className="w-full">
              <Link
                href="/"
                className="inline-block font-lector text-sm tracking-tight text-white/90 transition-colors hover:text-white"
              >
                Re-enter Kanon
              </Link>
            </div>
          </div>
          <div className="min-h-0" aria-hidden />
        </div>
      </main>
    </div>
  );
}