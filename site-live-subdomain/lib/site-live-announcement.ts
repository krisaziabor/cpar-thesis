/** Copy for the public announcement page (and optionally keep in sync with your main repo email). */
export const siteLiveAnnouncement = {
  previewText: "Kanon is live and ready for you",
  headline: "Welcome to Kanon",
  paragraphs: [
    "After a semester of designing and developing, my thesis app is finally here.",
    "Kanon seeks to bring people together by pushing the work we create, the media we consume, and the theory we understand into one space where everything can be connected. I can't wait for you to try.",
  ] as const,
  signoffLines: ["Warmly,", "Kris"] as const,
  ctaLabel: "Open Kanon",
  footer:
    "You're on the early list for Kanon. If you know someone who wants to be added, please reach out to me.",
} as const;
