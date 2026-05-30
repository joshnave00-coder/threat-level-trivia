# Changelog

All notable changes to Threat Level Trivia are documented here.

---

## v1.6.0 - 2026-05-29

### Features
- **Community Nudge Sticky Note** - The solo name-entry screen now shows a crooked yellow Post-it (handwritten Caveat font, slanted down-right) above the form. It cycles through a pool of 10 messages that encourage players to vote, rate, dispute, and submit questions ("The question bank grows beet by beet...", "Creed knows things no one else does. You probably do too...", etc.). A different note appears on each visit to the screen, never repeating back-to-back.
- **Global Leaderboard Header & Difficulty Filter** - The Employee Records screen now carries a "Global Leaderboard" title and an All / Medium / Hard difficulty filter to the right. Ranks recompute for the filtered view, so a player can see whether they're #1 among Medium players or among Hard players specifically. Filtering re-renders from a cached server response (no extra fetch per toggle).
- **Home Logo Easter Egg** - Double-clicking the paper-airplane logo on the home screen fires a random Office quote toast. The pool is built at load time from every in-game quote bank (correct callouts + incorrect callouts + pause-overlay quotes) plus a curated set of 33 bonus classic lines (70+ total), so it auto-grows whenever those banks grow. Pick is purely random each time (no rotation, no anti-repeat).
- **In-Game Logo Exit Shortcut** - The paper-airplane logo now also appears at the top-left of the in-game header and acts as a second "Leave game" control, firing the same confirmation dialog as the existing text "Leave" button (which is unchanged).
- **Party Speed-Round Time Options** - Party mode's Speed Round changed from a single 15-second checkbox to Off / 30 / 20 / 15 seconds. The 3-2-1-GO countdown now only runs when a speed round is active (no countdown for untimed party questions).
- **Challenge Speed-Round Time Options** - Challenge Mode's Speed Round changed from Off / 15 / 5 to Off / 30 / 15 / 10 seconds. "Ludicrous" mode is now 10 seconds (was 5).
- **Admin Search Clear Button** - The Questions search box shows a clear (x) button on hover/focus when it has text, clearing the field in one click.
- **Permanent Removal of Resolved Items** - Resolved suggestions (approved/rejected), resolved disputes, and any submitted feedback entry can now be permanently removed from their respective admin lists via a Remove button. The existing grayed-out resolved state is retained; removal is a separate, permanent action.

### Changes
- **Question ID Format** - All question-ID references now read "Question ID: 123" instead of "#123". The ID now also appears at the top of the question editor modal, on Community Ratings cards, and on dispute cards (previously only on the question list cards). The reset-ratings/reset-votes confirmations and toasts were updated to match.
- **Answer Reveal Layout** - The answer context now sits directly beneath the answer inside the same box (same background and left border). The correct answer is now bold regular text (previously italic), and the context below it is italic.
- **Lobby Dropdown Sizing** - The Category and Character dropdowns in all three lobbies (solo, party, challenge) now size to their longest option instead of stretching across the full column width.
- **Adaptive Recent-Question Buffer** - The buffer that prevents repeat questions across solo sessions is now 80% of the live active question bank (previously a fixed 100). It auto-scales as the bank grows or shrinks (disabled/deleted questions are excluded from the count).
- **Edit Modal Hardening** - The question editor no longer closes on a backdrop (outside) click, its header is sticky so the close X is always reachable, and it always reopens scrolled to the top.

### Infrastructure
- `POST /api/feedback` now branches on the admin token: with a valid token it does a full-array overwrite (used to remove feedback entries), and without one it appends a single player submission as before. Mirrors the existing `/api/question-suggestions` pattern.
- New globals in `js/data.js`: `STICKY_NOTES` + `pickStickyNote()`; `EGG_BONUS_QUOTES` + `buildEggQuotePool()` + `EGG_QUOTES` + `pickEggQuote()`.
- New `deleteDispute(id)` in `js/state.js`. The leaderboard render in `js/ui.js` was split into `renderLeaderboard()` (fetch + cache) and `renderLeaderboardList()` (filtered render) so the difficulty filter re-renders without re-fetching.
- Caveat handwriting font added via Google Fonts (with preconnect hints) for the sticky note.
- Shared toast styling now wraps long messages within a capped width (so the long quote-easter-egg toasts display cleanly) while short system toasts still render as compact pills.

---

## v1.5.0 - 2026-05-28

### Features
- **Challenge Mode ("Send a Fax to Friends")** - Async multiplayer via shareable "memo" links. The creator picks settings (category, difficulty, character, count, speed round), hits Create, and the server generates a unique 6-character memo code with a copy-ready shareable link. Anyone who opens the link plays the exact same questions in the exact same order with the same answer options. After finishing, every score lands on a shared per-memo leaderboard so everyone can see where they stack up. Memos can be reshared as many times as you want, or a fresh one can be created at any time.
- **Inter-Office Memo Card** - Joiners see a serif-styled memo as the Challenge Mode intro screen, including FROM, body, question count, CC line (Michael Scarn, Catherine Zeta-Jones, Goldenface), and a rotated red "AUTHORIZED BY: Michael Scarn, Secret Agent" stamp.
- **Floating Scroll-to-Top Button** - Fixed-position button appears after 300px of scroll on any screen. Smooth-scrolls back to the top. Sized down on mobile.
- **Score-Based Quote Reactions** - The results screen (solo and challenge) now shows a tier-based Office quote in a sticky-note callout under your grade. Seven score tiers with three rotating quotes each so replays stay fresh (100% = "I am Beyonce, always." / 30-49% = "I DECLARE BANKRUPTCY!" / 0-9% = "You couldn't handle my undivided attention.").
- **Streak-Aware Cast Detection on Name Inputs** - If a player types an Office cast member's name (50+ first names, last names, and full names recognized), Dwight immediately interrupts with "Identity theft is not a joke, Jim!" Fires once per matched name per input.
- **Rotating Name-Input Placeholders** - Name fields cycle through a pool of cast and alter-egos on page load: Bill Buttlicker, Michael Scarn, Date Mike, Prison Mike, Mose Schrute, Andy "Boner Champ" Bernard, Goldenface, The Scranton Strangler, Big Tuna, and more.
- **Randomized Loading Messages** - "Loading..." replaced everywhere with a randomized pool: "Stanley is doing the crossword...", "Calling David Wallace...", "Toby is sighing...", "Phyllis is sorting...", "Cooling the printers...", "Faxing Corporate...", and others.
- **Wrong-Answer Punchy Toast Reactions** - The instant you click a wrong multiple-choice button, a short Office reaction fires in the corner ("FALSE.", "NOPE. Rabies.", "Did I stutter?", "Boy, have you lost your mind?", etc.). Pool of 15, never repeats consecutively. Works in both solo and party modes.
- **Leaderboard Rank Tooltips** - Hover any rank number to see a Dunder Mifflin corporate title: 1 = Regional Manager, 2 = Assistant Regional Manager, 3 = Assistant *to* the Regional Manager, 4-10 = Sales, 11-25 = Quality Assurance, 26+ = Temp, last place = Toby. Applies to both the global leaderboard and per-memo Challenge leaderboards.
- **Hard Difficulty Quip** - Selecting "Hard" in any lobby fires a toast: "Sweet. Deep tracks only." (Andy Bernard, roller-skating party).
- **Hardcore Mode Quip** - Enabling Hardcore Mode fires a toast quoting Dwight: "Question: What kind of bear is best? Black bear. Hardcore." The toggle also now displays a serif italic Dwight subquote underneath ("Whenever I'm about to do something, I think, 'Would an idiot do that?'").
- **Hidden Keyword Easter Eggs** - Type any of `false`, `schrute`, `bears`, `boomroasted`, `mose`, `bankruptcy`, `pretzel`, `parkour`, `prison`, or `scarn` anywhere on the page (outside form fields) to trigger a yellow full-screen flash and a themed character quote. Each trigger has its own rotating quip pool. Six-second cooldown prevents back-to-back spam.

### Changes
- "How to Play" rules screen rewritten with a dedicated step-by-step Challenge Mode section and a new "This Is a Community-Driven Question Bank" highlight section (sticky-note styled) emphasizing votes, ratings, disputes, and question submissions.
- Em-dash sweep: every em dash in the codebase (UI text, comments, data, docs, gitignore) replaced with a regular hyphen for tone consistency.

### Infrastructure
- New server endpoints: `GET /api/challenges?code=XXXXXX`, `POST /api/challenges` (memo creation), `GET /api/challenge-scores?code=XXXXXX`, `POST /api/challenge-scores` (score submission).
- New JS module: `js/challenge.js` (Challenge Mode flow, URL helpers, memo code generation, monkey-patched seeded shuffle for deterministic question order across players).
- New data files: `data/challenges.json`, `data/challenge-scores.json`.
- Seeded RNG (Mulberry32 with string hash) ensures every player on the same memo sees identical questions in identical order with identical distractor positions.

---

## v1.4.0 - 2026-05-28

### Features
- **Player Question Submissions** - New "Submit a Question" form inside the Suggestion Box. Players can submit a full trivia question (question text, correct answer, three wrong answers, category, difficulty, and optional context). Submissions are honeypot-protected and rate-limited. Selecting "New Question Idea" in the feedback type dropdown auto-redirects to this dedicated form.
- **Admin Suggested Questions Tab** - New admin panel tab listing all player-submitted questions. Each suggestion sorts by status (pending, deferred, resolved). Admin can **Review & Revise** (opens the full question editor pre-filled with the suggestion; the save button reads "Add to Question Bank" and the suggestion is only marked approved on save), **Review Later** (defers), or **Delete** (rejects with confirmation).
- **Admin Question Delete** - Every question card in the Questions tab now has a Delete button. Custom questions are erased outright. Built-in questions are added to a new `data/deleted-questions.json` list and filtered out everywhere (admin view + gameplay), distinct from the reversible Disable toggle.
- **Admin Question Revert** - Edited built-in questions show a new Revert button that strips the edit overlay and restores the original question text.
- **Admin Question ID Display** - Each question card now shows its question ID in small italic text in the top-left for cross-referencing with disputes, exports, and community ratings.
- **Leaderboard Difficulty Display** - Public leaderboard entries now show the difficulty level (Medium/Hard) alongside the category and date.

### Changes
- "File a Dispute" renamed to **"Question Feedback / Dispute"** everywhere (question screen button, dispute form heading, in-game reset state, How to Play rules).
- Admin **"Disputes & Feedback"** tab split into two separate tabs: **Flagged Questions** and **Submitted Feedback**, each with their own nav button and dedicated panel.
- Admin help guide rewritten to cover all current admin features: question ID badge, Delete, Revert, Suggested Questions queue, Leaderboard management, split Disputes/Feedback panels.
- README updated with current question count (290+), new file list, new API/data files.
- How to Play rules screen updated with new "Submit a Trivia Question" section and refreshed Community Feedback wording.

### Infrastructure
- New server endpoints: `GET /api/question-suggestions`, `POST /api/question-suggestions` (public submission appends; admin token overwrites), `GET /api/deleted-questions`, `POST /api/deleted-questions` (admin-only).
- New localStorage key: `tlt_deleted_questions`.
- New data files: `data/question-suggestions.json`, `data/deleted-questions.json`.
- New JS module: `js/suggestions.js` (player submission form + admin review queue).

---

## v1.3.0 - 2025-05-25

### Features
- **Party Countdown** - 3-2-1-GO animated countdown before each party question. Question is hidden behind overlay until "GO!" so no player can read ahead.
- **Equal Question Distribution** - Party mode now enforces that every player gets the exact same number of questions. Count is rounded to the nearest multiple of players; toast explains any adjustment.
- **Wager Timer** - 45-second countdown on the wager screen. Progress bar turns amber then red. Auto-submits current values when time expires.
- **Party Pause** - Host can pause mid-question. Full-screen overlay hides question/answer and displays a random Office quote from a curated bank of 10. Speed round timer suspends on pause and resumes with remaining time.
- **Question Export** - New CSV export in Settings. Admin selects which columns to include via checkboxes (ID, question, answer, distractors, category, difficulty, tags, type, enabled, community avg/count). Includes Select All / Deselect All.
- **Edit from Disputes** - "Edit Question" button on every dispute card opens the question editor modal pre-populated with that question's data. No more tab-hopping.

### Changes
- Admin "Review" tab renamed to "Disputes & Feedback" for clarity.
- Settings "Answer History" section split: export feature replaced with Question Export; Clear History button remains standalone.

---

## v1.2.0 - 2025-05-25

### Features
- **Community Difficulty Ratings (Admin)** - New "Community Ratings" admin tab. Shows every question's average community rating, count, and whether it is overriding the base difficulty. Admin can reset individual question ratings.
- **Community Difficulty Override** - When 3+ players rate a question, the displayed difficulty badge auto-updates to reflect the community average (Easy/Medium/Hard thresholds: <4 / 4-6.9 / 7+). Original difficulty preserved in admin view.
- **Character Auto-Tagging** - 24 character definitions with regex patterns. `autoTagAllQuestions()` scans all 216 questions and assigns character tags based on name mentions. Stored in `data/tags.json`.
- **Character Filter** - "Character" dropdown in both solo and party lobby screens. Filter the question pool to only include questions mentioning a specific character.
- **Live Pool Count** - Shows how many questions match the current filter combo (category + difficulty + character). Turns red when fewer than 5 available.
- **Custom 404 Page** - Themed 404 page with Dunder Mifflin aesthetic, ruled-paper grid background, and Michael Scott quote. Served by Python server for any invalid route.
- **Screen Fade-In** - CSS animation (`screenFadeIn 0.18s ease`) on screen transitions to prevent blank flash on slow connections.
- **Privacy Banner** - One-time dismissible banner disclosing localStorage usage and optional email collection. Uses `slideUpIn` CSS animation.

### Fixes
- **Input Sanitization** - `sanitizeName()` strips HTML tags, control characters, and excess whitespace from all free-form inputs (player names, dispute text). Max lengths enforced (24 chars for names, 300 for disputes).
- **Em Dash Removal** - All user-visible em dashes removed from UI text (title, headers, toggles, footer, feedback labels, quote attributions, question/answer text in data.js). Replaced with hyphens, colons, commas, or rephrased.

### Changes
- Pool count listeners added to both lobby screens for live updates on filter change.
- `filterQuestions()` now accepts optional `character` parameter (3rd arg).
- `selectQuestions()` passes character filter through to pool filtering.
- Server serves `data/tags.json` via GET/POST `/api/tags`.

---

## v1.1.0 - 2025-05-24

### Features
- **Suggestion Box** - Feedback form on home screen (name, email optional; type selector; message). Submits to `/api/feedback` and persists to `data/feedback.json`.
- **Feedback Admin View** - "Submitted Feedback" section in admin Review tab. Displays all entries reverse-chronologically with type badge, sender info, and timestamp.
- **Admin Question Management** - Full CRUD for question bank: add custom questions, edit base questions (stored as overlays), disable/enable individual questions. Question editor modal with tags, distractors, category, difficulty.
- **Admin Tag System** - Per-question tag management via the question editor modal. Tag suggestions datalist. Tags saved to localStorage and synced to `data/tags.json`.
- **Question Edits Persistence** - Edited base questions stored in `data/question-edits.json`. Custom questions in `data/custom-questions.json`. Disabled list in `data/disabled-questions.json`.

### Changes
- Server expanded with 5 new API endpoints: `/api/feedback`, `/api/question-edits`, `/api/custom-questions`, `/api/disabled-questions`, `/api/tags`.
- Admin panel now has tabbed interface (Questions / Review).
- Feedback form validation: 10-1000 char message, email format check, type whitelist.
- Server-side payload size limit (8KB) on feedback submissions.

---

## v1.0.0 - 2025-05-24

### Initial Release
- **Solo Mode** - Single-player trivia with category, difficulty, and question count selection. Hardcore mode (no multiple choice). Score saved to leaderboard.
- **Party Mode** - 2-8 player hot-seat with round-robin turns. Optional speed round (15-second timer, faster = more points). Wager round for tied scores.
- **216 Questions** - 8 categories, 3 difficulty levels (Easy/Medium/Hard), 4 answer options per question.
- **Leaderboard** - Local high scores with player name, score, accuracy, grade, date.
- **Answer History** - Full log of every answered question with player, result, timestamp. Exportable as CSV.
- **Question Rating** - Post-answer 1-10 difficulty rating slider. Ratings persisted to `data/ratings.json`.
- **Dispute System** - Flag incorrect/unclear questions. Disputes stored with question context, player name, and optional rating. Admin can approve or dismiss.
- **Quote Reactions** - 15 correct + 15 incorrect character quotes shown after each answer with attribution and optional citation.
- **Admin Panel** - Password-protected (`dundermifflin`). View/resolve disputes. Sync data buttons.
- **Python Dev Server** - `http.server`-based with JSON API for disputes, ratings, leaderboard persistence. No-cache headers. CORS support.
- **Dunder Mifflin Aesthetic** - Cream/navy/beige color scheme, ruled-paper grid background, serif headings, drop-ceiling texture.
