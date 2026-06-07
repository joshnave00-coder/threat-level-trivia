#!/usr/bin/env python3
"""
Threat Level Trivia - Local Dev Server
Serves static files AND persists dispute feedback to data/disputes.json
so flagged questions are captured in the project folder for review.
"""

import json
import os
import random
import re
import secrets
import threading
import time
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

BASE_DIR         = os.path.dirname(os.path.abspath(__file__))
DATA_DIR         = os.path.join(BASE_DIR, 'data')
DISPUTES_FILE           = os.path.join(DATA_DIR, 'disputes.json')
RATINGS_FILE            = os.path.join(DATA_DIR, 'ratings.json')
TAGS_FILE               = os.path.join(DATA_DIR, 'tags.json')
LEADERBOARD_FILE        = os.path.join(DATA_DIR, 'leaderboard.json')
FEEDBACK_FILE           = os.path.join(DATA_DIR, 'feedback.json')
QUESTION_EDITS_FILE     = os.path.join(DATA_DIR, 'question-edits.json')
CUSTOM_QUESTIONS_FILE   = os.path.join(DATA_DIR, 'custom-questions.json')
DISABLED_QUESTIONS_FILE = os.path.join(DATA_DIR, 'disabled-questions.json')
VOTES_FILE              = os.path.join(DATA_DIR, 'votes.json')
SUGGESTIONS_FILE        = os.path.join(DATA_DIR, 'question-suggestions.json')
DELETED_QUESTIONS_FILE  = os.path.join(DATA_DIR, 'deleted-questions.json')
SITE_SETTINGS_FILE      = os.path.join(DATA_DIR, 'site-settings.json')
CHALLENGES_FILE         = os.path.join(DATA_DIR, 'challenges.json')
CHALLENGE_SCORES_FILE   = os.path.join(DATA_DIR, 'challenge-scores.json')
ANSWER_STATS_FILE       = os.path.join(DATA_DIR, 'answer-stats.json')
DAILY_STATS_FILE        = os.path.join(DATA_DIR, 'daily-stats.json')

_CHALLENGE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
_CHALLENGE_CODE_LEN   = 6

# Serializes read-modify-write on answer-stats.json. The server is a
# ThreadingHTTPServer, so concurrent players answering at the same time would
# otherwise race and lose increments. All access to the stats file is guarded
# by this lock.
_stats_lock = threading.Lock()

# Serializes read-modify-write on daily-stats.json. Same reasoning as
# _stats_lock above: concurrent visitors answering the daily question on
# the same day would otherwise race and lose entries.
_daily_lock = threading.Lock()

# Serializes read-modify-write on the player-mutable data files
# (disputes, votes, ratings). These used to be overwritten wholesale from
# every client - both players adding new items and admins changing
# statuses POSTed the entire array - which meant any concurrent writer
# would clobber the other side's changes (admin approval lost when a
# player filed a new dispute, vice versa, etc). The current handlers do
# per-item mutations server-side under this lock, so two writes on the
# same file can't race anymore.
_player_data_lock = threading.Lock()

os.makedirs(DATA_DIR, exist_ok=True)


def _load_env():
    """Load .env file into os.environ without overwriting existing vars."""
    env_path = os.path.join(BASE_DIR, '.env')
    if not os.path.exists(env_path):
        return
    with open(env_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, v = line.split('=', 1)
                os.environ.setdefault(k.strip(), v.strip())


_load_env()
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', '')
_active_tokens = set()   # in-memory session tokens; cleared on password change

_NOT_FOUND_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>404 - Page Not Found | Threat Level Trivia</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      background: #f2ede4;
      background-image:
        repeating-linear-gradient(0deg, transparent, transparent 29px, #ccc5b8 29px, #ccc5b8 30px),
        repeating-linear-gradient(90deg, transparent, transparent 29px, #ccc5b8 29px, #ccc5b8 30px);
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      font-family: Georgia, 'Times New Roman', serif; color: #2a2a2a; padding: 2rem;
    }
    .card {
      background: #fff; border: 1px solid #c5bdb0; border-radius: 8px;
      padding: 2.5rem 2rem; max-width: 440px; width: 100%; text-align: center;
      box-shadow: 0 2px 12px rgba(0,0,0,0.09);
    }
    .card-header {
      background: #1c3a5e; color: #fff;
      margin: -2.5rem -2rem 1.75rem; padding: 1rem 2rem;
      border-radius: 8px 8px 0 0;
      font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase;
    }
    .error-num { font-size: 5rem; font-weight: 700; color: #1c3a5e; line-height: 1; }
    .error-label { font-size: 1.05rem; color: #3a3a3a; margin: 0.5rem 0 1.25rem; }
    .quote {
      font-style: italic; color: #6b6b6b; font-size: 0.88rem; line-height: 1.6;
      border-left: 3px solid #c5bdb0; text-align: left; padding: 0.6rem 0.9rem;
      margin-bottom: 1.75rem; background: #f9f6f1; border-radius: 0 4px 4px 0;
    }
    .quote cite { display: block; margin-top: 0.4rem; font-style: normal; font-size: 0.8rem; color: #a8a094; }
    .btn {
      display: inline-block; padding: 0.65rem 1.6rem;
      background: #1c3a5e; color: #fff; text-decoration: none;
      border-radius: 4px; font-size: 0.9rem; font-family: inherit; letter-spacing: 0.02em;
    }
    .btn:hover { background: #254d7c; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card-header">Dunder Mifflin Paper Company: Threat Level Trivia</div>
    <div class="error-num">404</div>
    <p class="error-label">This page does not exist.</p>
    <blockquote class="quote">
      "I want you to know that this is not your fault. This page not existing is nobody's fault,
      except possibly the fault of whoever typed that URL."
      <cite>- Michael Scott (probably)</cite>
    </blockquote>
    <a href="/" class="btn">Return to the Office</a>
  </div>
</body>
</html>
"""


class TLTHandler(SimpleHTTPRequestHandler):

    def do_GET(self):
        parsed = urlparse(self.path)
        p = parsed.path
        if p == '/api/disputes':
            self._serve_file(DISPUTES_FILE)
        elif p == '/api/ratings':
            self._serve_file(RATINGS_FILE)
        elif p == '/api/tags':
            self._serve_file(TAGS_FILE)
        elif p == '/api/leaderboard':
            self._serve_file(LEADERBOARD_FILE)
        elif p == '/api/feedback':
            self._serve_file(FEEDBACK_FILE)
        elif p == '/api/question-edits':
            self._serve_file(QUESTION_EDITS_FILE)
        elif p == '/api/custom-questions':
            self._serve_file(CUSTOM_QUESTIONS_FILE)
        elif p == '/api/disabled-questions':
            self._serve_file(DISABLED_QUESTIONS_FILE)
        elif p == '/api/votes':
            self._serve_file(VOTES_FILE)
        elif p == '/api/question-suggestions':
            self._serve_file(SUGGESTIONS_FILE)
        elif p == '/api/deleted-questions':
            self._serve_file(DELETED_QUESTIONS_FILE)
        elif p == '/api/site-settings':
            self._serve_file(SITE_SETTINGS_FILE)
        elif p == '/api/challenges':
            self._serve_challenge(parse_qs(parsed.query))
        elif p == '/api/challenge-scores':
            self._serve_challenge_scores(parse_qs(parsed.query))
        elif p == '/api/answer-stats':
            self._serve_file(ANSWER_STATS_FILE)
        elif p == '/api/daily-stats':
            self._serve_file(DAILY_STATS_FILE)
        elif p in ('/nave', '/nave/'):
            self._serve_index()
        else:
            super().do_GET()

    def end_headers(self):
        self._set_no_cache()
        super().end_headers()

    def do_POST(self):
        if self.path == '/api/admin/login':
            self._handle_admin_login()
        elif self.path == '/api/feedback':
            # Admin token => full-array overwrite (used to remove entries).
            # Otherwise it's a player submission (single append).
            if self.headers.get('X-Admin-Token', '') in _active_tokens:
                self._save_file(FEEDBACK_FILE)
            else:
                self._save_feedback()
        elif self.path == '/api/question-suggestions':
            if self.headers.get('X-Admin-Token', '') in _active_tokens:
                self._save_file(SUGGESTIONS_FILE)
            else:
                self._save_question_suggestion()
        elif self.path == '/api/challenges':
            self._create_challenge()
        elif self.path == '/api/challenge-scores':
            self._submit_challenge_score()
        elif self.path == '/api/answer-stats':
            # Player-generated: increment a question's correct/wrong counter.
            self._record_answer_stat()
        elif self.path == '/api/daily-stats':
            # Player-generated: record one visitor's daily-question result.
            self._record_daily_stat()
        elif self.path == '/api/admin/answer-stats/reset':
            if not self._check_admin_token():
                return
            self._reset_answer_stats()
        elif self.path == '/api/disputes':
            # Player path only: append one new dispute.
            # Admin status changes / deletes go through the per-item
            # /api/admin/disputes/* endpoints below so they can't clobber
            # concurrent player adds (and vice versa).
            self._append_dispute()
        elif self.path == '/api/votes':
            # Player path only: cast or change one vote. Server dedupes by
            # (player, questionId) on insert so a player flipping their
            # vote replaces their prior one instead of stacking.
            self._append_vote()
        elif self.path == '/api/ratings':
            # Player path only: append one new rating.
            self._append_rating()
        elif self.path == '/api/admin/disputes/status':
            if not self._check_admin_token():
                return
            self._admin_update_dispute_status()
        elif self.path == '/api/admin/disputes/delete':
            if not self._check_admin_token():
                return
            self._admin_delete_dispute()
        elif self.path == '/api/admin/ratings/reset':
            if not self._check_admin_token():
                return
            self._admin_reset_ratings_for_question()
        elif self.path == '/api/admin/votes/reset':
            if not self._check_admin_token():
                return
            self._admin_reset_votes_for_question()
        elif self.path == '/api/leaderboard/submit':
            self._save_leaderboard_entry()
        elif self.path == '/api/admin/leaderboard/remove':
            if not self._check_admin_token():
                return
            self._remove_leaderboard_entry()
        elif self.path in ('/api/tags', '/api/leaderboard',
                           '/api/question-edits', '/api/custom-questions',
                           '/api/disabled-questions', '/api/deleted-questions',
                           '/api/site-settings'):
            if not self._check_admin_token():
                return
            file_map = {
                '/api/tags':               TAGS_FILE,
                '/api/leaderboard':        LEADERBOARD_FILE,
                '/api/question-edits':     QUESTION_EDITS_FILE,
                '/api/custom-questions':   CUSTOM_QUESTIONS_FILE,
                '/api/disabled-questions': DISABLED_QUESTIONS_FILE,
                '/api/deleted-questions':  DELETED_QUESTIONS_FILE,
                '/api/site-settings':      SITE_SETTINGS_FILE,
            }
            self._save_file(file_map[self.path])
        else:
            self.send_error(404, 'Not found')

    def do_OPTIONS(self):
        self.send_response(200)
        self._set_cors()
        self.end_headers()

    # ── helpers ────────────────────────────────────────────────────

    def _set_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token')

    def _set_no_cache(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')

    def _send_json(self, code, obj):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(body)

    def _serve_index(self):
        idx = os.path.join(BASE_DIR, 'index.html')
        with open(idx, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(body)

    def _check_admin_token(self):
        token = self.headers.get('X-Admin-Token', '')
        if token and token in _active_tokens:
            return True
        self._send_json(401, {'ok': False, 'error': 'Unauthorized'})
        return False

    def _handle_admin_login(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length)
            data = json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            self.send_error(400, 'Invalid JSON')
            return

        if not ADMIN_PASSWORD:
            self._send_json(500, {'ok': False, 'error': 'Server has no admin password configured'})
            return

        if data.get('password') == ADMIN_PASSWORD:
            token = secrets.token_hex(32)
            _active_tokens.add(token)
            self._send_json(200, {'ok': True, 'token': token})
        else:
            self._send_json(401, {'ok': False})

    def _serve_file(self, path):
        try:
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    body = f.read().encode('utf-8')
            else:
                # Tags and edits are stored as objects {}, everything else as []
                body = b'{}' if path in (TAGS_FILE, QUESTION_EDITS_FILE, SITE_SETTINGS_FILE, ANSWER_STATS_FILE, DAILY_STATS_FILE) else b'[]'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            # Admin-managed lists (deleted/disabled/edits) MUST never be cached
            # by browsers or Cloudflare. Without these headers, an admin deletion
            # can take hours to reach players whose tabs cached the prior list.
            self._set_no_cache()
            self._set_cors()
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            self.send_error(500, str(e))

    def _save_file(self, path):
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw = self.rfile.read(length)
            data = json.loads(raw)
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    def _remove_leaderboard_entry(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw    = self.rfile.read(min(length, 256))
            data   = json.loads(raw)
            entry_id = data.get('id')
            if entry_id is None:
                self.send_error(400, 'id required')
                return
            if os.path.exists(LEADERBOARD_FILE):
                with open(LEADERBOARD_FILE, 'r', encoding='utf-8') as f:
                    entries = json.load(f)
                if not isinstance(entries, list):
                    entries = []
            else:
                entries = []
            entries = [e for e in entries if e.get('id') != entry_id]
            with open(LEADERBOARD_FILE, 'w', encoding='utf-8') as f:
                json.dump(entries, f, indent=2, ensure_ascii=False)
            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    def _save_leaderboard_entry(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 2048:
                self.send_error(413, 'Payload too large')
                return
            raw  = self.rfile.read(min(length, 2048))
            data = json.loads(raw)

            name       = str(data.get('name')     or '').strip()[:30]
            score      = data.get('score')
            total      = data.get('total')
            category   = str(data.get('category') or 'All Categories').strip()[:60]
            difficulty = str(data.get('difficulty') or '').strip()
            date_str   = str(data.get('date')      or '').strip()[:32]
            exclude_bts = bool(data.get('excludeBts'))

            if not name:
                self.send_error(400, 'Name required')
                return
            if not isinstance(score, int) or not isinstance(total, int):
                self.send_error(400, 'Invalid score')
                return
            if total < 25 or difficulty not in ('Medium', 'Hard'):
                self.send_error(400, 'Does not meet qualification requirements')
                return
            if not (0 <= score <= 25):
                self.send_error(400, 'Score out of range')
                return

            accuracy = round((score / total) * 100)

            if os.path.exists(LEADERBOARD_FILE):
                with open(LEADERBOARD_FILE, 'r', encoding='utf-8') as f:
                    entries = json.load(f)
                if not isinstance(entries, list):
                    entries = []
            else:
                entries = []

            entries.append({
                'id':         int(__import__('time').time() * 1000),
                'name':       name,
                'score':      score,
                'total':      total,
                'accuracy':   accuracy,
                'category':   category,
                'difficulty': difficulty,
                'excludeBts': exclude_bts,
                'date':       date_str,
            })

            # Rank key (best first), used to decide which entries survive the
            # per-tier cap and the on-disk order:
            #   1. higher score first
            #   2. full bank before Behind-the-Scenes-excluded
            #   3. most recent first (id is a ms timestamp set at save time, so
            #      a newer run outranks an older one on an otherwise-equal score)
            def rank_key(e):
                return (-e.get('score', 0),
                        1 if e.get('excludeBts') else 0,
                        -e.get('id', 0))

            # Keep up to 100 per difficulty tier (Medium / Hard) instead of 100
            # overall, so a strong Medium run is never bumped off by Hard runs.
            # When a tier overflows, the lowest-ranked entries (lower score, then
            # BTS-excluded, then oldest) are the ones dropped.
            entries.sort(key=rank_key)
            # Each difficulty tier DISPLAYS its top 100 (enforced client-side).
            # Storage retains more than that: every displayed entry, plus the
            # next-best overflow, up to an overall cap of 300 total. Overflow
            # entries are saved but hidden from the public board (the admin view
            # flags them "in reserve"); if the per-tier display limit is raised
            # later, these older scores flow back in instead of being lost.
            DISPLAY_PER_TIER = 100
            STORAGE_CAP      = 300
            tier_counts = {'Hard': 0, 'Medium': 0}
            displayed, overflow = [], []
            for e in entries:
                d = e.get('difficulty')
                if d in tier_counts and tier_counts[d] < DISPLAY_PER_TIER:
                    tier_counts[d] += 1
                    displayed.append(e)
                else:
                    overflow.append(e)
            # Keep all displayed entries + as many of the best overflow as fit
            # under the overall cap. `overflow` is already in rank order, so the
            # slice takes the highest-ranked reserve entries and drops the rest.
            entries = displayed + overflow[:max(0, STORAGE_CAP - len(displayed))]

            with open(LEADERBOARD_FILE, 'w', encoding='utf-8') as f:
                json.dump(entries, f, indent=2, ensure_ascii=False)

            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    # ── ANSWER STATS ───────────────────────────────────────────────
    # Per-question correct/wrong tallies, aggregated across every player.
    # Stored as { "<questionId>": {"correct": N, "wrong": M} }.

    def _load_answer_stats(self):
        """Read the stats object. Caller must hold _stats_lock for writes."""
        if os.path.exists(ANSWER_STATS_FILE):
            try:
                with open(ANSWER_STATS_FILE, 'r', encoding='utf-8') as f:
                    stats = json.load(f)
                if isinstance(stats, dict):
                    return stats
            except (json.JSONDecodeError, ValueError, OSError):
                pass
        return {}

    def _record_answer_stat(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 256:
                self.send_error(413, 'Payload too large')
                return
            raw  = self.rfile.read(min(length, 256))
            data = json.loads(raw)

            qid     = data.get('questionId')
            correct = data.get('correct')
            # questionId must be an int; correct must be a real bool (note that
            # bool is a subclass of int, so check bool explicitly).
            if not isinstance(qid, int) or isinstance(qid, bool):
                self.send_error(400, 'questionId (int) required')
                return
            if not isinstance(correct, bool):
                self.send_error(400, 'correct (bool) required')
                return

            key = str(qid)
            with _stats_lock:
                stats = self._load_answer_stats()
                entry = stats.get(key)
                if not isinstance(entry, dict):
                    entry = {'correct': 0, 'wrong': 0}
                entry['correct'] = int(entry.get('correct', 0)) + (1 if correct else 0)
                entry['wrong']   = int(entry.get('wrong', 0))   + (0 if correct else 1)
                stats[key] = entry
                # Atomic write: write to a temp file then replace, so a crash
                # mid-write can't corrupt the stats file.
                tmp = ANSWER_STATS_FILE + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(stats, f, indent=2, ensure_ascii=False)
                os.replace(tmp, ANSWER_STATS_FILE)

            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    # -- DAILY QUESTION STATS -----------------------------------------
    # Anonymous per-visitor records of how each visitor did on the daily
    # question. Each visitor has a localStorage-generated ID. Storage:
    #   { "<YYYY-MM-DD>": {
    #       "questionId": <int>,
    #       "responses": { "<visitorId>": {
    #           "correct": bool, "streak": int, "longest": int,
    #           "submittedAt": "<ISO>"
    #       } }
    #   } }
    # A visitor re-posting the same day overwrites their entry (defensive;
    # the client locks the UI after one submission).

    _DAILY_DATE_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
    _DAILY_VID_RE  = re.compile(r'^[A-Za-z0-9_-]{6,64}$')

    def _load_daily_stats(self):
        """Read the daily-stats object. Caller must hold _daily_lock for writes."""
        if os.path.exists(DAILY_STATS_FILE):
            try:
                with open(DAILY_STATS_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    return data
            except (json.JSONDecodeError, ValueError, OSError):
                pass
        return {}

    def _record_daily_stat(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 1024:
                self.send_error(413, 'Payload too large')
                return
            raw  = self.rfile.read(min(length, 1024))
            data = json.loads(raw)

            date_str   = str(data.get('date') or '').strip()
            qid        = data.get('questionId')
            correct    = data.get('correct')
            visitor_id = str(data.get('visitorId') or '').strip()
            streak     = data.get('streak')
            longest    = data.get('longest')

            if not self._DAILY_DATE_RE.match(date_str):
                self.send_error(400, 'date (YYYY-MM-DD) required')
                return
            if not isinstance(qid, int) or isinstance(qid, bool):
                self.send_error(400, 'questionId (int) required')
                return
            if not isinstance(correct, bool):
                self.send_error(400, 'correct (bool) required')
                return
            if not self._DAILY_VID_RE.match(visitor_id):
                self.send_error(400, 'visitorId required')
                return
            if not isinstance(streak, int) or isinstance(streak, bool) or streak < 0 or streak > 100000:
                self.send_error(400, 'streak (int) required')
                return
            if not isinstance(longest, int) or isinstance(longest, bool) or longest < 0 or longest > 100000:
                self.send_error(400, 'longest (int) required')
                return

            with _daily_lock:
                stats = self._load_daily_stats()
                day = stats.get(date_str)
                if not isinstance(day, dict):
                    day = {'questionId': qid, 'responses': {}}
                if 'responses' not in day or not isinstance(day.get('responses'), dict):
                    day['responses'] = {}
                day['responses'][visitor_id] = {
                    'correct':     correct,
                    'streak':      streak,
                    'longest':     longest,
                    'submittedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                }
                # Keep the canonical questionId for this date once set; first
                # writer wins so later mismatches (e.g. clock skew) don't
                # rewrite history.
                if 'questionId' not in day:
                    day['questionId'] = qid
                stats[date_str] = day

                # Atomic write: temp file then replace, so a crash mid-write
                # can't corrupt the stats file.
                tmp = DAILY_STATS_FILE + '.tmp'
                with open(tmp, 'w', encoding='utf-8') as f:
                    json.dump(stats, f, indent=2, ensure_ascii=False)
                os.replace(tmp, DAILY_STATS_FILE)

            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    # -- DISPUTES / VOTES / RATINGS (concurrent-safe RMW) -------------
    # All three files used to be overwritten wholesale from every client.
    # Now players append one item at a time and admins mutate by id, so
    # two concurrent writers can't lose each other's changes. Every read-
    # modify-write goes through _player_data_lock + atomic temp+replace.

    @staticmethod
    def _load_list_file(path):
        if not os.path.exists(path):
            return []
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            return data if isinstance(data, list) else []
        except (json.JSONDecodeError, ValueError, OSError):
            return []

    @staticmethod
    def _atomic_write_json(path, data):
        tmp = path + '.tmp'
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)

    def _read_json_body(self, max_len=8192):
        length = int(self.headers.get('Content-Length', 0))
        if length > max_len:
            self.send_error(413, 'Payload too large')
            return None
        raw = self.rfile.read(min(length, max_len))
        try:
            return json.loads(raw)
        except (json.JSONDecodeError, ValueError):
            self.send_error(400, 'Invalid JSON')
            return None

    def _append_dispute(self):
        data = self._read_json_body()
        if data is None:
            return
        # Tolerate the legacy {single: <obj>} envelope just in case a
        # stale client is still in someone's tab; otherwise treat the
        # body itself as the dispute object.
        item = data.get('single') if isinstance(data, dict) and 'single' in data else data
        if not isinstance(item, dict):
            self.send_error(400, 'Dispute object required')
            return

        question_id = item.get('questionId')
        dispute_text = str(item.get('disputeText') or '').strip()[:500]
        player       = str(item.get('player') or '').strip()[:60]
        if not isinstance(question_id, int) or isinstance(question_id, bool):
            self.send_error(400, 'questionId (int) required')
            return
        if not dispute_text:
            self.send_error(400, 'disputeText required')
            return

        entry = {
            'id':               int(item.get('id') or time.time() * 1000),
            'questionId':       question_id,
            'question':         str(item.get('question') or '')[:500],
            'answer':           str(item.get('answer') or '')[:500],
            'category':         str(item.get('category') or '')[:60],
            'disputeText':      dispute_text,
            'player':           player or 'Anonymous',
            'difficultyRating': item.get('difficultyRating') if isinstance(item.get('difficultyRating'), int) else None,
            'timestamp':        str(item.get('timestamp') or time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()))[:64],
            'status':           'open',
        }

        with _player_data_lock:
            disputes = self._load_list_file(DISPUTES_FILE)
            # If a client retries the same submission (network blip), the
            # id collision keeps us idempotent rather than double-filing.
            if any(d.get('id') == entry['id'] for d in disputes):
                self._send_json(200, {'ok': True, 'duplicate': True})
                return
            disputes.append(entry)
            self._atomic_write_json(DISPUTES_FILE, disputes)
        self._send_json(200, {'ok': True})

    def _admin_update_dispute_status(self):
        data = self._read_json_body(max_len=512)
        if data is None:
            return
        entry_id = data.get('id')
        status   = data.get('status')
        if not isinstance(entry_id, int):
            self.send_error(400, 'id (int) required')
            return
        if status not in ('open', 'approved', 'dismissed'):
            self.send_error(400, 'status must be open|approved|dismissed')
            return
        with _player_data_lock:
            disputes = self._load_list_file(DISPUTES_FILE)
            found = False
            for d in disputes:
                if d.get('id') == entry_id:
                    d['status'] = status
                    found = True
                    break
            if not found:
                self._send_json(404, {'ok': False, 'error': 'Dispute not found'})
                return
            self._atomic_write_json(DISPUTES_FILE, disputes)
        self._send_json(200, {'ok': True})

    def _admin_delete_dispute(self):
        data = self._read_json_body(max_len=256)
        if data is None:
            return
        entry_id = data.get('id')
        if not isinstance(entry_id, int):
            self.send_error(400, 'id (int) required')
            return
        with _player_data_lock:
            disputes = self._load_list_file(DISPUTES_FILE)
            filtered = [d for d in disputes if d.get('id') != entry_id]
            self._atomic_write_json(DISPUTES_FILE, filtered)
        self._send_json(200, {'ok': True})

    def _append_vote(self):
        data = self._read_json_body(max_len=2048)
        if data is None:
            return
        item = data.get('single') if isinstance(data, dict) and 'single' in data else data
        if not isinstance(item, dict):
            self.send_error(400, 'Vote object required')
            return

        question_id = item.get('questionId')
        vote        = item.get('vote')
        player      = str(item.get('player') or '').strip()[:60]
        if not isinstance(question_id, int) or isinstance(question_id, bool):
            self.send_error(400, 'questionId (int) required')
            return
        if vote not in ('up', 'down'):
            self.send_error(400, "vote must be 'up' or 'down'")
            return
        if not player:
            self.send_error(400, 'player required')
            return

        entry = {
            'id':         int(item.get('id') or time.time() * 1000),
            'questionId': question_id,
            'question':   str(item.get('question') or '')[:500],
            'category':   str(item.get('category') or '')[:60],
            'vote':       vote,
            'player':     player,
            'timestamp':  str(item.get('timestamp') or time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()))[:64],
        }

        with _player_data_lock:
            votes = self._load_list_file(VOTES_FILE)
            # One vote per (player, question): if this player already
            # voted on this question, drop the old one so the new vote
            # replaces it rather than stacking.
            votes = [v for v in votes if not (v.get('questionId') == question_id and v.get('player') == player)]
            votes.append(entry)
            self._atomic_write_json(VOTES_FILE, votes)
        self._send_json(200, {'ok': True})

    def _admin_reset_votes_for_question(self):
        data = self._read_json_body(max_len=256)
        if data is None:
            return
        question_id = data.get('questionId')
        if not isinstance(question_id, int):
            self.send_error(400, 'questionId (int) required')
            return
        with _player_data_lock:
            votes = self._load_list_file(VOTES_FILE)
            filtered = [v for v in votes if v.get('questionId') != question_id]
            self._atomic_write_json(VOTES_FILE, filtered)
        self._send_json(200, {'ok': True})

    def _append_rating(self):
        data = self._read_json_body(max_len=2048)
        if data is None:
            return
        item = data.get('single') if isinstance(data, dict) and 'single' in data else data
        if not isinstance(item, dict):
            self.send_error(400, 'Rating object required')
            return

        question_id = item.get('questionId')
        rating      = item.get('rating')
        player      = str(item.get('player') or '').strip()[:60]
        if not isinstance(question_id, int) or isinstance(question_id, bool):
            self.send_error(400, 'questionId (int) required')
            return
        if not isinstance(rating, int) or isinstance(rating, bool) or rating < 1 or rating > 10:
            self.send_error(400, 'rating must be int 1-10')
            return
        if not player:
            self.send_error(400, 'player required')
            return

        entry = {
            'id':         int(item.get('id') or time.time() * 1000),
            'questionId': question_id,
            'question':   str(item.get('question') or '')[:500],
            'answer':     str(item.get('answer') or '')[:500],
            'category':   str(item.get('category') or '')[:60],
            'difficulty': str(item.get('difficulty') or '')[:32],
            'rating':     rating,
            'player':     player,
            'timestamp':  str(item.get('timestamp') or time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime()))[:64],
        }

        with _player_data_lock:
            ratings = self._load_list_file(RATINGS_FILE)
            ratings.append(entry)
            self._atomic_write_json(RATINGS_FILE, ratings)
        self._send_json(200, {'ok': True})

    def _admin_reset_ratings_for_question(self):
        data = self._read_json_body(max_len=256)
        if data is None:
            return
        question_id = data.get('questionId')
        if not isinstance(question_id, int):
            self.send_error(400, 'questionId (int) required')
            return
        with _player_data_lock:
            ratings = self._load_list_file(RATINGS_FILE)
            filtered = [r for r in ratings if r.get('questionId') != question_id]
            self._atomic_write_json(RATINGS_FILE, filtered)
        self._send_json(200, {'ok': True})

    def _reset_answer_stats(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw  = self.rfile.read(min(length, 256)) if length else b''
            data = json.loads(raw) if raw else {}

            with _stats_lock:
                stats = self._load_answer_stats()
                if data.get('all'):
                    stats = {}
                else:
                    qid = data.get('questionId')
                    if qid is None:
                        self.send_error(400, 'questionId or all required')
                        return
                    stats.pop(str(qid), None)
                with open(ANSWER_STATS_FILE, 'w', encoding='utf-8') as f:
                    json.dump(stats, f, indent=2, ensure_ascii=False)

            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    def _save_feedback(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 8192:
                self.send_error(413, 'Payload too large')
                return
            raw    = self.rfile.read(min(length, 8192))
            data   = json.loads(raw)

            name     = str(data.get('name')    or '').strip()[:60]
            email    = str(data.get('email')   or '').strip()[:100]
            fb_type  = str(data.get('type')    or 'general').strip()
            message  = str(data.get('message') or '').strip()
            sent_at  = str(data.get('submittedAt') or '').strip()[:32]

            # Validate message (required, 10-1000 chars)
            if not (10 <= len(message) <= 1000):
                self.send_error(400, 'Message length out of range')
                return

            # Validate email format if provided
            if email and not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]{2,}$', email):
                self.send_error(400, 'Invalid email format')
                return

            # Restrict type to known values
            if fb_type not in ('general', 'suggestion', 'bug', 'question', 'other'):
                fb_type = 'general'

            # Load existing entries and append
            if os.path.exists(FEEDBACK_FILE):
                with open(FEEDBACK_FILE, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
            else:
                existing = []

            existing.append({
                'name':        name  or None,
                'email':       email or None,
                'type':        fb_type,
                'message':     message,
                'submittedAt': sent_at,
            })

            with open(FEEDBACK_FILE, 'w', encoding='utf-8') as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)

            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    def _save_question_suggestion(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 8192:
                self.send_error(413, 'Payload too large')
                return
            raw  = self.rfile.read(min(length, 8192))
            data = json.loads(raw)

            submitter   = str(data.get('submitter') or '').strip()[:60]
            question    = str(data.get('question') or '').strip()[:500]
            answer      = str(data.get('answer') or '').strip()[:200]
            distractors = data.get('distractors') or []
            category    = data.get('category') or None
            difficulty  = data.get('difficulty') or None
            context     = str(data.get('context') or '').strip()[:1000]
            sent_at     = str(data.get('submittedAt') or '').strip()[:32]

            if not question or len(question) < 10:
                self.send_error(400, 'Question too short')
                return
            if not answer:
                self.send_error(400, 'Answer required')
                return

            # Distractors are optional now; sanitize whatever was provided
            if isinstance(distractors, list):
                distractors = [str(d).strip()[:200] for d in distractors if str(d).strip()]
            else:
                distractors = []

            # Category and difficulty are optional; validate if provided
            valid_categories = [
                'Characters', 'Episodes & Events', 'Quotes', 'Behind the Scenes',
                'Relationships & Romance', 'Music & Performances',
                'Locations & Miscellaneous', 'Cold Opens & Running Gags',
            ]
            if category and str(category).strip() not in valid_categories:
                category = None
            if difficulty and str(difficulty).strip() not in ('Easy', 'Medium', 'Hard'):
                difficulty = None

            if os.path.exists(SUGGESTIONS_FILE):
                with open(SUGGESTIONS_FILE, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
            else:
                existing = []

            existing.append({
                'submitter':   submitter or None,
                'question':    question,
                'answer':      answer,
                'distractors': distractors if distractors else None,
                'category':    category,
                'difficulty':  difficulty,
                'context':     context or None,
                'status':      'pending',
                'submittedAt': sent_at,
            })

            with open(SUGGESTIONS_FILE, 'w', encoding='utf-8') as f:
                json.dump(existing, f, indent=2, ensure_ascii=False)

            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    # -- CHALLENGE HELPERS (async multiplayer) -------------------------

    @staticmethod
    def _load_challenges():
        if not os.path.exists(CHALLENGES_FILE):
            return {}
        try:
            with open(CHALLENGES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}

    @staticmethod
    def _save_challenges(data):
        with open(CHALLENGES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    @staticmethod
    def _load_challenge_scores():
        if not os.path.exists(CHALLENGE_SCORES_FILE):
            return []
        try:
            with open(CHALLENGE_SCORES_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return []

    @staticmethod
    def _save_challenge_scores(data):
        with open(CHALLENGE_SCORES_FILE, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

    @staticmethod
    def _gen_code(existing_codes):
        for _ in range(20):
            code = ''.join(random.choice(_CHALLENGE_CODE_CHARS) for _ in range(_CHALLENGE_CODE_LEN))
            if code not in existing_codes:
                return code
        # Fallback: 7-char code if collisions happen
        return ''.join(random.choice(_CHALLENGE_CODE_CHARS) for _ in range(_CHALLENGE_CODE_LEN + 1))

    def _create_challenge(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 16384:
                self.send_error(413, 'Payload too large')
                return
            raw  = self.rfile.read(min(length, 16384))
            data = json.loads(raw)

            creator_name = str(data.get('creatorName') or '').strip()[:30]
            config       = data.get('config', {})
            question_ids = data.get('questionIds', [])

            if not creator_name:
                self._send_json(400, {'ok': False, 'error': 'Name required'})
                return
            if not isinstance(question_ids, list) or not question_ids:
                self._send_json(400, {'ok': False, 'error': 'No questions provided'})
                return
            if len(question_ids) > 50:
                question_ids = question_ids[:50]

            # Sanitize config
            safe_config = {}
            for k in ('category', 'difficulty', 'character', 'count', 'speedRound', 'speedSecs'):
                if k in config:
                    safe_config[k] = config[k]

            challenges = self._load_challenges()
            code = self._gen_code(set(challenges.keys()))

            entry = {
                'code':         code,
                'creatorName':  creator_name,
                'config':       safe_config,
                'questionIds':  [int(q) for q in question_ids],
                'createdAt':    time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }

            challenges[code] = entry
            self._save_challenges(challenges)
            self._send_json(200, {'ok': True, 'code': code, 'challenge': entry})
        except Exception as e:
            self.send_error(500, str(e))

    def _serve_challenge(self, query):
        codes = query.get('code', [])
        code = codes[0].strip().upper() if codes else ''
        if not code:
            self._send_json(400, {'error': 'code parameter required'})
            return
        try:
            challenges = self._load_challenges()
            entry = challenges.get(code)
            if not entry:
                self._send_json(404, {'error': 'Challenge not found'})
                return
            self._send_json(200, entry)
        except Exception as e:
            self.send_error(500, str(e))

    def _submit_challenge_score(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            if length > 16384:
                self.send_error(413, 'Payload too large')
                return
            raw  = self.rfile.read(min(length, 16384))
            data = json.loads(raw)

            code         = str(data.get('code') or '').strip().upper()
            name         = str(data.get('name') or '').strip()[:30]
            score        = data.get('score', 0)
            total        = data.get('total', 0)
            correct_count = data.get('correctCount', 0)
            is_creator   = bool(data.get('isCreator', False))

            if not code or not name:
                self._send_json(400, {'ok': False, 'error': 'code and name required'})
                return

            challenges = self._load_challenges()
            if code not in challenges:
                self._send_json(404, {'ok': False, 'error': 'Challenge not found'})
                return

            entry = {
                'code':         code,
                'name':         name,
                'score':        int(score),
                'total':        int(total),
                'correctCount': int(correct_count),
                'isCreator':    is_creator,
                'submittedAt':  time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            }

            scores = self._load_challenge_scores()
            scores.append(entry)

            # Cap at 500 entries per challenge to keep files bounded.
            code_entries = [s for s in scores if s.get('code') == code]
            if len(code_entries) > 500:
                scores = [s for s in scores if s.get('code') != code] + code_entries[-500:]

            self._save_challenge_scores(scores)
            self._send_json(200, {'ok': True})
        except Exception as e:
            self.send_error(500, str(e))

    def _serve_challenge_scores(self, query):
        codes = query.get('code', [])
        code = codes[0].strip().upper() if codes else ''
        if not code:
            self._send_json(400, {'error': 'code parameter required'})
            return
        try:
            scores = self._load_challenge_scores()
            matching = [s for s in scores if s.get('code') == code]
            self._send_json(200, {'scores': matching})
        except Exception as e:
            self.send_error(500, str(e))

    def send_error(self, code, message=None, explain=None):
        if code == 404:
            self._serve_404()
        else:
            super().send_error(code, message, explain)

    def _serve_404(self):
        body = _NOT_FOUND_PAGE.encode('utf-8')
        self.send_response(404)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._set_cors()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        # Show API calls; suppress chatty static-file logs.
        # NOTE: for normal request logging args[0] is the request line (a str),
        # but send_error()/log_error() call this with args[0] = status code (an
        # int). Guard against that so an error response never crashes the
        # handler thread on `'/api/' in path`.
        path = args[0] if args else ''
        if not isinstance(path, str):
            path = ''
        if '/api/' in path or self.path.startswith('/api/'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(BASE_DIR)   # serve files relative to project root
    server = ThreadingHTTPServer(('', 3000), TLTHandler)
    print('Threat Level Trivia running at http://localhost:3000')
    print('Dispute feedback will be saved to data/disputes.json')
    server.serve_forever()
