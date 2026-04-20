"use client";

import { useRef } from "react";
import ViewportScrollFades from "@/components/ViewportScrollFades";
import MakeItThickEssay from "@/components/MakeItThickEssay";
import EpigraphCornerNav from "@/components/EpigraphCornerNav";
import { ESSAY_BLOCKS } from "@/lib/make-it-thick/essay-blocks";
import { EPIGRAPH_MAIN_COLUMN } from "@/lib/make-it-thick/layout";

export default function EpigraphPage() {
  const headerRef = useRef<HTMLElement>(null);

  return (
    <div className="relative min-h-screen bg-black text-zinc-200">
      <ViewportScrollFades top bottom />

      <main className="relative z-0 w-full px-5 pb-[min(44vh,28rem)] pt-10 sm:px-6 md:px-8">
        <div className="flex w-full flex-col items-start gap-10">
          <header
            ref={headerRef}
            className={`${EPIGRAPH_MAIN_COLUMN} space-y-2`}
          >
            <h2 className="font-lector text-xl tracking-tight text-white/90 md:text-2xl">
              Make It Thick
            </h2>
            <p className="font-sans text-sm leading-6 text-zinc-500">
              An essay by Anthony Huberman
            </p>
          </header>

          <MakeItThickEssay blocks={ESSAY_BLOCKS} />
        </div>
      </main>

      <EpigraphCornerNav headerRef={headerRef} />
    </div>
  );
}
