/** Shared copy for the “site is live” email and the public announcement page. */
export const siteLiveAnnouncement = {
  previewText: "Kanon is live and ready for you",
  headline: "Welcome to Kanon",
  paragraphs: [
    "After some time researching, yapping to myself on Voice Memos, designing, and finally developing, my thesis app is here.",
    "Kanon seeks to bring people together by pushing the work we create, the media we consume, and the theory we treasure into one space where everything can be connected. I can't wait for you to try.",
  ] as const,
  signoffLines: ["Warmly,", "Kris"] as const,
  ctaLabel: "Open Kanon",
  /** Shown in email; neutral wording so it still reads if someone only sees the web page. */
  footer: "You're on the early list for Kanon. If you know someone who wants to be added, please reach out to me.",
} as const;
