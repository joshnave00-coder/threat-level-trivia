'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — UI Utilities
   Screen routing, quote callout, shared rendering helpers
   ================================================================ */

let quoteTimer = null;

// ── SCREEN NAVIGATION ────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) { target.classList.add('active'); target.scrollTop = 0; }
}

// ── QUOTE CALLOUT ─────────────────────────────────────────────────
function showQuote(wasCorrect) {
  const pool = wasCorrect ? QUOTES.correct : QUOTES.incorrect;
  const q = pool[Math.floor(Math.random() * pool.length)];

  const callout = document.getElementById('quote-callout');
  const textEl  = document.getElementById('quote-text');
  const attrEl  = document.getElementById('quote-attribution');

  textEl.textContent = `"${q.text}"`;
  let attr = `- ${q.character}`;
  if (q.citation) attr += ` (${q.citation})`;
  attrEl.textContent = attr;

  callout.classList.remove('hidden', 'quote-correct', 'quote-incorrect', 'quote-exit');
  callout.classList.add(wasCorrect ? 'quote-correct' : 'quote-incorrect');

  if (quoteTimer) clearTimeout(quoteTimer);
  quoteTimer = setTimeout(dismissQuote, 4000);
}

function dismissQuote() {
  if (quoteTimer) { clearTimeout(quoteTimer); quoteTimer = null; }
  const callout = document.getElementById('quote-callout');
  callout.classList.add('quote-exit');
  setTimeout(() => callout.classList.add('hidden'), 350);
}

// ── DIFFICULTY BADGE COLOR ────────────────────────────────────────
function difficultyClass(d) {
  return d === 'Easy' ? 'badge-easy' : d === 'Medium' ? 'badge-medium' : 'badge-hard';
}

// ── RENDER TAGS IN QUESTION HEADER ───────────────────────────────
function renderQuestionTags(question) {
  const container = document.getElementById('q-tags');
  const tags = getEffectiveTags(question);
  container.innerHTML = tags.length
    ? tags.map(t => `<span class="q-tag">${escHtml(t)}</span>`).join('')
    : '';
}

// ── SOLO RESULTS SCREEN ───────────────────────────────────────────
function renderSoloResults(player) {
  const answers = player.answers;
  const correct = answers.filter(a => a.wasCorrect).length;
  const total   = answers.length;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;
  const grade   = getGrade(pct);

  document.getElementById('results-player-name').textContent = player.name;
  document.getElementById('results-score-big').textContent   = `${correct} / ${total}`;
  document.getElementById('results-accuracy').textContent    = `${pct}% Accuracy`;
  document.getElementById('results-grade').textContent       = `${grade.emoji} ${grade.label}`;

  const statusEl = document.getElementById('results-global-status');
  if (statusEl) {
    const diff = GameState.config.difficulty;
    const qualifies = total >= 25 && (diff === 'Medium' || diff === 'Hard');
    if (qualifies && GameState.globalSubmitted) {
      statusEl.innerHTML = '<p class="results-global-badge results-global-ok">Your score was added to the global Employee Records leaderboard.</p>';
    } else if (qualifies) {
      statusEl.innerHTML = '<p class="results-global-badge results-global-fail">Score qualified but couldn\'t reach the server. Try again later.</p>';
    } else {
      statusEl.innerHTML = '<p class="results-global-badge results-global-info">To qualify for the global Employee Records leaderboard: play 25 questions on Medium or Hard difficulty.</p>';
    }
  }

  const breakdown = computeBreakdown(answers);
  const bdEl = document.getElementById('results-breakdown');
  if (!Object.keys(breakdown).length) { bdEl.innerHTML = ''; return; }
  bdEl.innerHTML = '<h3 class="breakdown-title">Category Breakdown</h3>' +
    Object.entries(breakdown).map(([cat, d]) => {
      const catPct = Math.round((d.correct / d.total) * 100);
      return `<div class="breakdown-row">
        <span class="breakdown-cat">${escHtml(cat)}</span>
        <span class="breakdown-score">${d.correct}/${d.total}</span>
        <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${catPct}%"></div></div>
        <span class="breakdown-pct">${catPct}%</span>
      </div>`;
    }).join('');
}

// ── LEADERBOARD ───────────────────────────────────────────────────
function renderLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  el.innerHTML = '<p class="empty-state">Loading records...</p>';

  fetch('/api/leaderboard')
    .then(r => r.json())
    .then(entries => {
      if (!Array.isArray(entries) || !entries.length) {
        el.innerHTML = '<p class="empty-state">No records yet. Complete 25 Mixed questions to get on the board.</p>';
        return;
      }
      el.innerHTML = entries.map((e, i) => `
        <div class="lb-row ${i === 0 ? 'lb-top' : ''}">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${escHtml(e.name)}</span>
          <span class="lb-score">${e.score}/25</span>
          <span class="lb-pct">${e.accuracy}%</span>
          <span class="lb-meta">${escHtml(e.difficulty)} &middot; ${escHtml(e.category)} &middot; ${escHtml(e.date)}</span>
        </div>`).join('');
    })
    .catch(() => {
      el.innerHTML = '<p class="empty-state">Could not load records. Please try again.</p>';
    });
}

// ── PARTY PODIUM ──────────────────────────────────────────────────
function renderPartyResults(players) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const podiumEl = document.getElementById('podium');
  const fullEl   = document.getElementById('full-standings');

  // Podium (top 3)
  const positions = [1, 0, 2]; // center is 1st
  const podiumHTML = positions.map(pos => {
    const p = sorted[pos];
    if (!p) return `<div class="podium-slot podium-pos-${pos + 1} podium-empty"></div>`;
    const medals = ['🥇','🥈','🥉'];
    return `<div class="podium-slot podium-pos-${pos + 1}">
      <div class="podium-medal">${medals[pos] || ''}</div>
      <div class="podium-name">${escHtml(p.name)}</div>
      <div class="podium-score">${p.score} pts</div>
      <div class="podium-block podium-height-${pos + 1}"></div>
    </div>`;
  }).join('');
  podiumEl.innerHTML = podiumHTML;

  // Full standings
  fullEl.innerHTML = sorted.map((p, i) => `
    <div class="standing-row">
      <span class="standing-rank">${i + 1}.</span>
      <span class="standing-name">${escHtml(p.name)}</span>
      <span class="standing-score">${p.score} pts</span>
      <span class="standing-correct">${p.answers.filter(a=>a.wasCorrect).length}/${p.answers.length} correct</span>
    </div>`).join('');
}

// ── PARTY SCOREBOARD (inline during game) ────────────────────────
function renderPartyScoreboard() {
  const el = document.getElementById('party-scoreboard');
  if (!el) return;
  el.innerHTML = GameState.players.map((p, i) => `
    <div class="ps-row ${i === GameState.currentPlayerIdx ? 'ps-active' : ''}">
      <span class="ps-name">${escHtml(p.name)}</span>
      <span class="ps-score">${p.score}</span>
    </div>`).join('');
}

// ── MISC HELPERS ──────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Strip HTML tags and control characters from user input.
// maxLen defaults to 24 for player names; pass a higher value for longer fields.
function sanitizeName(raw, maxLen = 24) {
  return String(raw)
    .replace(/<[^>]*>/g, '')                // strip HTML/script tags
    .replace(/[ -]/g, '')  // strip control chars (newlines, tabs, nulls)
    .replace(/\s+/g, ' ')                   // collapse whitespace
    .trim()
    .slice(0, maxLen);
}

function showToast(msg, duration = 2500) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('toast-show');
  setTimeout(() => t.classList.remove('toast-show'), duration);
}
