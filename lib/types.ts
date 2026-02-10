import type { Timestamp } from "firebase/firestore";

/** Community: name and email whitelist for access */
export interface Community {
  id: string;
  name: string;
  email_whitelist: string[];
  created_at: Timestamp;
}

/** User: identity for contributors */
export interface User {
  id: string;
  email: string;
  name: string;
  created_at: Timestamp;
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
