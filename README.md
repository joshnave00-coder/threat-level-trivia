# Threat Level Trivia
### *Dunder Mifflin Paper Company, Inc., Scranton Branch*

> "Would I rather be feared or loved? Easy. Both. I want people to be afraid of how much they love me." - Michael Scott

A browser-based trivia game for fans of *The Office* (US). Test your knowledge of Scranton's finest, solo or with a group.

---

## Features

- **Solo Mode** - Play through a custom set of questions with category, difficulty, and question-count options. Optional Hardcore Mode hides multiple choice so you have to recall the answer yourself.
- **Party Mode** - 2-8 players take turns answering questions on one screen. Includes an optional Speed Round (faster answers = more points) and a Wager Round for tied players.
- **Leaderboard** - Top solo scores are saved locally as Employee Records.
- **Question Rating & Disputes** - Rate individual question difficulty after answering, or flag a question if something seems wrong.
- **Admin Panel** - Password-protected. Review disputed questions, manage tags, and read submitted feedback.
- **Suggestion Box** - Players can submit feedback and feature requests directly from the home screen.
- **Quote Callouts** - Contextual character quotes appear after every answer (correct or not).

---

## Running Locally

**Requirements:** Python 3 (no third-party packages needed)

```bash
python server.py
```

Then open **http://localhost:3000** in your browser.

The server handles both static file serving and a small JSON API that persists game data (disputes, ratings, leaderboard, feedback) to a local `data/` folder. That folder is created automatically on first run and is gitignored, so it stays on your machine.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript (no frameworks) |
| Backend | Python 3 using `http.server` from the standard library |
| Data | JSON files in `data/` (local only, gitignored) |
| State | `localStorage` for in-session game state |

No build step. No npm. No dependencies to install.

---

## Question Bank

Questions live in `js/data.js`, a plain JavaScript array of 110+ questions across 8 categories:

- Characters
- Episodes & Events
- Quotes
- Behind the Scenes
- Relationships & Romance
- Music & Performances
- Locations & Miscellaneous
- Cold Opens & Running Gags

---

## Hosting

Designed to deploy on any VPS (Hostinger, Akamai, etc.) behind a **Cloudflare Tunnel** for free HTTPS. Point a subdomain (e.g. `trivia.yourdomain.com`) at the tunnel and no reverse proxy config is required.

---

*Dunder Mifflin, Inc. © Scranton, PA - "Limitless paper in a paperless world."*
