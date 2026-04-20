import type { EssayBlock } from "./types";
import { CHUNK_01 } from "./chunks/01-intro-machine";
import { CHUNK_02 } from "./chunks/02-apples-mechanization";
import { CHUNK_03 } from "./chunks/03-artists-neutral";
import { CHUNK_04 } from "./chunks/04-denmark-sand";
import { CHUNK_05 } from "./chunks/05-trapped-close";

export const ESSAY_BLOCKS: EssayBlock[] = [
  ...CHUNK_01,
  ...CHUNK_02,
  ...CHUNK_03,
  ...CHUNK_04,
  ...CHUNK_05,
];
