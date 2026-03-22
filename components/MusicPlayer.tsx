"use client";

import { useRef, useState, useEffect } from "react";
import type { MusicPlatform } from "@/lib/types";

const PLATFORM_LABELS: Record<MusicPlatform, string> = {
  youtube: "YouTube",
  spotify: "Spotify",
  apple_music: "Apple Music",
  soundcloud: "SoundCloud",
  tidal: "Tidal",
  amazon_music: "Amazon Music",
  deezer: "Deezer",
};

interface Props {
  title: string;
  creator: string;
  previewUrl?: string;
  platformLinks?: Record<string, string>;
  songLinkUrl?: string;
  preferredPlatform?: MusicPlatform;
}

export default function MusicPlayer({
  title,
  creator,
  previewUrl,
  platformLinks = {},
  songLinkUrl,
  preferredPlatform = "youtube",
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);

  // Resolve stream URL and track which platform it actually came from
  function resolveStream(): { url: string; label: string } | null {
    if (platformLinks[preferredPlatform]) {
      return { url: platformLinks[preferredPlatform], label: PLATFORM_LABELS[preferredPlatform] ?? preferredPlatform };
    }
    if (platformLinks.youtube) {
      return { url: platformLinks.youtube, label: PLATFORM_LABELS.youtube };
    }
    if (platformLinks.spotify) {
      return { url: platformLinks.spotify, label: PLATFORM_LABELS.spotify };
    }
    const first = Object.entries(platformLinks)[0] as [string, string] | undefined;
    if (first) {
      return { url: first[1], label: PLATFORM_LABELS[first[0] as MusicPlatform] ?? first[0] };
    }
    if (songLinkUrl) {
      return { url: songLinkUrl, label: "song.link" };
    }
    return null;
  }

  const stream = resolveStream();

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    function onTimeUpdate() { setCurrentTime(audio!.currentTime); }
    function onLoadedMetadata() { setDuration(audio!.duration); }
    function onEnded() { setPlaying(false); setCurrentTime(0); }

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("ended", onEnded);
    };
  }, []);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-zinc-900">{title}</p>
        <p className="font-mono text-xs text-zinc-500">{creator}</p>
      </div>

      {previewUrl && (
        <>
          <audio ref={audioRef} src={previewUrl} preload="metadata" />
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="w-4 shrink-0 font-mono text-xs text-zinc-900"
              aria-label={playing ? "pause" : "play"}
            >
              {playing ? "■" : "▶"}
            </button>
            <div className="flex flex-1 flex-col gap-1">
              <div className="relative h-px bg-zinc-200">
                <div
                  className="absolute left-0 top-0 h-px bg-zinc-900 transition-all"
                  style={{ width: `${progress * 100}%` }}
                />
              </div>
              <div className="flex justify-between">
                <span className="font-mono text-[10px] text-zinc-400">
                  {formatTime(currentTime)}
                </span>
                <span className="font-mono text-[10px] text-zinc-400">
                  30s preview
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {stream && (
        <a
          href={stream.url}
          target="_blank"
          rel="noopener noreferrer"
          className="w-fit font-mono text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
        >
          listen on {stream.label} ↗
        </a>
      )}

      {!previewUrl && !stream && (
        <p className="font-mono text-xs text-zinc-400">no preview available</p>
      )}
    </div>
  );
}
