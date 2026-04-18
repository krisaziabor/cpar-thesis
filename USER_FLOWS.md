# Kanon: Primary User Flows

## Adding Items

1. User presses **Add** from the home screen.
2. User adds link or media directly.
    - Kanon attempts to smart fetch metadata.
    - If fetch fails, all fields are blank for manual entry.
3. User reviews/edits metadata and confirms.
4. User records audio, can listen back, then confirms.
5. If the library has existing items: user has the option to connect to existing items or skip.
    - If the library is empty: this step is skipped entirely.
6. User submits and is brought back to the home screen with the new element as the anchor in the visualization.

> **Note:** User can abandon the flow at any step; options to save as draft or discard completely. User can navigate back through previous steps.

User can also press on an existing item and under connect, connect to a new item.

### Pages and their respective elements

_Navigation exists on all pages. Back and exit (with draft/discard options) available throughout._

- **Home page:** Graph, action buttons (including Add), brief activity feed/list.
- **Add page:** Input field for URL or media upload, cancel option.
- **Metadata page:** Fields for type, title, author/creator, tags, pre-filled if smart fetch succeeded, all editable. Confirmation button.
- **Audio Record page:** Summary of metadata, recording interface, playback to review, re-record option, confirmation button.
- **Connect page (conditional):** Summary of item, search/browse interface for existing items, selected items list, connect button, skip option.
- **Home page (return):** Graph with new element as anchor, action buttons, updated brief activity feed/list.

---

## Creating Connections

### Flow 1 & 2: Creating a New Connection

1. User selects an item (taps node on graph, or is already on Item Detail page).
2. **Connect** action becomes available / user presses **Connect**.
3. Routed to Connect page with selected item pinned as anchor.
4. Selects one or more additional items via search/browse and confirms.
5. Records audio, can listen back, then confirms.
6. Submits, brought back to previous context (home or Item Detail) with new connection visible.

### Flow 3: Responding to an Existing Connection

1. User opens Connection Detail from item page or graph.
2. Presses **Respond**.
3. Records audio, can listen back, then confirms.
4. Submits, brought back to Connection Detail with new response visible.

### Flow 4: Replying to a Specific Response

1. User opens Connection Detail (or an item's Responses list on the Item panel).
2. On any existing audio response they see a **Reply** action.
3. Pressing it opens a recorder anchored to that response, with a summary of who they're replying to.
4. Records audio, can listen back, then confirms.
5. Submits — the new response appears threaded underneath the response it replies to, forming an audio conversation. Replies can themselves be replied to, producing nested threads.

> **Note:** User can abandon any flow at any step: option to save as draft or discard. User can navigate back through previous steps.

### Pages and their respective elements

_Navigation exists on all pages. Back and exit (with draft/discard options) available throughout._

- **Home page:** Graph (tapping a node selects it), action buttons (**Connect** disabled until item selected), brief activity feed/list.
- **Item Detail page:** Item title, audio testimony player, creator name & date added, item type/creator/link/tags, list of connections (who made them, whether they have responses), **Connect** action button, back/navigation.
- **Connect page:** Anchored item summary (pinned), search/browse interface for existing items, selected items list (minimum 1 additional), confirm button.
- **Audio Record page (for connections):** Summary of items being connected, recording interface, playback to review, re-record option, confirmation button.
- **Connection Detail page:** Connection summary (which items, who made it, when), audio player for connection testimony, threaded list of responses with their audio players, **Respond** button on the connection and **Reply** button on each response.
- **Response Audio page:** Summary of connection (or parent response) being responded to, recording interface, playback to review, re-record option, confirmation button. Passing `?parentResponseId=…` anchors the submission as a reply to that specific response instead of to the connection itself.

---

## List View

1. User from home page (default is graph) presses on list view.
2. Elements are listed, by default sorted by recency and no filter.
3. User has filter and sorting ability.

---

## Auth/Onboarding

1. User enters email; if email is on whitelist they receive a verification code.
2. User enters verification code and if valid, enters site.

> Since all users have their full names already set, they only have to add a profile photo.

### Pages and their respective elements

- **Email Entry page:** Email input field, submit button, error state for non-whitelisted emails.
- **Verification page:** Code input field, submit button, resend code option, error state for invalid code.

---
