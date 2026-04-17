export interface MockItem {
  id: string;
  title: string;
  type: string;
  creator: string;
  tags: string[];
  added_by: string;
  created_at: string;
  connection_count: number;
  link?: string;
  transcript: string;
}

export interface MockConnection {
  id: string;
  item_ids: string[];
  item_titles: string[];
  created_by: string;
  created_at: string;
  has_audio: boolean;
  response_count: number;
  transcript?: string;
}

export const MOCK_ITEMS: MockItem[] = [
  {
    id: "1",
    title: "Beloved",
    type: "book",
    creator: "Toni Morrison",
    tags: ["memory", "trauma", "community"],
    added_by: "Kris A.",
    created_at: "Jan 10, 2025",
    connection_count: 3,
    link: "https://en.wikipedia.org/wiki/Beloved_(novel)",
    transcript: "I added this because it holds the grief that can't be spoken out loud — and yet somehow has to be.",
  },
  {
    id: "2",
    title: "Moonlight",
    type: "film",
    creator: "Barry Jenkins",
    tags: ["identity", "community", "coming-of-age"],
    added_by: "Studio K.",
    created_at: "Jan 12, 2025",
    connection_count: 2,
    transcript: "This film changed what I thought tenderness could look like in a Black community.",
  },
  {
    id: "3",
    title: "The Mis-Education of the Negro",
    type: "book",
    creator: "Carter G. Woodson",
    tags: ["education", "history", "self-determination"],
    added_by: "Kris A.",
    created_at: "Jan 15, 2025",
    connection_count: 1,
    transcript: "Still the most direct critique of how institutions fail the people they claim to serve.",
  },
  {
    id: "4",
    title: "Formation",
    type: "song",
    creator: "Beyoncé",
    tags: ["community", "identity", "power", "south"],
    added_by: "Studio K.",
    created_at: "Jan 18, 2025",
    connection_count: 2,
    transcript: "The visual language is doing so much archival work — this is a library in itself.",
  },
  {
    id: "5",
    title: "The 1619 Project",
    type: "article",
    creator: "Nikole Hannah-Jones",
    tags: ["history", "memory", "journalism"],
    added_by: "Kris A.",
    created_at: "Jan 20, 2025",
    connection_count: 1,
    link: "https://www.nytimes.com/interactive/2019/08/14/magazine/1619-america-slavery.html",
    transcript: "Recentering — that's the word. Everything recenters when you read this.",
  },
];

export const MOCK_CONNECTIONS: MockConnection[] = [
  {
    id: "c1",
    item_ids: ["1", "2"],
    item_titles: ["Beloved", "Moonlight"],
    created_by: "Kris A.",
    created_at: "Jan 13, 2025",
    has_audio: true,
    response_count: 2,
    transcript: "Both works hold inherited pain as something the body carries. Sethe and Chiron never speak the weight directly — it lives in them.",
  },
  {
    id: "c2",
    item_ids: ["3", "5"],
    item_titles: ["The Mis-Education of the Negro", "The 1619 Project"],
    created_by: "Studio K.",
    created_at: "Jan 21, 2025",
    has_audio: false,
    response_count: 0,
  },
  {
    id: "c3",
    item_ids: ["2", "4"],
    item_titles: ["Moonlight", "Formation"],
    created_by: "Studio K.",
    created_at: "Jan 19, 2025",
    has_audio: true,
    response_count: 1,
    transcript: "Both reclaim the American South as a site of Black interiority, not just suffering.",
  },
];

