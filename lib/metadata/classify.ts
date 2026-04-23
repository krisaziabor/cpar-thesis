import type { SourceType } from "./types";

const DOI_PATTERN = /10\.\d{4,9}\/[^\s"<>]+/i;

const MUSIC_DOMAINS = [
  "open.spotify.com",
  "spotify.com",
  "music.apple.com",
  "itunes.apple.com",
  "soundcloud.com",
  "deezer.com",
  "tidal.com",
  "music.amazon.com",
  "music.youtube.com",
  "song.link",
  "odesli.co",
  "geo.music.apple.com",
];

// bandcamp uses arbitrary subdomains (artist.bandcamp.com)
const MUSIC_DOMAIN_SUFFIXES = ["bandcamp.com"];

const ACADEMIC_DOMAINS = [
  "jstor.org",
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "dl.acm.org",
  "acm.org",
  "ieeexplore.ieee.org",
  "link.springer.com",
  "nature.com",
  "science.org",
  "onlinelibrary.wiley.com",
  "tandfonline.com",
  "sagepub.com",
  "academic.oup.com",
  "cambridge.org",
  "sciencedirect.com",
  "elsevier.com",
  "pubs.acs.org",
];

export function classifyUrl(input: string): SourceType {
  try {
    const normalized = input.startsWith("http") ? input : `https://${input}`;
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = url.pathname.toLowerCase();

    // YouTube (music.youtube.com is caught by music check below)
    if (
      hostname === "youtube.com" ||
      hostname === "youtu.be" ||
      hostname === "m.youtube.com"
    ) {
      return "youtube";
    }

    // Music platforms
    if (
      MUSIC_DOMAINS.includes(hostname) ||
      MUSIC_DOMAIN_SUFFIXES.some((s) => hostname === s || hostname.endsWith(`.${s}`))
    ) {
      return "music";
    }

    // arXiv
    if (hostname === "arxiv.org") return "doi";

    // DOI resolvers
    if (hostname === "doi.org" || hostname === "dx.doi.org") return "doi";

    // Academic publisher domains
    if (ACADEMIC_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`))) {
      return "doi";
    }

    // Raw DOI pattern in path (e.g. springer, nature direct links)
    if (DOI_PATTERN.test(pathname)) return "doi";

    // Social media (subdomains: l.instagram.com, vm.tiktok.com, mobile.twitter.com, …)
    if (
      hostname === "instagram.com" ||
      hostname.endsWith(".instagram.com") ||
      hostname === "instagr.am"
    ) {
      return "instagram";
    }
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
      return "tiktok";
    }
    if (
      hostname === "twitter.com" ||
      hostname === "x.com" ||
      hostname.endsWith(".twitter.com")
    ) {
      return "twitter";
    }

    // Long-form writing platforms
    if (
      hostname === "medium.com" ||
      hostname.endsWith(".medium.com") ||
      hostname.endsWith(".substack.com") ||
      hostname.endsWith(".ghost.io")
    ) {
      return "news";
    }

    // PDF by path extension. Handles direct `.pdf` URLs and Firebase Storage
    // download URLs (…/o/files%2Fitems%2Fabc.pdf?alt=media&token=…) after
    // URL decoding — covers the client-side-upload flow for large PDFs.
    try {
      const decoded = decodeURIComponent(pathname);
      if (/\.pdf$/i.test(decoded)) return "pdf";
    } catch {
      if (/\.pdf$/i.test(pathname)) return "pdf";
    }

    return "url";
  } catch {
    // Might be a raw DOI string like "10.1038/nature12373"
    if (DOI_PATTERN.test(input)) return "doi";
    return "unknown";
  }
}

/**
 * True when this URL points at a page we can fetch hosted video for (see
 * /api/media/upload-video). Used when saving items so downloads still run if
 * metadata was cached or classified as generic "url" (e.g. old cache entries).
 */
export function isDownloadableVideoPageUrl(input: string): boolean {
  try {
    const normalized = input.startsWith("http") ? input : `https://${input}`;
    const url = new URL(normalized);
    let hostname = url.hostname.toLowerCase();
    if (hostname.startsWith("www.")) hostname = hostname.slice(4);

    if (hostname === "youtu.be") return true;
    if (hostname === "youtube.com" || hostname === "m.youtube.com") return true;
    if (hostname.endsWith(".youtube.com") && hostname !== "music.youtube.com") {
      return true;
    }

    if (
      hostname === "instagram.com" ||
      hostname.endsWith(".instagram.com") ||
      hostname === "instagr.am"
    ) {
      return true;
    }
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return true;
    if (
      hostname === "twitter.com" ||
      hostname === "x.com" ||
      hostname.endsWith(".twitter.com")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function classifyFile(file: { name: string; type: string }): SourceType {
  const mime = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.startsWith("audio/") ||
    ["mp3", "wav", "m4a", "aac", "flac", "ogg", "opus", "aif", "aiff"].includes(ext)
  ) {
    return "audio";
  }
  if (
    mime.startsWith("video/") ||
    ["mp4", "m4v", "mov", "webm", "mkv", "avi", "wmv", "mpeg", "mpg"].includes(ext)
  ) {
    return "video";
  }
  if (
    mime.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "avif", "svg"].includes(ext)
  ) {
    return "image";
  }
  return "unknown";
}
