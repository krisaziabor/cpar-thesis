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
  /** Preferred streaming platform for music links. Defaults to "youtube". */
  preferred_music_platform?: MusicPlatform;
}

/** Item: library entry (film, book, article, etc.) with required voice testimony */
export interface Item {
  id: string;
  title: string;
  type: string;
  creator: string;
  link?: string;
  media_url?: string;
  voice_recording_url: string;
  transcript: string;
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
