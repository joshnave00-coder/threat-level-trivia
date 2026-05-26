# Changelog

All notable changes to Threat Level Trivia are documented here.

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
