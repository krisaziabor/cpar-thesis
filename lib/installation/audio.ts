/**
 * lib/installation/audio.ts
 *
 * Web Audio API setup for the three-panel installation.
 *
 * Topology per panel:
 *   MediaElementAudioSourceNode → StereoPannerNode → GainNode → masterGain → destination
 *
 * Panels: left pan=-1, center pan=0, right pan=+1.
 * Ducking: when any panel is in testimony, the others drop to DUCK_VOLUME.
 */

import { DUCK_VOLUME, DUCK_TRANSITION_MS, panToForIndex } from "./playback";

export interface InstallationAudio {
  ctx: AudioContext;
  panners: [StereoPannerNode, StereoPannerNode, StereoPannerNode];
  gainNodes: [GainNode, GainNode, GainNode];
  masterGain: GainNode;
}

let audioInstance: InstallationAudio | null = null;
const connectedElements = new WeakMap<HTMLMediaElement, AudioNode>();

export function initAudio(): InstallationAudio {
  if (audioInstance) return audioInstance;

  const ctx = new AudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(ctx.destination);

  const panners = [0, 1, 2].map((i) => {
    const panner = ctx.createStereoPanner();
    panner.pan.value = panToForIndex(i as 0 | 1 | 2);
    return panner;
  }) as [StereoPannerNode, StereoPannerNode, StereoPannerNode];

  const gainNodes = [0, 1, 2].map(() => {
    const gain = ctx.createGain();
    gain.gain.value = 1;
    return gain;
  }) as [GainNode, GainNode, GainNode];

  // Wire: panner → gain → master
  for (let i = 0; i < 3; i++) {
    panners[i].connect(gainNodes[i]);
    gainNodes[i].connect(masterGain);
  }

  audioInstance = { ctx, panners, gainNodes, masterGain };
  return audioInstance;
}

export function disposeAudio(): void {
  if (audioInstance) {
    audioInstance.ctx.close().catch(() => {});
    audioInstance = null;
  }
}

/**
 * Connect a media element to the panel's audio chain.
 * Safe to call multiple times — re-uses existing source node.
 */
export function connectElement(
  audio: InstallationAudio,
  el: HTMLMediaElement,
  panelIndex: 0 | 1 | 2,
): void {
  if (connectedElements.has(el)) return;
  try {
    const source = audio.ctx.createMediaElementSource(el);
    source.connect(audio.panners[panelIndex]);
    connectedElements.set(el, source);
  } catch {
    // createMediaElementSource can throw if already connected elsewhere
  }
}

/**
 * Update ducking. `testimonyPanelIndex` is the panel currently in testimony
 * (or null if none). Other panels are ducked; testimony panel is at full volume.
 */
export function setDucking(
  audio: InstallationAudio,
  testimonyPanelIndex: number | null,
): void {
  const now = audio.ctx.currentTime;
  const rampEnd = now + DUCK_TRANSITION_MS / 1000;
  for (let i = 0; i < 3; i++) {
    const target =
      testimonyPanelIndex === null || i === testimonyPanelIndex ? 1.0 : DUCK_VOLUME;
    audio.gainNodes[i].gain.cancelScheduledValues(now);
    audio.gainNodes[i].gain.linearRampToValueAtTime(target, rampEnd);
  }
}

/** Resume AudioContext after user gesture. Returns true if running. */
export async function resumeAudio(audio: InstallationAudio): Promise<boolean> {
  if (audio.ctx.state === "suspended") {
    await audio.ctx.resume();
  }
  return audio.ctx.state === "running";
}
