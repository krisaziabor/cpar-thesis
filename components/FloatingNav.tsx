"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { submitFeedback } from "@/lib/feedback";

type FeedbackStatus = "idle" | "submitting" | "success" | "error";

export default function FloatingNav() {
  const { user, role, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<FeedbackStatus>("idle");
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const feedbackCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const panel = searchParams.get("panel");
  const connectPanelOpen = searchParams.get("connectPanel") === "1";
  const selectedConnectIds = (searchParams.get("connectIds") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  const isConnectSelecting = pathname === "/" && panel === "connect";

  const isAddActive = pathname === "/" && panel === "add";
  const isConnectActive = isConnectSelecting || pathname === "/connect";
  const isActivityActive = pathname === "/" && panel === "activity";
  const drawerTransition = { duration: 0.22, ease: [0.215, 0.61, 0.355, 1] as const };
  const feedbackMeta = (() => {
    switch (feedbackStatus) {
      case "success":
        return { key: "success", className: "text-emerald-400", message: "Thanks — feedback sent." };
      case "error":
        return { key: "error", className: "text-red-400", message: feedbackError ?? "Could not send feedback." };
      default:
        return { key: "idle", className: "text-zinc-500", message: "Your notes are shared with the team." };
    }
  })();

  if (!user || pathname === "/login") return null;

  function clearFeedbackCloseTimer() {
    if (!feedbackCloseTimerRef.current) return;
    clearTimeout(feedbackCloseTimerRef.current);
    feedbackCloseTimerRef.current = null;
  }

  function closeFeedbackPanel() {
    clearFeedbackCloseTimer();
    setFeedbackOpen(false);
    setFeedbackStatus("idle");
    setFeedbackError(null);
  }

  function scheduleFeedbackClose() {
    clearFeedbackCloseTimer();
    feedbackCloseTimerRef.current = setTimeout(() => {
      setFeedbackOpen(false);
      setFeedbackStatus("idle");
    }, 1100);
  }

  useEffect(() => {
    return () => {
      if (!feedbackCloseTimerRef.current) return;
      clearTimeout(feedbackCloseTimerRef.current);
    };
  }, []);

  function openFeedbackPanel() {
    clearFeedbackCloseTimer();
    setExpanded(false);
    setFeedbackOpen(true);
    setFeedbackStatus("idle");
    setFeedbackError(null);
  }

  function handleTabPress(isActive: boolean, href: string) {
    setExpanded(false);
    setFeedbackOpen(false);
    router.push(isActive ? "/" : href);
  }

  function handleConnectCancel() {
    setExpanded(false);
    setFeedbackOpen(false);
    router.push("/");
  }

  function handleConnectConfirm() {
    if (selectedConnectIds.length < 2) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("panel", "connect");
    params.set("connectPanel", "1");
    setFeedbackOpen(false);
    router.push(`/?${params.toString()}`);
  }

  async function handleFeedbackSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const message = feedbackText.trim();
    if (!message) {
      setFeedbackStatus("error");
      setFeedbackError("Please enter feedback before sending.");
      return;
    }

    setFeedbackStatus("submitting");
    setFeedbackError(null);

    try {
      await submitFeedback(user, message);
      setFeedbackText("");
      setFeedbackStatus("success");
      scheduleFeedbackClose();
    } catch {
      setFeedbackStatus("error");
      setFeedbackError("Could not send feedback. Please try again.");
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">

        {/* Expandable drawer — slides open above base row */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key="drawer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={drawerTransition}
              className="overflow-hidden"
            >
              <div className="flex flex-col border-b border-zinc-800 font-lector">
                {/* Kanon — top, full width */}
                <Link
                  href="/"
                  onClick={() => setExpanded(false)}
                  className="px-5 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                >
                  Kanon
                </Link>

                <button
                  onClick={openFeedbackPanel}
                  className="border-t border-zinc-800 px-5 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                >
                  Feedback
                </button>

                {/* Holding + Sign out — share a row */}
                <div className="flex divide-x divide-zinc-800 border-t border-zinc-800">
                  <Link
                    href="/kanon"
                    onClick={() => setExpanded(false)}
                    className="flex-1 px-4 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    Holding
                  </Link>
                  <button
                    onClick={() => { setExpanded(false); void signOut(); }}
                    className="flex-1 px-4 py-2.5 text-center text-xs text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    Sign out
                  </button>
                </div>

                {/* Admin row — only for admins */}
                {role === "admin" && (
                  <Link
                    href="/admin"
                    onClick={() => setExpanded(false)}
                    className="border-t border-zinc-800 px-5 py-2.5 text-center text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-50"
                  >
                    Admin
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {feedbackOpen && (
            <motion.div
              key="feedback-form"
              initial={{ height: 0, opacity: 0, y: 8 }}
              animate={{ height: "auto", opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: 8 }}
              transition={drawerTransition}
              className="overflow-hidden border-b border-zinc-800"
            >
              <motion.form
                layout
                onSubmit={handleFeedbackSubmit}
                className="flex flex-col gap-3 px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs tracking-[0.08em] text-zinc-400">FEEDBACK</p>
                  <button
                    type="button"
                    onClick={closeFeedbackPanel}
                    disabled={feedbackStatus === "submitting"}
                    className="text-xs text-zinc-500 transition-colors hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Close
                  </button>
                </div>

                <textarea
                  value={feedbackText}
                  onChange={(event) => {
                    setFeedbackText(event.target.value);
                    if (feedbackStatus !== "submitting") {
                      setFeedbackStatus("idle");
                      setFeedbackError(null);
                    }
                  }}
                  disabled={feedbackStatus === "submitting"}
                  rows={4}
                  maxLength={2000}
                  placeholder="What should we improve?"
                  className="w-full resize-none rounded border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-zinc-500 disabled:opacity-60"
                />

                <div className="flex items-center justify-between gap-3">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p
                      key={feedbackMeta.key}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.16 }}
                      className={`text-xs ${feedbackMeta.className}`}
                    >
                      {feedbackMeta.message}
                    </motion.p>
                  </AnimatePresence>

                  <motion.button
                    layout
                    type="submit"
                    disabled={feedbackStatus === "submitting" || !feedbackText.trim()}
                    className="min-w-16 rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-200 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={feedbackStatus === "submitting" ? "submitting" : "send"}
                        initial={{ opacity: 0, y: 3 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -3 }}
                        transition={{ duration: 0.14 }}
                        className="inline-block"
                      >
                        {feedbackStatus === "submitting" ? "Sending…" : "Send"}
                      </motion.span>
                    </AnimatePresence>
                  </motion.button>
                </div>
              </motion.form>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {isConnectSelecting && !connectPanelOpen && (
            <motion.div
              key="connect-instructions"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={drawerTransition}
              className="overflow-hidden border-b border-zinc-800"
            >
              <div className="flex flex-col gap-2 px-4 py-3">
                <p className="text-xs text-zinc-400">
                  Select thumbnails in the graph to connect them.
                </p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">
                    {selectedConnectIds.length} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleConnectCancel}
                      className="px-2 py-1 text-xs text-zinc-500 transition-colors hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConnectConfirm}
                      disabled={selectedConnectIds.length < 2}
                      className="rounded border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Base row — always visible */}
        <div className="flex items-stretch divide-x divide-zinc-800 font-lector">
          <button
            onClick={() => handleTabPress(isAddActive, "/?panel=add")}
            className={`px-4 py-2.5 text-xs transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
              isAddActive ? "font-medium text-zinc-300" : "text-zinc-400"
            }`}
          >
            Add
          </button>
          <button
            onClick={() => handleTabPress(isConnectActive, "/?panel=connect")}
            className={`px-4 py-2.5 text-xs transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
              isConnectActive ? "font-medium text-zinc-300" : "text-zinc-400"
            }`}
          >
            Connect
          </button>
          <button
            onClick={() => handleTabPress(isActivityActive, "/?panel=activity")}
            className={`px-4 py-2.5 text-xs transition-colors hover:bg-zinc-900 hover:text-zinc-50 ${
              isActivityActive ? "font-medium text-zinc-300" : "text-zinc-400"
            }`}
          >
            Activity
          </button>
          <button
            onClick={() => {
              setFeedbackOpen(false);
              setExpanded((e) => !e);
            }}
            aria-label={expanded ? "Collapse navigation" : "Expand navigation"}
            className="px-3 py-2.5 text-xs leading-none text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-zinc-200"
          >
            <motion.span
              animate={{ rotate: expanded ? 45 : 0 }}
              transition={{ duration: 0.18, ease: [0.215, 0.61, 0.355, 1] }}
              style={{ display: "inline-block" }}
            >
              {expanded ? "×" : "···"}
            </motion.span>
          </button>
        </div>
      </div>
    </div>
  );
}
