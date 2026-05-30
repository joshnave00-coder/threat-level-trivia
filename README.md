# Threat Level Trivia
### *Dunder Mifflin Paper Company, Inc. - Scranton Branch*

> "Would I rather be feared or loved? Easy. Both. I want people to be afraid of how much they love me." - Michael Scott

A browser-based trivia game for fans of *The Office* (US). Test your knowledge of Scranton's finest, solo or with a group.

**Contact:** threat.level.trivia@gmail.com

---

## Features

### Gameplay
- **Solo Mode** - Play through a custom set of questions with category, difficulty, character, and question-count options. Optional Hardcore Mode hides multiple choice so you have to recall the answer yourself.
- **Party Mode** - 2-8 players take turns answering questions on one screen. Includes:
  - Optional Speed Round with selectable timer (30, 20, or 15 seconds; faster answers earn more points)
  - 3-2-1-GO countdown before each question (only when a speed round is active, so no one peeks early)
  - Equal question distribution (every player always gets the same number of turns)
  - Wager Round for tied players with a 45-second countdown timer
  - Host pause button that hides the question behind a random Office quote
- **Challenge Mode ("Send a Fax to Friends")** - Async multiplayer for friends in different places. Pick your settings (including an optional speed round of 30, 15, or 10 seconds - 10 is "Ludicrous"), hit Create, and you get a shareable "memo" link with a unique 6-character code. Everyone who opens the link plays the exact same questions in the exact same order, with the same answer options. After finishing, every score lands on a shared per-memo leaderboard so you can see exactly how you stack up. Great for group chats, office competitions, and settling debates about who really knows the show.
- **Leaderboard** - The global Employee Records leaderboard tracks top qualifying scores, with an All / Medium / Hard difficulty filter that recomputes ranks for the filtered view.
- **Quote Callouts** - Contextual character quotes appear after every answer (correct or not).

### Filtering & Customization
- **Character Filter** - Filter questions by character (24 characters auto-tagged) in both solo and party lobbies.
- **Category & Difficulty** - Select specific categories and difficulty levels, or play mixed.
- **Live Pool Count** - See how many questions are available for your current filter combo before starting.

### Community & Feedback
- **Question Rating** - Rate individual question difficulty (1-10 scale) after answering.
- **Community Difficulty Override** - When 3+ players rate a question, its displayed difficulty updates to reflect community consensus.
- **Question Feedback / Dispute** - Flag a question if the answer seems wrong, the wording is unclear, or you have any other per-question feedback.
- **Suggestion Box** - Submit general feedback, bug reports, and feature requests directly from the home screen.
- **Submit a Trivia Question** - Players can pitch full trivia questions (question, correct answer, three wrong answers, category, difficulty, optional context) from inside the Suggestion Box. Submissions land in an admin review queue.

### Admin Panel (password-protected)
- **Questions Tab** - Full question bank management. Add, edit, disable, revert, and permanently delete questions. Manage tags. Each card shows the question ID ("Question ID: 123") for cross-referencing, and the same ID appears in the editor modal, on ratings cards, and on dispute cards. The search box has a one-click clear (x) button.
- **Suggested Questions Tab** - Review player-submitted trivia questions. Review & Revise opens each in the question editor for polishing before approval. Defer, reject, or permanently Remove as needed.
- **Flagged Questions Tab** - Review player-submitted disputes with direct "Edit Question" shortcut. Approve or dismiss each flag, then permanently Remove resolved ones.
- **Submitted Feedback Tab** - Read general messages from the Suggestion Box (feedback, bug reports, feature ideas). Each entry can be permanently removed.
- **Community Ratings Tab** - View community ratings per question, see which questions are overriding, reset ratings or votes.
- **Leaderboard Tab** - Remove leaderboard entries with inappropriate usernames or fraudulent scores.
- **Question Export** - Export the full question bank as CSV with selectable columns (ID, question, answer, distractors, category, difficulty, tags, type, status, community data).

### Polish
- Custom themed 404 page
- CSS fade-in transitions between screens
- Privacy/storage notice banner (one-time dismiss)
- Input sanitization on all free-form fields
- Floating scroll-to-top button on long pages (appears after 300px of scroll)
- Office-reference layer woven through the UI: cast-name detection on name inputs, score-based Michael Scott quotes on the results screen, randomized loading messages ("Stanley is doing the crossword..."), rotating Office-themed name-input placeholders, punchy wrong-answer reactions, leaderboard rank tooltips (1 = Regional Manager, last place = Toby), a community-nudge sticky note on the solo name screen, a double-click-the-logo random-quote easter egg, and a set of hidden keyword easter eggs for deep-fan moments
- Smart question rotation: an adaptive recent-question buffer (80% of the active bank) keeps solo sessions from repeating questions until you've worked through most of the bank, and auto-scales as the bank grows

---

## Running Locally

**Requirements:** Python 3 (no third-party packages needed)

```bash
python server.py
```

Then open **http://localhost:3000** in your browser.

The server handles both static file serving and a JSON API that persists game data (disputes, ratings, votes, tags, leaderboard, feedback, question edits, custom questions, disabled questions, deleted questions, question suggestions) to a local `data/` folder. That folder is created automatically on first run and is gitignored. Admin write operations require a session token issued by `/api/admin/login`.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no frameworks) |
| Backend | Python 3 `http.server` (standard library only) |
| Data | JSON files in `data/` (local, gitignored) |
| State | `localStorage` for in-session game state |

No build step. No npm. No dependencies to install.

---

## Question Bank

290+ questions across 8 categories in `js/data.js`:

- Characters
- Episodes & Events
- Quotes
- Behind the Scenes
- Relationships & Romance
- Music & Performances
- Locations & Miscellaneous
- Cold Opens & Running Gags

Questions support admin editing, custom additions, community difficulty ratings, character tagging, and per-question enable/disable.

---

## File Structure

```
index.html          Single-page app (all screens as hidden divs)
server.py           Python dev server + JSON API endpoints + admin auth
css/styles.css      All styles (Dunder Mifflin aesthetic)
js/data.js          290+ questions, quote reactions, character tags, pause quotes
js/state.js         GameState object, localStorage helpers, persistence
js/questions.js     Filtering, shuffle, MC option generation, grading
js/ui.js            Screen routing, quote callout, results rendering, leaderboard
js/solo.js          Solo game flow + shared renderQuestionScreen()
js/party.js         Party flow, speed timer, wager, countdown, pause
js/challenge.js     Challenge Mode (shareable memo links, deterministic question order, per-memo leaderboard)
js/admin.js         Admin panel, question editor, export, dispute review, delete/revert
js/feedback.js      Suggestion box form handling
js/suggestions.js   Player question submission form + admin review queue
js/donate.js        Buy-Me-A-Coffee donate modal
js/app.js           Entry point, all event binding
data/               Server-persisted JSON (gitignored, auto-created):
                      disputes.json, ratings.json, votes.json, tags.json,
                      leaderboard.json, feedback.json, question-edits.json,
                      custom-questions.json, disabled-questions.json,
                      deleted-questions.json, question-suggestions.json,
                      challenges.json, challenge-scores.json
```

---

## Hosting

Designed to deploy on any VPS behind a **Cloudflare Tunnel** for free HTTPS. Point a subdomain (e.g. `trivia.yourdomain.com`) at the tunnel and no reverse proxy config is required.

---

*Dunder Mifflin, Inc. - Scranton, PA - "Limitless paper in a paperless world."*
