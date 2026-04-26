"use client";

import { useRef, useState } from "react";

type Props = {
  accept: string;
  maxBytes: number;
  label: string;
  hint?: string;
  disabled?: boolean;
  onFile: (file: File) => void;
  onError: (msg: string) => void;
};

function formatBytes(b: number) {
  return b >= 1024 * 1024 * 1024
    ? `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${(b / 1024 / 1024).toFixed(0)} MB`;
}

function mimeFromAccept(accept: string): Set<string> {
  return new Set(accept.split(",").map((s) => s.trim()).filter((s) => !s.startsWith(".")));
}

export function DropZone({ accept, maxBytes, label, hint, disabled, onFile, onError }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function validate(file: File): string | null {
    const allowed = mimeFromAccept(accept);
    if (allowed.size > 0 && !allowed.has(file.type)) {
      const exts = accept
        .split(",")
        .filter((s) => s.trim().startsWith("."))
        .join(", ");
      return `File type not accepted. Allowed: ${exts || accept}.`;
    }
    if (file.size > maxBytes) {
      return `File too large. Maximum size is ${formatBytes(maxBytes)}.`;
    }
    return null;
  }

  function handleFile(file: File) {
    const err = validate(file);
    if (err) { onError(err); return; }
    onFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={[
        "w-full rounded-lg border border-dashed px-4 py-8 text-center transition-colors",
        dragging
          ? "border-white/40 bg-white/5"
          : "border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900",
        disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer",
      ].join(" ")}
    >
      <p className="text-sm text-zinc-300">{label}</p>
      {hint && <p className="mt-1 text-xs text-zinc-600">{hint}</p>}
      <p className="mt-1 text-xs text-zinc-600">
        Drop here or click to browse · max {formatBytes(maxBytes)}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
    </button>
  );
}
