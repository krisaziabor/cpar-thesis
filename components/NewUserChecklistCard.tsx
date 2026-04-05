"use client";

import { useEffect, useMemo, useState } from "react";
import {
  backfillChecklistProgress,
  subscribeToUserChecklistProgress,
  type UserChecklistProgress,
} from "@/lib/user-checklist";

interface NewUserChecklistCardProps {
  userEmail: string;
}

function emptyProgress(userEmail: string): UserChecklistProgress {
  return {
    user_email: userEmail,
    texts_added_count: 0,
    own_to_other_connections_count: 0,
    foreign_connections_count: 0,
    kanon_saves_count: 0,
    completed: {
      add_texts_to_library: false,
      connect_own_to_other: false,
      connect_foreign_to_foreign: false,
      add_to_my_kanon: false,
    },
  };
}

function progressCount(count: number, target: number): string {
  return `${Math.min(count, target)}/${target}`;
}

export default function NewUserChecklistCard({ userEmail }: NewUserChecklistCardProps) {
  const [progress, setProgress] = useState<UserChecklistProgress>(() => emptyProgress(userEmail));

  useEffect(() => {
    if (!userEmail) return;
    return subscribeToUserChecklistProgress(userEmail, setProgress);
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail) return;
    void backfillChecklistProgress(userEmail);
  }, [userEmail]);

  const items = useMemo(
    () => [
      {
        key: "add_texts",
        label: "Add texts to the library",
        done: progress.completed.add_texts_to_library,
        counterLabel: progressCount(progress.texts_added_count, 3),
      },
      {
        key: "connect_own_to_other",
        label: "Connect your texts to other users' texts",
        done: progress.completed.connect_own_to_other,
        counterLabel: progressCount(progress.own_to_other_connections_count, 2),
      },
      {
        key: "connect_foreign",
        label: "Connect texts that aren't yours with each other",
        done: progress.completed.connect_foreign_to_foreign,
        counterLabel: progressCount(progress.foreign_connections_count, 2),
      },
      {
        key: "my_kanon",
        label: 'Add a text to "My Kanon"',
        done: progress.completed.add_to_my_kanon,
        counterLabel: progress.completed.add_to_my_kanon ? "1/1" : "0/1",
      },
    ],
    [progress]
  );

  return (
    <aside className="pointer-events-none fixed bottom-6 right-6 z-40 w-[22rem] max-w-[calc(100vw-2rem)]">
      <div className="pointer-events-auto overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
        <div className="border-b border-zinc-800 px-4 py-3">
          <p className="font-lector text-sm text-zinc-200">New User Checklist</p>
        </div>

        <div className="flex flex-col divide-y divide-zinc-800">
          {items.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className={`text-xs ${item.done ? "text-zinc-200" : "text-zinc-400"}`}>{item.label}</p>
              </div>
              <span
                className={`mt-0.5 shrink-0 text-[11px] ${
                  item.done ? "text-emerald-300" : "text-zinc-600"
                }`}
              >
                {item.counterLabel}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
