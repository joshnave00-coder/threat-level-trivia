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
- **Dispute System** - Flag a question if the answer seems wrong or the wording is unclear.
- **Suggestion Box** - Submit feedback and feature requests directly from the home screen.

### Admin Panel (password-protected)
- **Questions Tab** - Full question bank management. Add, edit, disable questions. Manage tags.
- **Disputes & Feedback Tab** - Review flagged questions with direct "Edit Question" shortcut. Read submitted feedback.
- **Community Ratings Tab** - View community ratings per question, see which questions are overriding, reset ratings.
- **Question Export** - Export the full question bank as CSV with selectable columns (ID, question, answer, distractors, category, difficulty, tags, type, status, community data).

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

The server handles both static file serving and a small JSON API that persists game data (disputes, ratings, tags, leaderboard, feedback, question edits, custom questions, disabled questions) to a local `data/` folder. That folder is created automatically on first run and is gitignored.

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

216 questions across 8 categories in `js/data.js`:

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
server.py           Python dev server + JSON API endpoints
css/styles.css      All styles (Dunder Mifflin aesthetic)
js/data.js          216 questions, quote reactions, character tags, pause quotes
js/state.js         GameState object, localStorage helpers, persistence
js/questions.js     Filtering, shuffle, MC option generation, grading
js/ui.js            Screen routing, quote callout, results rendering
js/solo.js          Solo game flow + shared renderQuestionScreen()
js/party.js         Party flow, speed timer, wager, countdown, pause
js/admin.js         Admin panel, question editor, export, dispute review
js/feedback.js      Suggestion box form handling
js/app.js           Entry point, all event binding
data/               Server-persisted JSON (gitignored, auto-created)
```

---

## Hosting

Designed to deploy on any VPS behind a **Cloudflare Tunnel** for free HTTPS. Point a subdomain (e.g. `trivia.yourdomain.com`) at the tunnel and no reverse proxy config is required.

---

*Dunder Mifflin, Inc. - Scranton, PA - "Limitless paper in a paperless world."*
