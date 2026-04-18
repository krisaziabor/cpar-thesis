"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import SyncedTranscript from "@/components/SyncedTranscript";
import type { TimedWord } from "@/lib/types";

/* ── Expected onboarding audio slots ─────────────────────────────────────── */

const SLOTS = [
  { name: "profile-setup",  label: "Profile Setup",       description: "Welcome to Kanon. Enter your name." },
  { name: "media-opt-in",   label: "Media Opt-in",        description: "Consent to include media in installation." },
  { name: "book-text",      label: "Book Text",           description: "Submit a written piece for the book." },
  { name: "contact",        label: "Contact",             description: "How would you like to be contacted?" },
  { name: "color-consumed", label: "Color: Consumed",     description: "Something you\u2019ve consumed. Pick a color." },
  { name: "color-made",     label: "Color: Made",         description: "Something you\u2019ve made. Pick a color." },
  { name: "color-changed",  label: "Color: Changed",      description: "Something that changed how you think. Pick a color." },
  { name: "avatar-reveal",  label: "Avatar Reveal",       description: "Plays during gradient + icon reveal." },
] as const;

type SlotStatus = "empty" | "transcribing" | "ready" | "error";

interface SlotState {
  status: SlotStatus;
  words: TimedWord[] | null;
  audioUrl: string | null;       // blob URL for preview playback
  savedAudioUrl: string | null;  // public path once saved
  error: string | null;
  wordCount: number;
}

function emptySlot(): SlotState {
  return { status: "empty", words: null, audioUrl: null, savedAudioUrl: null, error: null, wordCount: 0 };
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function TranscriptLabPage() {
  const [slots, setSlots] = useState<Record<string, SlotState>>(() => {
    const init: Record<string, SlotState> = {};
    for (const s of SLOTS) init[s.name] = emptySlot();
    return init;
  });
  const [previewSlot, setPreviewSlot] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  /* Check which slots already have saved JSON + audio on mount */
  useEffect(() => {
    for (const slot of SLOTS) {
      fetch(`/onboarding/${slot.name}.json`)
        .then((r) => (r.ok ? r.json() : null))
        .then(async (json) => {
          if (!json?.words || !json.audio_url) return;

          // Fetch the audio file as a blob so we get a reliable playback URL
          // (Turbopack may not serve files added to public/ after dev server start)
          let blobUrl: string | null = null;
          try {
            const audioRes = await fetch(json.audio_url);
            if (audioRes.ok) {
              const blob = await audioRes.blob();
              blobUrl = URL.createObjectURL(blob);
            }
          } catch {}

          setSlots((prev) => ({
            ...prev,
            [slot.name]: {
              status: "ready",
              words: json.words,
              audioUrl: blobUrl ?? json.audio_url,
              savedAudioUrl: json.audio_url,
              error: blobUrl ? null : "Audio file not served — restart dev server to pick it up",
              wordCount: json.words.length,
            },
          }));
        })
        .catch(() => {});
    }
  }, []);

  /* ── Process a dropped/selected file for a slot ────────────────────────── */

  const processFile = useCallback(async (slotName: string, file: File) => {
    setSlots((prev) => ({
      ...prev,
      [slotName]: { ...emptySlot(), status: "transcribing", audioUrl: URL.createObjectURL(file) },
    }));

    try {
      // Step 1: Transcribe
      const transcribeForm = new FormData();
      transcribeForm.append("file", file);

      const transcribeRes = await fetch("/api/transcribe-words", {
        method: "POST",
        body: transcribeForm,
      });

      if (!transcribeRes.ok) {
        const err = await transcribeRes.json().catch(() => ({ error: "Unknown" }));
        throw new Error((err as { error?: string }).error || `HTTP ${transcribeRes.status}`);
      }

      const { words } = (await transcribeRes.json()) as { words: TimedWord[] };

      // Step 2: Save audio + JSON to public/onboarding/
      const transcript = { audio_url: `/onboarding/${slotName}.${file.name.split(".").pop() || "m4a"}`, words };
      const saveForm = new FormData();
      saveForm.append("file", file);
      saveForm.append("name", slotName);
      saveForm.append("transcript", JSON.stringify(transcript));

      const saveRes = await fetch("/api/save-onboarding-audio", {
        method: "POST",
        body: saveForm,
      });

      if (!saveRes.ok) {
        const err = await saveRes.json().catch(() => ({ error: "Unknown" }));
        throw new Error((err as { error?: string }).error || `Save failed: ${saveRes.status}`);
      }

      const saved = (await saveRes.json()) as { audioPath: string; wordCount: number };

      setSlots((prev) => ({
        ...prev,
        [slotName]: {
          status: "ready",
          words,
          audioUrl: URL.createObjectURL(file),
          savedAudioUrl: saved.audioPath,
          error: null,
          wordCount: saved.wordCount,
        },
      }));
    } catch (e) {
      setSlots((prev) => ({
        ...prev,
        [slotName]: {
          ...prev[slotName],
          status: "error",
          error: e instanceof Error ? e.message : "Failed",
        },
      }));
    }
  }, []);

  /* ── Counts ────────────────────────────────────────────────────────────── */

  const readyCount = Object.values(slots).filter((s) => s.status === "ready").length;
  const totalCount = SLOTS.length;
  const preview = previewSlot ? slots[previewSlot] : null;

  return (
    <div className="min-h-screen bg-black p-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="font-lector text-xl tracking-tight text-zinc-200">
            Onboarding Audio
          </h1>
          <p className="mt-1 font-sans text-xs text-zinc-500">
            Drop audio files onto each slot. They&apos;ll be transcribed, saved to{" "}
            <code className="text-zinc-400">public/onboarding/</code>, and available for preview.
          </p>
          <p className="mt-2 font-sans text-xs text-zinc-600">
            {readyCount}/{totalCount} ready
          </p>
        </div>

        {/* ── Slot grid ──────────────────────────────────────────────────── */}
        <div className="grid gap-3">
          {SLOTS.map((slot) => {
            const state = slots[slot.name];
            const isTranscribing = state.status === "transcribing";
            const isReady = state.status === "ready";
            const isError = state.status === "error";
            const isPreviewing = previewSlot === slot.name;

            return (
              <div key={slot.name} className="space-y-2">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.add("border-zinc-500");
                  }}
                  onDragLeave={(e) => {
                    e.currentTarget.classList.remove("border-zinc-500");
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove("border-zinc-500");
                    const file = e.dataTransfer.files[0];
                    if (file) void processFile(slot.name, file);
                  }}
                  onClick={() => fileRefs.current[slot.name]?.click()}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
                    isReady
                      ? "border-zinc-700 bg-zinc-950"
                      : isError
                        ? "border-red-900/50 bg-zinc-950"
                        : "border-dashed border-zinc-800 hover:border-zinc-600"
                  }`}
                >
                  <input
                    ref={(el) => { fileRefs.current[slot.name] = el; }}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void processFile(slot.name, f);
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        isReady ? "bg-emerald-500" : isTranscribing ? "bg-amber-500 animate-pulse" : isError ? "bg-red-500" : "bg-zinc-700"
                      }`} />
                      <p className="font-sans text-xs text-zinc-200">{slot.label}</p>
                      <code className="font-mono text-[10px] text-zinc-600">{slot.name}</code>
                    </div>
                    <p className="mt-0.5 font-sans text-[11px] text-zinc-500">
                      {isTranscribing
                        ? "Transcribing..."
                        : isReady
                          ? `${state.wordCount} words`
                          : isError
                            ? state.error
                            : slot.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {isReady && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewSlot(isPreviewing ? null : slot.name);
                        }}
                        className={`font-sans text-[11px] transition-colors ${
                          isPreviewing ? "text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        {isPreviewing ? "Hide" : "Preview"}
                      </button>
                    )}
                    {isReady && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fileRefs.current[slot.name]?.click();
                        }}
                        className="font-sans text-[11px] text-zinc-600 transition-colors hover:text-zinc-300"
                      >
                        Replace
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Inline preview ─────────────────────────────────────── */}
                {isPreviewing && preview?.words && preview.audioUrl && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <SyncedTranscript
                      key={slot.name + preview.audioUrl}
                      audioUrl={preview.audioUrl}
                      words={preview.words}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Summary when all ready ─────────────────────────────────────── */}
        {readyCount === totalCount && (
          <div className="rounded-lg border border-emerald-900/40 bg-emerald-950/20 px-4 py-3">
            <p className="font-sans text-xs text-emerald-400">
              All {totalCount} onboarding audio files are transcribed and saved. The onboarding flow will use them automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
