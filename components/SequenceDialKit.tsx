"use client";

import { useEffect } from "react";
import { useDialKit } from "dialkit";
import {
  DEFAULT_SEQUENCE_TIMINGS,
  setSequenceTimings,
  triggerSequenceReplay,
  type SequenceTimings,
} from "@/lib/sequence-dialkit";

export default function SequenceDialKit() {
  const params = useDialKit("Launch Sequence", {
    restartIntro: { type: "action", label: "Restart intro" },
    topLeft: {
      fadeInMs: [DEFAULT_SEQUENCE_TIMINGS.topLeftFadeInMs, 0, 600],
      holdMs: [DEFAULT_SEQUENCE_TIMINGS.topLeftHoldMs, 0, 2500],
      fadeOutMs: [DEFAULT_SEQUENCE_TIMINGS.topLeftFadeOutMs, 0, 600],
    },
    bottom: {
      startMs: [DEFAULT_SEQUENCE_TIMINGS.bottomStartMs, 0, 3000],
      enterMs: [DEFAULT_SEQUENCE_TIMINGS.bottomEnterMs, 0, 600],
      stagger: {
        navDelayMs: [DEFAULT_SEQUENCE_TIMINGS.navDelayMs, 0, 1000],
        utilityDelayMs: [DEFAULT_SEQUENCE_TIMINGS.utilityDelayMs, 0, 1000],
        checklistDelayMs: [DEFAULT_SEQUENCE_TIMINGS.checklistDelayMs, 0, 1200],
      },
    },
  }, {
    onAction: (action) => {
      if (action === "restartIntro") {
        triggerSequenceReplay();
      }
    },
  }) as {
    restartIntro: unknown;
    topLeft: { fadeInMs: number; holdMs: number; fadeOutMs: number };
    bottom: {
      startMs: number;
      enterMs: number;
      stagger: { navDelayMs: number; utilityDelayMs: number; checklistDelayMs: number };
    };
  };

  useEffect(() => {
    const next: SequenceTimings = {
      topLeftFadeInMs: params.topLeft.fadeInMs,
      topLeftHoldMs: params.topLeft.holdMs,
      topLeftFadeOutMs: params.topLeft.fadeOutMs,
      bottomStartMs: params.bottom.startMs,
      navDelayMs: params.bottom.stagger.navDelayMs,
      utilityDelayMs: params.bottom.stagger.utilityDelayMs,
      checklistDelayMs: params.bottom.stagger.checklistDelayMs,
      bottomEnterMs: params.bottom.enterMs,
    };
    setSequenceTimings(next);
  }, [params]);

  return null;
}
