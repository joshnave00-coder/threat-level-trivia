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
  if (id === 'screen-solo-name') renderSoloStickyNote();
  if (window.location.pathname.replace(/\/+$/, '').toLowerCase() === '/nave' && id !== 'screen-admin') {
    try { history.replaceState({}, '', '/'); } catch {}
  }
}

// ── SOLO NAME-SCREEN STICKY NOTE ─────────────────────────────────
// Drops a random community-contribution nudge on the Post-it.
// Picker lives in data.js (pickStickyNote) and never repeats the
// previously-shown note back-to-back.
function renderSoloStickyNote() {
  const el = document.getElementById('solo-sticky-text');
  if (el) el.textContent = pickStickyNote();
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
// Score-tier quote reactions for results screens.
// Each tier holds an array; we pick one at random so replays feel fresh.
const SCORE_QUOTE_TIERS = [
  // 100%
  { min: 100, quotes: [
    { line: 'I am Beyonce, always.', who: 'Michael Scott' },
    { line: 'I DECLARE... PERFECTION.', who: 'Michael Scott' },
    { line: 'You couldn\'t have done that better if you planned it.', who: 'Andy Bernard' }
  ]},
  // 90-99%
  { min: 90, quotes: [
    { line: 'Bears. Beets. Battlestar Galactica.', who: 'Jim Halpert' },
    { line: 'I\'m fast. To give you a reference point, I\'m somewhere between a snake and a mongoose.', who: 'Dwight Schrute' },
    { line: 'Boom. Roasted.', who: 'Michael Scott' }
  ]},
  // 70-89%
  { min: 70, quotes: [
    { line: 'I\'m not superstitious, but I am a little stitious.', who: 'Michael Scott' },
    { line: 'Sometimes I\'ll start a sentence and I don\'t even know where it\'s going. I just hope I find it along the way.', who: 'Michael Scott' },
    { line: 'I am running away from my responsibilities. And it feels good.', who: 'Michael Scott' }
  ]},
  // 50-69%
  { min: 50, quotes: [
    { line: 'Well, well, well, how the turntables...', who: 'Michael Scott' },
    { line: 'I\'m not usually a praying man, but if you\'re up there, please save me, Superman.', who: 'Homer Simpson... wait, wrong show. Michael Scott' },
    { line: 'Webster\'s Dictionary defines wedding as "the fusing of two metals with a hot torch."', who: 'Michael Scott' }
  ]},
  // 30-49%
  { min: 30, quotes: [
    { line: 'I DECLARE BANKRUPTCY!', who: 'Michael Scott' },
    { line: 'Why are you the way that you are?', who: 'Michael Scott' },
    { line: 'I knew exactly what to do. But in a much more real sense, I had no idea what to do.', who: 'Michael Scott' }
  ]},
  // 10-29%
  { min: 10, quotes: [
    { line: 'NOOO! GOD! NOOO! GOD PLEASE NO!', who: 'Michael Scott' },
    { line: 'Oh, the chili\'s ready!', who: 'Kevin Malone' },
    { line: 'It is your birthday.', who: 'Dwight Schrute' }
  ]},
  // 0-9%
  { min: 0, quotes: [
    { line: 'You couldn\'t handle my undivided attention.', who: 'Kelly Kapoor' },
    { line: 'I\'m not to be reckoned with.', who: 'Michael Scott' },
    { line: 'How would I describe myself? Three words. Hard-working. Alpha male. Jackhammer. Merciless. Insatiable.', who: 'Dwight Schrute' }
  ]}
];

function pickScoreQuote(pct) {
  const tier = SCORE_QUOTE_TIERS.find(t => pct >= t.min) || SCORE_QUOTE_TIERS[SCORE_QUOTE_TIERS.length - 1];
  const q = tier.quotes[Math.floor(Math.random() * tier.quotes.length)];
  return q;
}

function renderScoreQuote(elId, pct) {
  const el = document.getElementById(elId);
  if (!el) return;
  const q = pickScoreQuote(pct);
  el.innerHTML = `<span class="results-quote-line">"${escHtml(q.line)}"</span><span class="results-quote-who">- ${escHtml(q.who)}</span>`;
}

function renderSoloResults(player) {
  const answers = player.answers;
  const correct = answers.filter(a => a.wasCorrect).length;
  const total   = answers.length;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;
  const grade   = getGrade(pct);

  document.getElementById('results-player-name').textContent = player.name;
  // Show "Excluded Behind the Scenes" under the player's name when they
  // opted out of that category for this run, so the score isn't quietly
  // assumed to have been drawn from the full question bank.
  const btsNoteEl = document.getElementById('results-bts-note');
  if (btsNoteEl) btsNoteEl.classList.toggle('hidden', !GameState.config.excludeBts);
  document.getElementById('results-score-big').textContent   = `${correct} / ${total}`;
  document.getElementById('results-accuracy').textContent    = `${pct}% Accuracy`;
  document.getElementById('results-grade').textContent       = `${grade.emoji} ${grade.label}`;
  renderScoreQuote('results-quote', pct);

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

  // Suggestion nudge - show ~40% of the time to encourage question submissions
  const nudgeEl = document.getElementById('results-suggest-nudge');
  if (nudgeEl) nudgeEl.classList.toggle('hidden', Math.random() > 0.4);

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
// Cached server response so the difficulty filter can re-render the list
// without re-fetching. Refreshed every time the user enters the screen.
let _cachedLeaderboard = null;

function renderLeaderboard() {
  const el = document.getElementById('leaderboard-list');
  el.innerHTML = '<p class="empty-state">' + escHtml(pickLoadingQuip()) + '</p>';

  fetch('/api/leaderboard')
    .then(r => r.json())
    .then(entries => {
      _cachedLeaderboard = Array.isArray(entries) ? entries : [];
      renderLeaderboardList();
    })
    .catch(() => {
      _cachedLeaderboard = null;
      el.innerHTML = '<p class="empty-state">Could not load records. Please try again.</p>';
    });
}

// Within a single difficulty tier, rank by: higher score first, then full
// bank before Behind-the-Scenes-excluded, then most recent (id is a ms
// timestamp set server-side at save time, so newer runs win an otherwise-equal
// tie - this rewards players who keep coming back).
function _lbRankCmp(a, b) {
  return ((b.score || 0) - (a.score || 0))
      || ((a.excludeBts ? 1 : 0) - (b.excludeBts ? 1 : 0))
      || ((b.id || 0) - (a.id || 0));
}
// Public board shows the top 100 of one difficulty tier, ranked.
const LB_DISPLAY_PER_TIER = 100;
function _lbTopOfTier(entries, tier) {
  return entries.filter(e => e.difficulty === tier).sort(_lbRankCmp).slice(0, LB_DISPLAY_PER_TIER);
}

// Renders the cached list applying the current difficulty filter.
// Called on initial load AND whenever the user changes the dropdown.
function renderLeaderboardList() {
  const el = document.getElementById('leaderboard-list');
  if (!el || !_cachedLeaderboard) return;

  const filterEl = document.getElementById('lb-filter-difficulty');
  const filter = filterEl ? filterEl.value : 'all';

  let entries;
  if (filter !== 'all') {
    // Per-difficulty view: that tier only, ranked, top 100.
    entries = _lbTopOfTier(_cachedLeaderboard, filter);
  } else {
    // Combined "All" view: Hard always ranks above Medium (separate ladders,
    // not blended by score). Take the top 100 of EACH tier explicitly and
    // stack Hard then Medium. Capping each tier (rather than slicing the whole
    // list) keeps reserve entries - storage now holds up to 300 - off the
    // public board even when a tier has more than 100 saved.
    entries = [..._lbTopOfTier(_cachedLeaderboard, 'Hard'),
               ..._lbTopOfTier(_cachedLeaderboard, 'Medium')];
  }

  if (!entries.length) {
    const msg = filter === 'all'
      ? 'No records yet. Complete 25 Medium or Hard questions to get on the board.'
      : `No ${filter} records yet. Be the first.`;
    el.innerHTML = `<p class="empty-state">${msg}</p>`;
    return;
  }

  const total = entries.length;
  el.innerHTML = entries.map((e, i) => {
    const rank = i + 1;
    const title = getRankTitle(rank, total);
    // When a player excluded Behind the Scenes, show that in the meta line
    // where the category normally sits (replaces "All Categories" etc.) so
    // the score isn't assumed to have come from the full question bank.
    const categoryLabel = e.excludeBts
      ? '<span class="lb-bts-note" title="This player excluded the Behind the Scenes category, so their score wasn\'t drawn from the full question bank.">Excluded Behind the Scenes</span>'
      : escHtml(e.category);
    return `
    <div class="lb-row ${rank === 1 ? 'lb-top' : ''}">
      <span class="lb-rank" title="${escHtml(title)}">${rank}</span>
      <span class="lb-name-wrap">
        <span class="lb-name">${escHtml(e.name)}</span>
      </span>
      <span class="lb-score">${e.score}/25</span>
      <span class="lb-pct">${e.accuracy}%</span>
      <span class="lb-meta">${escHtml(e.difficulty)} &middot; ${categoryLabel} &middot; ${escHtml(e.date)}</span>
    </div>`;
  }).join('');
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

// ── IDENTITY THEFT DETECTOR ──────────────────────────────────────
// Watches a name input. When the typed value matches an Office cast name,
// fires Dwight's classic line. Fires once per matched name per input
// (so users don't get spammed if they keep typing the same name).
const CAST_NAMES = [
  // First names
  'michael','jim','pam','dwight','andy','kevin','angela','oscar','stanley',
  'kelly','ryan','toby','phyllis','meredith','creed','erin','holly','jan',
  'roy','karen','nellie','gabe','robert','david','mose','todd','packer',
  'darryl','clark','pete','val','cathy','charles','deangelo','nate','hank',
  'astrid','cece','philip','jada',
  // Last names
  'scott','halpert','beesly','schrute','bernard','malone','martin','martinez',
  'hudson','kapoor','howard','flenderson','vance','palmer','bratton','hannon',
  'flax','levinson','anderson','wallace','california','packer','philbin',
  'lipton','miner','baumgartner',
  // Common full names
  'michael scott','jim halpert','pam beesly','dwight schrute','andy bernard',
  'kevin malone','angela martin','toby flenderson','kelly kapoor','ryan howard',
  'stanley hudson','phyllis vance','meredith palmer','creed bratton',
  'erin hannon','holly flax','jan levinson','robert california','david wallace',
  'todd packer','darryl philbin','nellie bertram','gabe lewis','roy anderson',
  'karen filippelli','michael scarn'
];
const CAST_NAME_SET = new Set(CAST_NAMES.map(n => n.toLowerCase()));

// ── LEADERBOARD RANK TITLES (hover) ──────────────────────────────
// Maps a numeric rank to a Dunder Mifflin corporate title. Used as the
// tooltip on the rank number in leaderboard rows. Last-place gets Toby.
function getRankTitle(rank, total) {
  if (total > 0 && rank === total && total > 3) return 'Toby';
  if (rank === 1)  return 'Regional Manager';
  if (rank === 2)  return 'Assistant Regional Manager';
  if (rank === 3)  return 'Assistant to the Regional Manager';
  if (rank <= 10)  return 'Sales';
  if (rank <= 25)  return 'Quality Assurance';
  return 'Temp';
}

// ── LOADING-STATE QUIPS ──────────────────────────────────────────
// Random tongue-in-cheek loading messages. Fans pick up on them fast.
const LOADING_QUIPS = [
  'Stanley is doing the crossword...',
  'Calling David Wallace...',
  'Toby is sighing...',
  'Phyllis is sorting...',
  'Cooling the printers...',
  'Waiting on Creed...',
  'Asking Kevin to recount...',
  'Faxing Corporate...',
  'Holly is on the line...',
  'Dwight is doing a full inventory...',
  'Andy is warming up his vocals...',
  'Meredith is taking a long lunch...',
  'Pam is filing this...',
  'Jim is moving Dwight\'s desk again...'
];
function pickLoadingQuip() {
  return LOADING_QUIPS[Math.floor(Math.random() * LOADING_QUIPS.length)];
}

// ── ROTATING NAME PLACEHOLDERS ───────────────────────────────────
// Pool of cast and alter-egos. Picked at random on page load and assigned
// to all visible name inputs. Deep cuts get the screenshots.
const NAME_PLACEHOLDERS = [
  'e.g. Bill Buttlicker',
  'e.g. Michael Scarn',
  'e.g. Date Mike',
  'e.g. Prison Mike',
  'e.g. Mose Schrute',
  'e.g. Andy "Boner Champ" Bernard',
  'e.g. Goldenface',
  'e.g. Michael Klump',
  'e.g. Dwigt',
  'e.g. The Scranton Strangler',
  'e.g. Lord Aldgers Crisp',
  'e.g. Big Tuna',
  'e.g. Mr. Brown (Diversity Day)',
  'e.g. Caleb Crawdad',
  'e.g. Agent Michael Scarn'
];
function pickNamePlaceholder() {
  return NAME_PLACEHOLDERS[Math.floor(Math.random() * NAME_PLACEHOLDERS.length)];
}
function applyRotatingPlaceholder(inputEl) {
  if (!inputEl) return;
  inputEl.placeholder = pickNamePlaceholder();
}

function attachIdentityTheftWatch(inputEl) {
  if (!inputEl || inputEl._identityTheftBound) return;
  inputEl._identityTheftBound = true;
  let lastFiredName = null;
  inputEl.addEventListener('input', () => {
    const v = inputEl.value.trim().toLowerCase();
    if (!v) { lastFiredName = null; return; }
    if (v === lastFiredName) return;
    if (CAST_NAME_SET.has(v)) {
      lastFiredName = v;
      showToast('Identity theft is not a joke, Jim! Millions of families suffer every year!', 3500);
    }
  });
}
