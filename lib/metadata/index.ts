export { runMetadataPipeline } from "./pipeline";
export { classifyUrl, classifyFile } from "./classify";
export { extractDoi } from "./handlers/doi";
export { extractYouTubeVideoId, downloadYouTubeVideoBuffer } from "./handlers/youtube";
export { fetchMusicMetadata } from "./handlers/music";
export { fetchInstagramMetadata, fetchTikTokMetadata, fetchTwitterMetadata } from "./handlers/social";
export type {
  SourceType,
  ItemType,
  SourceMetadata,
  CanonItemMetadata,
  MetadataResult,
} from "./types";
