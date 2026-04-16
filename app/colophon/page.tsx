"use client";

import Link from "next/link";

export default function ColophonPage() {
  return (
    <div className="min-h-screen bg-black text-zinc-200">
      <div className="fixed left-0 right-0 top-6 z-20 flex flex-col items-center">
        <h1 className="font-lector text-2xl tracking-tight text-white/90">Kanon</h1>
      </div>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 pb-20 pt-8">
        <section className="space-y-3">
          <p className="max-w-3xl text-sm leading-6 text-zinc-400">
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

        <section className="space-y-3">
        <h2 className="text-md font-lector">Typography</h2>
        <p className="text-sm leading-6 text-zinc-400">
          Lector by Forgotten Shapes, Die Grotesk by Klim Font Foundry
        </p>
        </section>

        
        <div className="pt-4">
          <Link
            href="/"
            className="font-lector text-sm tracking-tight text-white/90 transition-colors hover:text-white"
          >
            Back to gallery
          </Link>
        </div>
      </main>
    </div>
  );
}
