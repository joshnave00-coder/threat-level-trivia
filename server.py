#!/usr/bin/env python3
"""
Threat Level Trivia — Local Dev Server
Serves static files AND persists dispute feedback to data/disputes.json
so flagged questions are captured in the project folder for review.
"""

import json
import os
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler

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

os.makedirs(DATA_DIR, exist_ok=True)


class TLTHandler(SimpleHTTPRequestHandler):

    def do_GET(self):
        p = self.path.split('?')[0]
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
        else:
            super().do_GET()

    def end_headers(self):
        # Attach no-cache headers to every response before flushing headers
        self._set_no_cache()
        super().end_headers()

    def do_POST(self):
        if self.path == '/api/disputes':
            self._save_file(DISPUTES_FILE)
        elif self.path == '/api/ratings':
            self._save_file(RATINGS_FILE)
        elif self.path == '/api/tags':
            self._save_file(TAGS_FILE)
        elif self.path == '/api/leaderboard':
            self._save_file(LEADERBOARD_FILE)
        elif self.path == '/api/feedback':
            self._save_feedback()
        elif self.path == '/api/question-edits':
            self._save_file(QUESTION_EDITS_FILE)
        elif self.path == '/api/custom-questions':
            self._save_file(CUSTOM_QUESTIONS_FILE)
        elif self.path == '/api/disabled-questions':
            self._save_file(DISABLED_QUESTIONS_FILE)
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
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _set_no_cache(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')

    def _serve_file(self, path):
        try:
            if os.path.exists(path):
                with open(path, 'r', encoding='utf-8') as f:
                    body = f.read().encode('utf-8')
            else:
                # Tags and edits are stored as objects {}, everything else as []
                body = b'{}' if path in (TAGS_FILE, QUESTION_EDITS_FILE) else b'[]'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
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
            resp = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self._set_cors()
            self.end_headers()
            self.wfile.write(resp)
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

            # Validate message (required, 10–1000 chars)
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

            resp = b'{"ok":true}'
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(resp)))
            self._set_cors()
            self.end_headers()
            self.wfile.write(resp)
        except Exception as e:
            self.send_error(500, str(e))

    def log_message(self, fmt, *args):
        # Show API calls; suppress chatty static-file logs
        path = args[0] if args else ''
        if '/api/' in path or self.path.startswith('/api/'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.chdir(BASE_DIR)   # serve files relative to project root
    server = HTTPServer(('', 3000), TLTHandler)
    print('Threat Level Trivia running at http://localhost:3000')
    print('Dispute feedback will be saved to data/disputes.json')
    server.serve_forever()
