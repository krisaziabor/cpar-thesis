import type { Timestamp } from "firebase/firestore";
import type { SourceMetadata } from "./metadata/types";

/** Community: name and email whitelist for access */
export interface Community {
  id: string;
  name: string;
  email_whitelist: string[];
  created_at: Timestamp;
}

export type MusicPlatform =
  | "youtube"
  | "spotify"
  | "apple_music"
  | "soundcloud"
  | "tidal"
  | "amazon_music"
  | "deezer";

/** User: identity for contributors */
export interface User {
  id: string;
  email: string;
  name: string;
  created_at: Timestamp;
  /** Three hex colors from the onboarding color wheel, used for the user's gradient avatar. */
  avatar_colors?: [string, string, string];
  /** Preferred streaming platform for music links. Defaults to "youtube". */
  preferred_music_platform?: MusicPlatform;
}

/** Item: library entry (film, book, article, etc.) with required voice testimony */
export interface Item {
  id: string;
  title: string;
  description?: string;
  encountered_source?: string;
  /** Original date of the media/record (free-text: year, month/year, or full date). */
  media_date?: string;
  type: string;
  creator: string;
  link?: string;
  thumbnail_url?: string;
  media_url?: string;
  voice_recording_url: string;
  transcript: string;
  /** Word-level timed transcript for synced playback (optional, generated at upload time). */
  timed_transcript?: TimedWord[];
  tags: string[];
  added_by: string;
  is_draft: boolean;
  is_hidden: boolean;
  created_at: Timestamp;
  /** Rich metadata extracted at add-time; stored as a map on the item document */
  source_metadata?: SourceMetadata;
}

/** Connection: links 2+ items with required audio description */
export interface Connection {
  id: string;
  audio_url: string;
  transcript: string;
  created_by: string;
  is_hidden: boolean;
  created_at: Timestamp;
}

/** Junction: which item is part of which connection */
export interface ConnectionItem {
  id: string;
  connection_id: string;
  item_id: string;
}

/** Response: voice reply to a connection */
export interface Response {
  id: string;
  connection_id: string;
  audio_url: string;
  transcript: string;
  created_by: string;
  created_at: Timestamp;
}

/** ItemResponse: voice reply to an item record */
export interface ItemResponse {
  id: string;
  item_id: string;
  audio_url: string;
  transcript: string;
  created_by: string;
  created_at: Timestamp;
}

/** AudioVersion: a recorded version of an item's testimony */
export interface AudioVersion {
  id: string;
  url: string;
  created_at: Timestamp;
  created_by: string;
}

/** KanonSave: a user's personal save of an item or connection */
export interface KanonSave {
  id: string;
  user_email: string;
  reference_type: "item" | "connection";
  reference_id: string;
  created_at: Timestamp;
}

/** DeletionRequest: submitted when a user wants to delete an item with connections */
export interface DeletionRequest {
  id: string;
  item_id: string;
  item_title: string;
  requested_by: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  created_at: Timestamp;
  resolved_at?: Timestamp;
  resolved_by?: string;
}

/** Feedback: freeform feedback submitted by an authenticated user */
export interface Feedback {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  text: string;
  created_at: Timestamp;
}

/**
 * Installation onboarding: tracks a user's progress through the
 * pre-launch opt-in flow (media consent → book text → contact info).
 * Each step is persisted independently so users can resume mid-flow.
 */
export type OnboardingStep = "accessibility" | "profile_setup" | "media_opt_in" | "book_text" | "contact" | "avatar_colors" | "complete";

/** Word-level timestamp for synced audio transcripts. */
export interface TimedWord {
  word: string;
  start: number;
  end: number;
}

export interface InstallationOnboarding {
  id: string;
  user_email: string;
  user_name: string;

  /** Step 0 — accessibility: user acknowledges audio-first design */
  accessibility_acknowledged_at?: Timestamp;

  /** Step 1 — profile setup: name and icon for new sign-ups */
  profile_name?: string;
  profile_icon?: string;
  profile_setup_at?: Timestamp;

  /** Step 1 — three pillars: consent to include media in installation */
  media_opt_in?: boolean;
  media_opt_in_at?: Timestamp;

  /** Step 2 — plinth/book: special written piece */
  book_title?: string;
  book_date?: string;
  book_text?: string;
  book_pdf_url?: string;
  book_skipped?: boolean;
  book_submitted_at?: Timestamp;

  /** Step 3 — contact preferences */
  phone_number?: string;
  preferred_contact_method?: "email" | "text";
  contact_submitted_at?: Timestamp;

  /** Step 4 — avatar gradient colors (three hex values from the color wheel) */
  avatar_colors?: [string, string, string];
  avatar_colors_at?: Timestamp;

  completed_at?: Timestamp;
  created_at: Timestamp;
  updated_at: Timestamp;
}
