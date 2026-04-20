export type EssayBlock =
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "blockquote"; text: string; attribution?: string };
