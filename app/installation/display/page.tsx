"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  collection,
  onSnapshot,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Item, Connection, ConnectionItem } from "@/lib/types";
import { ShuffleBag } from "@/lib/installation/shuffleBag";
import { initAudio, disposeAudio, setDucking, resumeAudio } from "@/lib/installation/audio";
import type { InstallationAudio } from "@/lib/installation/audio";
import {
  makeInitialPanels,
  staggerDelay,
  MEDIA_FLASH_DURATION_MS,
  type PanelPhase,
  type PanelState,
  type SynergyState,
  type ConnectionData,
  type DebugEvent,
} from "@/lib/installation/playback";
import { useSuppressFloatingNavWhile } from "@/lib/floating-nav-suppress-context";
import { EntranceAnimation } from "@/components/EntranceAnimation/EntranceAnimation";
import { Panel } from "./_components/Panel";
import { SynergyDisplay } from "./_components/SynergyDisplay";
import { DebugOverlay } from "./_components/DebugOverlay";

// ── Constants ─────────────────────────────────────────────────────────────────

const BG = "#F5F5F2";
const PANEL_LABELS = ["left", "center", "right"] as const;

// Stable resting configs — must NOT be inline objects or they recreate on every
// render and restart EntranceAnimation's useEffect (which has `resting` as a dep).
const ENTRANCE_RESTING = { count: 1, sizeRange: [14, 14] } as const;
const MEDIA_FLASH_RESTING = { count: 0, sizeRange: [14, 14] } as const;

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InstallationDisplayPage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [items, setItems] = useState<Item[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [connectionItems, setConnectionItems] = useState<ConnectionItem[]>([]);
  const [dataReady, setDataReady] = useState(false);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [bootPhase, setBootPhase] = useState<"waiting" | "kanon" | "running">("waiting");
  const started = bootPhase === "running";
  const [showDebug, setShowDebug] = useState(false);
  const [masterTime, setMasterTime] = useState(0);

  // ── Panel + synergy state ─────────────────────────────────────────────────
  const [panels, setPanels] = useState<[PanelState, PanelState, PanelState]>(makeInitialPanels());
  const panelsRef = useRef<[PanelState, PanelState, PanelState]>(makeInitialPanels());
  const [synergy, setSynergy] = useState<SynergyState | null>(null);
  const synergyRef = useRef<SynergyState | null>(null);

  // ── Infra refs ────────────────────────────────────────────────────────────
  const bagRef = useRef<ShuffleBag | null>(null);
  const audioRef = useRef<InstallationAudio | null>(null);
  const startTimeRef = useRef<number>(0);
  const connectionAudioRef = useRef<HTMLAudioElement | null>(null);
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([]);
  const synergySentinelRef = useRef<boolean>(false); // prevents double-trigger

  // Always hide the floating nav on this page
  useSuppressFloatingNavWhile(true);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function log(message: string) {
    const ev: DebugEvent = { ts: Date.now(), message };
    setDebugEvents((prev) => [...prev.slice(-99), ev]);
  }

  function setPanel(index: number, updater: (p: PanelState) => PanelState) {
    panelsRef.current[index] = updater(panelsRef.current[index]);
    setPanels([...panelsRef.current] as [PanelState, PanelState, PanelState]);
  }

  function setSynergyState(s: SynergyState | null) {
    synergyRef.current = s;
    setSynergy(s);
  }

  // ── Data subscriptions ────────────────────────────────────────────────────

  useEffect(() => {
    if (!db) return;
    const unsubs: Unsubscribe[] = [];

    // Eligible items
    unsubs.push(
      onSnapshot(
        query(collection(db, "items"), where("installationEligible", "==", true)),
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Item));
          setItems(docs);
        },
        (err) => log(`Firestore items error: ${err.message}`),
      ),
    );

    // All connections
    unsubs.push(
      onSnapshot(
        query(collection(db, "connections"), where("is_hidden", "==", false)),
        (snap) => {
          setConnections(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Connection)));
        },
        (err) => log(`Firestore connections error: ${err.message}`),
      ),
    );

    // Junction table
    unsubs.push(
      onSnapshot(
        collection(db, "connection_items"),
        (snap) => {
          setConnectionItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ConnectionItem)));
        },
        (err) => log(`Firestore connection_items error: ${err.message}`),
      ),
    );

    return () => unsubs.forEach((u) => u());
  }, []);

  // Mark data ready once we have at least one item
  useEffect(() => {
    if (items.length > 0) setDataReady(true);
  }, [items]);

  // ── Build connection data ─────────────────────────────────────────────────

  const buildConnectionData = useCallback((): ConnectionData[] => {
    const eligibleIds = new Set(items.map((i) => i.id));

    // Group connection_items by connection_id
    const byConnection = new Map<string, string[]>();
    for (const ci of connectionItems) {
      if (!byConnection.has(ci.connection_id)) byConnection.set(ci.connection_id, []);
      byConnection.get(ci.connection_id)!.push(ci.item_id);
    }

    const result: ConnectionData[] = [];
    for (const conn of connections) {
      const itemIds = byConnection.get(conn.id) ?? [];
      // Only include connections where ALL items are installation-eligible
      if (itemIds.length >= 2 && itemIds.every((id) => eligibleIds.has(id))) {
        result.push({ connection: conn, itemIds });
      }
    }
    return result;
  }, [items, connections, connectionItems]);

  // ── Start / reset ─────────────────────────────────────────────────────────

  const assignRecord = useCallback(
    (panelIndex: 0 | 1 | 2) => {
      const bag = bagRef.current;
      if (!bag || bag.total === 0) return;

      const record = bag.consume();
      if (!record) return;

      // Check synergy opportunities
      const opportunities = bag.connectionOpportunities(record.id);
      if (opportunities.length > 0) {
        const chosen = opportunities[0];
        // Reserve connected records
        const otherIds = chosen.itemIds.filter((id) => id !== record.id);
        const others = bag.reserve(otherIds);
        const allSynergyRecords = [record, ...others];

        log(`Synergy detected: ${allSynergyRecords.map((r) => r.title).join(" + ")}`);

        setSynergyState({
          status: "waiting",
          records: allSynergyRecords,
          connectionData: chosen,
          nextRecordIdx: 0,
          completedCount: 0,
        });
        synergySentinelRef.current = false;

        // Panel that triggered synergy goes to synergyHolding
        setPanel(panelIndex, (p) => ({ ...p, phase: "synergyHolding", record: null, phaseKey: p.phaseKey + 1 }));
        return;
      }

      console.log(`[Kanon] Panel ${PANEL_LABELS[panelIndex]} → "${record.title}" (${record.id})`);
      log(`Panel ${PANEL_LABELS[panelIndex]} → "${record.title}"`);
      setPanel(panelIndex, (p) => ({
        phase: "entrance",
        record,
        phaseKey: p.phaseKey + 1,
      }));
    },
    [],
  );

  async function initializeAudio() {
    const audio = initAudio();
    await resumeAudio(audio);
    audioRef.current = audio;
    console.log("[Kanon] Tap received — starting boot animation");
    setBootPhase("kanon");
  }

  function startRecords() {
    const connectionData = buildConnectionData();
    bagRef.current = new ShuffleBag(items, connectionData);
    startTimeRef.current = Date.now();

    assignRecord(0);
    setTimeout(() => assignRecord(1), staggerDelay(1));
    setTimeout(() => assignRecord(2), staggerDelay(2));

    setBootPhase("running");
    log("Loop started");
    console.log("[Kanon] Loop started");
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "d" || e.key === "D") setShowDebug((v) => !v);
      if (e.key === "r" || e.key === "R") {
        log("Manual reset triggered");
        setSynergyState(null);
        synergySentinelRef.current = false;
        panelsRef.current = makeInitialPanels();
        setPanels(makeInitialPanels());
        // Re-assign after brief delay
        setTimeout(() => {
          assignRecord(0);
          setTimeout(() => assignRecord(1), staggerDelay(1));
          setTimeout(() => assignRecord(2), staggerDelay(2));
        }, 500);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assignRecord]);

  // ── Master clock (for debug display) ─────────────────────────────────────

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => {
      setMasterTime((Date.now() - startTimeRef.current) / 1000);
    }, 1000);
    return () => clearInterval(t);
  }, [started]);

  // ── Synergy: fire when all panels are holding ─────────────────────────────

  useEffect(() => {
    const syn = synergyRef.current;
    if (!syn || syn.status !== "waiting") return;
    const allHolding = panelsRef.current.every(
      (p) => p.phase === "idle" || p.phase === "synergyHolding",
    );
    if (!allHolding || synergySentinelRef.current) return;
    synergySentinelRef.current = true;

    log("All panels holding — starting synergy sequence");
    setSynergyState({ ...syn, status: "sequencing", nextRecordIdx: 0, completedCount: 0 });

    // Assign first synergy record to left panel
    const firstRecord = syn.records[0];
    log(`Synergy panel left → "${firstRecord.title}"`);
    setPanel(0, (p) => ({ phase: "entrance", record: firstRecord, phaseKey: p.phaseKey + 1 }));
    setSynergyState({
      ...syn,
      status: "sequencing",
      nextRecordIdx: 1,
      completedCount: 0,
    });
  }, [panels]);

  // ── Ducking: update when any panel enters/leaves testimony ────────────────

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const testimonyIdx = panelsRef.current.findIndex((p) => p.phase === "testimony");
    setDucking(audio, testimonyIdx >= 0 ? testimonyIdx : null);
  }, [panels]);

  // ── Phase completion handler (core state machine) ─────────────────────────

  const handlePhaseComplete = useCallback(
    (panelIndex: 0 | 1 | 2, phase: PanelPhase) => {
      const syn = synergyRef.current;
      const currentPanel = panelsRef.current[panelIndex];
      const record = currentPanel.record;

      log(`Panel ${PANEL_LABELS[panelIndex]} phase "${phase}" complete`);

      if (phase === "outro") {
        // Panel goes idle — check if synergy is active
        if (syn && syn.status !== "none") {
          if (syn.status === "waiting") {
            // This panel was still playing — mark as synergyHolding now
            setPanel(panelIndex, (p) => ({ ...p, phase: "synergyHolding", record: null, phaseKey: p.phaseKey + 1 }));
          } else if (syn.status === "sequencing") {
            // A synergy record finished — assign next or play connection audio
            const newCompleted = syn.completedCount + 1;

            if (newCompleted < syn.records.length) {
              // Assign next synergy record
              const nextRecord = syn.records[syn.nextRecordIdx];
              // Determine which panel to use (cycle through 0→2→1 for L/R/C or L/C/R)
              const panelOrder: Array<0 | 1 | 2> = syn.records.length === 3
                ? [0, 2, 1]
                : [0, 2];
              const nextPanelIndex = panelOrder[newCompleted];

              log(`Synergy panel ${PANEL_LABELS[nextPanelIndex]} → "${nextRecord.title}"`);

              setSynergyState({
                ...syn,
                completedCount: newCompleted,
                nextRecordIdx: syn.nextRecordIdx + 1,
              });

              setPanel(panelIndex, (p) => ({ ...p, phase: "synergyHolding", record: null, phaseKey: p.phaseKey + 1 }));
              setPanel(nextPanelIndex, (p) => ({ phase: "entrance", record: nextRecord, phaseKey: p.phaseKey + 1 }));
            } else {
              // All records played — start connection audio
              log("All synergy records complete — playing connection audio");
              setSynergyState({ ...syn, status: "connectionAudio", completedCount: newCompleted });
              setPanel(panelIndex, (p) => ({ ...p, phase: "synergyHolding", record: null, phaseKey: p.phaseKey + 1 }));
              playConnectionAudio(syn.connectionData.connection.audio_url);
            }
          } else {
            // connectionAudio or already done — just hold
            setPanel(panelIndex, (p) => ({ ...p, phase: "synergyHolding", record: null, phaseKey: p.phaseKey + 1 }));
          }
        } else {
          // Normal outro → idle → next record
          setPanel(panelIndex, (p) => ({ ...p, phase: "idle", record: null, phaseKey: p.phaseKey + 1 }));
          setTimeout(() => assignRecord(panelIndex), 50);
        }
        return;
      }

      // Normal phase transitions
      const nextPhase = computeNextPhase(phase, record);
      setPanel(panelIndex, (p) => ({ ...p, phase: nextPhase, phaseKey: p.phaseKey + 1 }));

      // If testimony ends and there's nothing after it, skip straight to outro
      if (nextPhase === "outro" && phase === "testimony") {
        // already handled above
      }
    },
    [assignRecord],
  );

  // ── Connection audio playback ─────────────────────────────────────────────

  function playConnectionAudio(url: string) {
    const audio = audioRef.current;
    const el = new Audio(url);
    el.volume = 1;
    connectionAudioRef.current = el;

    // Route through Web Audio if available
    if (audio) {
      try {
        const source = audio.ctx.createMediaElementSource(el);
        const panner = audio.ctx.createStereoPanner();
        panner.pan.value = 0;
        source.connect(panner);
        panner.connect(audio.masterGain);
      } catch {
        // Fall back to native
      }
    }

    el.addEventListener("ended", () => {
      log("Connection audio ended — resuming normal loop");
      setSynergyState(null);
      synergySentinelRef.current = false;
      // All panels go to idle and get new records
      for (let i = 0; i < 3; i++) {
        setPanel(i, (p) => ({ ...p, phase: "idle", record: null, phaseKey: p.phaseKey + 1 }));
        setTimeout(() => assignRecord(i as 0 | 1 | 2), staggerDelay(i) / 4);
      }
    });

    el.addEventListener("error", () => {
      log("Connection audio failed — resuming");
      setSynergyState(null);
      synergySentinelRef.current = false;
      for (let i = 0; i < 3; i++) {
        setPanel(i, (p) => ({ ...p, phase: "idle", record: null, phaseKey: p.phaseKey + 1 }));
        setTimeout(() => assignRecord(i as 0 | 1 | 2), 300 + i * 500);
      }
    });

    el.play().catch(() => {
      log("Connection audio play() failed");
      setSynergyState(null);
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      disposeAudio();
      connectionAudioRef.current?.pause();
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const bag = bagRef.current;
  const isSynergyAudio = synergy?.status === "connectionAudio";

  // Find panels currently in entrance / mediaFlash for global overlays
  const entrancePanelIdx = panels.findIndex((p) => p.phase === "entrance");
  const mediaFlashPanelIdx = panels.findIndex((p) => p.phase === "mediaFlash");

  return (
    <div
      className="w-screen h-screen overflow-hidden relative select-none"
      style={{ background: BG }}
    >
      {/* Three-panel layout (no dividers) */}
      <div className="flex w-full h-full">
        {([0, 1, 2] as const).map((idx) => (
          <div key={idx} className="flex-1 relative overflow-hidden">
            <Panel
              panelState={panels[idx]}
              panelIndex={idx}
              audio={audioRef.current}
              onPhaseComplete={handlePhaseComplete}
            />

            {/* Synergy display overlays during connection audio */}
            <AnimatePresence>
              {isSynergyAudio && synergy && (
                <motion.div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: BG }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.8 }}
                >
                  <SynergyDisplay
                    records={synergy.records}
                    connection={synergy.connectionData.connection}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* Global entrance overlay — covers all panels while a record enters */}
      <AnimatePresence>
        {entrancePanelIdx >= 0 && panels[entrancePanelIdx].record && (
          <motion.div
            key={`global-entrance-${panels[entrancePanelIdx].phaseKey}`}
            className="absolute inset-0 z-10 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <EntranceAnimation
              text={panels[entrancePanelIdx].record!.title}
              slotCount={4}
              holdMin={200}
              holdMax={600}
              cycleDurationMs={2200}
              resting={ENTRANCE_RESTING}
              easing="sharp"
              replayKey={panels[entrancePanelIdx].phaseKey}
              onComplete={() => handlePhaseComplete(entrancePanelIdx as 0 | 1 | 2, "entrance")}
              className="absolute inset-0"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Global mediaFlash overlay — covers all panels during flash */}
      <AnimatePresence>
        {mediaFlashPanelIdx >= 0 && panels[mediaFlashPanelIdx].record && (
          <motion.div
            key={`global-mediaFlash-${panels[mediaFlashPanelIdx].phaseKey}`}
            className="absolute inset-0 z-10 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.05 }}
          >
            <EntranceAnimation
              text={panels[mediaFlashPanelIdx].record!.title}
              slotCount={1}
              holdMin={MEDIA_FLASH_DURATION_MS - 100}
              holdMax={MEDIA_FLASH_DURATION_MS - 100}
              cycleDurationMs={MEDIA_FLASH_DURATION_MS}
              resting={MEDIA_FLASH_RESTING}
              easing="sharp"
              replayKey={panels[mediaFlashPanelIdx].phaseKey}
              className="absolute inset-0"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kanon boot animation — full page, plays once after tap */}
      <AnimatePresence>
        {bootPhase === "kanon" && (
          <motion.div
            key="kanon-boot"
            className="absolute inset-0 z-40 pointer-events-none"
            style={{ background: BG }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <EntranceAnimation
              text="Kanon"
              slotCount={5}
              holdMin={300}
              holdMax={700}
              cycleDurationMs={2800}
              resting={ENTRANCE_RESTING}
              easing="sharp"
              onComplete={startRecords}
              className="absolute inset-0"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click-to-start overlay */}
      <AnimatePresence>
        {bootPhase === "waiting" && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center cursor-pointer"
            style={{ background: BG }}
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            onClick={async () => {
              if (!dataReady) return;
              await initializeAudio();
            }}
          >
            <div className="text-center">
              <p
                className="text-black/30"
                style={{ fontFamily: '"Lector", serif', fontSize: "1rem", letterSpacing: "0.08em" }}
              >
                {dataReady ? "touch to begin" : "loading…"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Debug overlay */}
      {showDebug && (
        <DebugOverlay
          panels={panels}
          synergy={synergy}
          bagRemaining={bag?.remaining ?? 0}
          bagTotal={bag?.total ?? 0}
          events={debugEvents}
          masterTime={masterTime}
          audioCtxState={audioRef.current?.ctx.state ?? "uninitialized"}
        />
      )}
    </div>
  );
}

// ── Phase transition logic ────────────────────────────────────────────────────

function computeNextPhase(completedPhase: PanelPhase, record: Item | null): PanelPhase {
  switch (completedPhase) {
    case "entrance":
      return "creatorReveal";
    case "creatorReveal":
      return record?.voice_recording_url ? "testimony" : "mediaFlash";
    case "testimony": {
      const hasMedia = !!(record?.installationMedia?.file);
      const hasThumbnail = !!(record?.thumbnail_url || record?.media_url);
      return hasMedia || hasThumbnail ? "mediaFlash" : "outro";
    }
    case "mediaFlash":
      return "media";
    case "media":
      return "outro";
    default:
      return "outro";
  }
}
