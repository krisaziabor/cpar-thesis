"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AudioRecorder from "@/components/AudioRecorder";

interface ReRecordModalProps {
  open: boolean;
  title: string;
  onSave: (blob: Blob) => Promise<void>;
  onClose: () => void;
}

export default function ReRecordModal({
  open,
  title,
  onSave,
  onClose,
}: ReRecordModalProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (saving) return;
    setBlob(null);
    setError(null);
    onClose();
  }

  async function handleSave() {
    if (!blob) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(blob);
      setBlob(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save recording");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-center justify-center px-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <motion.div
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.215, 0.61, 0.355, 1] }}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <p className="font-lector text-sm tracking-tight text-white/90">
                Re-record {title}
              </p>
              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="font-sans text-xs text-white/45 transition-colors hover:text-white/80 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
            <div className="px-5 py-5">
              <AudioRecorder
                prompt="Record a new version. This replaces the played audio but keeps history."
                onRecorded={(b) => {
                  setBlob(b);
                  setError(null);
                }}
              />
              {error && (
                <p className="mt-3 font-sans text-xs text-red-400">{error}</p>
              )}
              <div className="mt-4 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!blob || saving}
                  className="inline-flex items-center rounded-full bg-zinc-100 px-4 py-1.5 font-sans text-xs text-zinc-900 transition-colors duration-150 ease-out hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save recording"}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
