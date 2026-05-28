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
  - Optional Speed Round (15-second timer, faster answers earn more points)
  - 3-2-1-GO countdown before each question so no one peeks early
  - Equal question distribution (every player always gets the same number of turns)
  - Wager Round for tied players with a 45-second countdown timer
  - Host pause button that hides the question behind a random Office quote
- **Leaderboard** - Top solo scores are saved locally as Employee Records.
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
- **Questions Tab** - Full question bank management. Add, edit, disable, revert, and permanently delete questions. Manage tags. Each card shows the question ID for cross-referencing.
- **Suggested Questions Tab** - Review player-submitted trivia questions. Review & Revise opens each in the question editor for polishing before approval. Defer or delete as needed.
- **Flagged Questions Tab** - Review player-submitted disputes with direct "Edit Question" shortcut. Approve or dismiss each flag.
- **Submitted Feedback Tab** - Read general messages from the Suggestion Box (feedback, bug reports, feature ideas).
- **Community Ratings Tab** - View community ratings per question, see which questions are overriding, reset ratings or votes.
- **Leaderboard Tab** - Remove leaderboard entries with inappropriate usernames or fraudulent scores.
- **Question Export** - Export the full question bank as CSV with selectable columns (ID, question, answer, distractors, category, difficulty, tags, type, status, community data).
- **Change Password** - Update the server-side admin password.

### Polish
- Custom themed 404 page
- CSS fade-in transitions between screens
- Privacy/storage notice banner (one-time dismiss)
- Input sanitization on all free-form fields

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
js/admin.js         Admin panel, question editor, export, dispute review, delete/revert
js/feedback.js      Suggestion box form handling
js/suggestions.js   Player question submission form + admin review queue
js/donate.js        Buy-Me-A-Coffee donate modal
js/app.js           Entry point, all event binding
data/               Server-persisted JSON (gitignored, auto-created):
                      disputes.json, ratings.json, votes.json, tags.json,
                      leaderboard.json, feedback.json, question-edits.json,
                      custom-questions.json, disabled-questions.json,
                      deleted-questions.json, question-suggestions.json
```

---

## Hosting

Designed to deploy on any VPS behind a **Cloudflare Tunnel** for free HTTPS. Point a subdomain (e.g. `trivia.yourdomain.com`) at the tunnel and no reverse proxy config is required.

---

*Dunder Mifflin, Inc. - Scranton, PA - "Limitless paper in a paperless world."*
