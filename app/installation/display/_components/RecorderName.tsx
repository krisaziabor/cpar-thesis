"use client";

import { useEffect, useRef, useState } from "react";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { RECORDER_PULSE_PERIOD_MS } from "@/lib/installation/playback";

interface Props {
  name: string;
}

function firstNameFallback(nameOrEmail: string): string {
  if (nameOrEmail.includes("@")) {
    const local = nameOrEmail.split("@")[0];
    const first = local.split(/[._-]/)[0];
    return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  }
  return nameOrEmail.split(/\s+/)[0];
}

/** Curator name that pulses in opacity at RECORDER_PULSE_PERIOD_MS during testimony. */
export function RecorderName({ name }: Props) {
  const [displayName, setDisplayName] = useState(firstNameFallback(name));
  const ref = useRef<HTMLSpanElement>(null);
  const rafRef = useRef(0);
  const startRef = useRef(performance.now());

  // Resolve actual first name from Firestore users collection
  useEffect(() => {
    if (!db) return;
    let cancelled = false;

    async function resolve() {
      if (!db) return;
      try {
        if (name.includes("@")) {
          const snap = await getDocs(
            query(collection(db, "users"), where("email", "==", name)),
          );
          if (!cancelled && !snap.empty) {
            const userData = snap.docs[0].data();
            if (userData.name) {
              setDisplayName(userData.name.split(/\s+/)[0]);
            }
          }
        } else {
          // Treat as document ID
          const snap = await getDoc(doc(db, "users", name));
          if (!cancelled && snap.exists()) {
            const userData = snap.data();
            if (userData.name) {
              setDisplayName(userData.name.split(/\s+/)[0]);
            }
          }
        }
      } catch {
        // Keep fallback
      }
    }

    void resolve();
    return () => { cancelled = true; };
  }, [name]);

  useEffect(() => {
    startRef.current = performance.now();
    const period = RECORDER_PULSE_PERIOD_MS;

    function tick() {
      const el = ref.current;
      if (!el) return;
      const elapsed = performance.now() - startRef.current;
      // Smooth sine oscillation between 0.4 and 1.0
      const t = (elapsed % period) / period;
      const opacity = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t - Math.PI / 2));
      el.style.opacity = String(opacity.toFixed(3));
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [name]);

  return (
    <span
      ref={ref}
      style={{ fontFamily: '"Lector", serif', opacity: 0.4 }}
      className="text-xs text-zinc-500 tracking-wide"
    >
      {displayName}
    </span>
  );
}
