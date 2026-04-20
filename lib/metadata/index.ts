export { runMetadataPipeline } from "./pipeline";
export { classifyUrl, classifyFile } from "./classify";
export { scoreMetadata, AI_CONFIDENCE_THRESHOLD } from "./score";
export {
  getCachedMetadata,
  resolveMetadataCache,
  scheduleMetadataRefresh,
  normalizeUrl,
  METADATA_CACHE_SCHEMA_VERSION,
} from "./cache";
export { splitTitleAndHashtags, truncateAtWord, stripTrailingNoise } from "./text";
export { extractDoi } from "./handlers/doi";
export {
  extractYouTubeVideoId,
  downloadYouTubeVideoBuffer,
} from "./handlers/youtube";
export {
  probeMediaPageWithYtDlp,
  ytDlpGlobalArgs,
  type YtDlpMediaProbe,
} from "./video-extract";
export { fetchMusicMetadata } from "./handlers/music";
export { fetchInstagramMetadata, fetchTikTokMetadata, fetchTwitterMetadata } from "./handlers/social";
export type {
  SourceType,
  ItemType,
  SourceMetadata,
  CanonItemMetadata,
  MetadataResult,
} from "./types";
