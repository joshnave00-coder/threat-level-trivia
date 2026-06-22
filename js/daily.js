'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Question of the Day
   Deterministic daily question, streak tracking, anonymous server log.
   Lives entirely separate from Solo/Party/Challenge game state so it
   never touches GameState or trips into a normal game flow.
   ================================================================ */

// Fixed launch date. Day 0 = the day this feature shipped. The index into
// the question bank is (today - launch) in whole local days, so every
// visitor on the same calendar day sees the same question.
const DAILY_LAUNCH_DATE = '2026-06-06';

const DAILY_KEYS = {
  state:     'tlt_daily_state',      // { current, longest, lastAnsweredDate, lastCorrectDate, history: [...] }
  visitorId: 'tlt_daily_visitor_id', // anonymous persistent ID
};

// ── DATE HELPERS ─────────────────────────────────────────────────
// All comparisons run in the user's local time so "midnight reset" lines
// up with their calendar day, not UTC.

function _localDateStr(d = new Date()) {
  // YYYY-MM-DD in local time. toISOString() would give UTC and shift the
  // reset for anyone west of GMT.
  const yr  = d.getFullYear();
  const mo  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${day}`;
}

function _parseLocalDate(yyyymmdd) {
  // 'YYYY-MM-DD' -> Date at local midnight (avoids UTC offset surprises).
  const [y, m, d] = yyyymmdd.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

function _daysBetween(fromStr, toStr) {
  // Whole-day difference between two local-date strings.
  const a = _parseLocalDate(fromStr);
  const b = _parseLocalDate(toStr);
  return Math.round((b - a) / 86400000);
}

function _todayIndex() {
  // Day 0 = launch day. Clamps to >= 0 so any clock-skewed early visit
  // still resolves to the first question rather than going negative.
  return Math.max(0, _daysBetween(DAILY_LAUNCH_DATE, _localDateStr()));
}

// ── VISITOR ID ───────────────────────────────────────────────────
// Anonymous persistent ID for cross-visit retention metrics. Generated
// once per browser, stored in localStorage. Not tied to any name/email.
function getDailyVisitorId() {
  let id = localStorage.getItem(DAILY_KEYS.visitorId);
  if (id && /^[A-Za-z0-9_-]{6,64}$/.test(id)) return id;
  // 16 random base36 chars: enough entropy to be effectively unique
  // without needing crypto for this analytics-only use case.
  id = '';
  while (id.length < 16) {
    id += Math.random().toString(36).slice(2);
  }
  id = id.slice(0, 16);
  localStorage.setItem(DAILY_KEYS.visitorId, id);
  return id;
}

// ── DAILY STATE (streak + history) ───────────────────────────────

function _defaultDailyState() {
  return {
    current:          0,
    longest:          0,
    totalCorrect:     0,    // lifetime count of correct Questions of the Day
    lastAnsweredDate: null,
    lastCorrectDate:  null,
    history:          [],   // [{ date, questionId, correct }]
  };
}

function getDailyState() {
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_KEYS.state));
    if (raw && typeof raw === 'object') {
      const state = Object.assign(_defaultDailyState(), raw, {
        history: Array.isArray(raw.history) ? raw.history : [],
      });
      // Backfill totalCorrect for states saved before this field existed,
      // so existing players keep their lifetime tally. Derived from history
      // (capped at 365 entries, so this is a floor for very old accounts).
      if (typeof raw.totalCorrect !== 'number') {
        state.totalCorrect = state.history.filter(h => h.correct).length;
      }
      return state;
    }
  } catch {}
  return _defaultDailyState();
}

function _saveDailyState(state) {
  localStorage.setItem(DAILY_KEYS.state, JSON.stringify(state));
}

// Roll forward the streak if the user has missed a day. Called on render
// so a stale streak doesn't show as "current" when the user is actually
// 2+ days behind. Returns the (possibly-mutated) state.
function _decayStreakIfStale(state) {
  if (!state.lastCorrectDate) return state;
  const today = _localDateStr();
  if (state.lastCorrectDate === today) return state;
  const yesterday = _localDateStr(new Date(Date.now() - 86400000));
  if (state.lastCorrectDate === yesterday) return state;
  // Last correct answer was 2+ days ago: streak is broken.
  if (state.current !== 0) {
    state.current = 0;
    _saveDailyState(state);
  }
  return state;
}

// Apply a result to local state. Streak rules:
//   - Correct, last correct = yesterday  -> increment current streak
//   - Correct, last correct = today      -> no-op (shouldn't happen; UI locks)
//   - Correct, gap > 1 day or no prior   -> reset current to 1
//   - Wrong                              -> reset current to 0
function _applyDailyResult(state, dateStr, questionId, correct) {
  if (correct) {
    const yesterday = _localDateStr(new Date(_parseLocalDate(dateStr).getTime() - 86400000));
    if (state.lastCorrectDate === yesterday) {
      state.current = (state.current || 0) + 1;
    } else if (state.lastCorrectDate !== dateStr) {
      state.current = 1;
    }
    state.lastCorrectDate = dateStr;
    if (state.current > (state.longest || 0)) state.longest = state.current;
    state.totalCorrect = (state.totalCorrect || 0) + 1;
  } else {
    state.current = 0;
  }
  state.lastAnsweredDate = dateStr;
  state.history.push({ date: dateStr, questionId, correct });
  // Cap history at 365 entries: a year of plays is plenty for personal
  // review and keeps localStorage healthy.
  if (state.history.length > 365) {
    state.history.splice(0, state.history.length - 365);
  }
  _saveDailyState(state);
  return state;
}

// ── DAILY QUESTION POOL ──────────────────────────────────────────
// Eligible pool = base bank + admin-approved custom questions, minus
// anything deleted or disabled. Sorted by ID for a stable order across
// all visitors. We index into this pool with the days-since-launch
// counter, modulo pool length, so the same date always maps to the
// same question.
//
// We deliberately do NOT filter out Behind the Scenes here. The daily
// is one curated question per day and the variety is welcome; if a
// particular BTS day feels off, an admin can disable that specific
// question and the next day's question slot stays stable.
function _eligibleDailyPool() {
  const deleted  = getDeletedQuestions();
  const disabled = getDisabledQuestions();
  const blocked  = new Set([...deleted, ...disabled]);
  const base     = QUESTIONS.map(q => getEffectiveQuestion(q));
  const custom   = getCustomQuestions();
  return [...base, ...custom]
    .filter(q => !blocked.has(q.id))
    .sort((a, b) => a.id - b.id);
}

function getDailyQuestion() {
  const pool = _eligibleDailyPool();
  if (!pool.length) return null;
  const idx = _todayIndex() % pool.length;
  return pool[idx];
}

// ── SERVER REPORTING ─────────────────────────────────────────────
// Fire-and-forget: anonymous record of (date, questionId, correct,
// visitorId, streak, longest) so admins can see retention across all
// users. localStorage stays the source of truth for the user's own UI.
function _reportDailyResultToServer(dateStr, question, correct, state) {
  fetch('/api/daily-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      date:       dateStr,
      questionId: question.id,
      correct:    !!correct,
      visitorId:  getDailyVisitorId(),
      streak:     state.current || 0,
      longest:    state.longest || 0,
    }),
  }).catch(() => {});
}

// ── SHARE ────────────────────────────────────────────────────────
// Wordle-style spoiler-free share text. Emoji squares show the last
// 7 days (oldest first) so a streak reads visually without giving
// away today's question or answer.

function _buildDailyShareText(correct, state) {
  const dayNum = _todayIndex() + 1;
  const byDate = {};
  state.history.forEach(h => { byDate[h.date] = h.correct; });
  let week = '';
  for (let i = 6; i >= 0; i--) {
    const d = _localDateStr(new Date(Date.now() - i * 86400000));
    if (!(d in byDate))  week += '⬜';      // no play that day
    else if (byDate[d])  week += '\u{1F7E9}';   // correct
    else                 week += '\u{1F7E5}';   // wrong
  }
  const lines = [
    `Threat Level Trivia #${dayNum}`,
    `Question of the Day: ${correct ? '✅' : '❌'}`,
  ];
  const cur = state.current || 0;
  if (cur > 1) lines.push(`\u{1F525} ${cur}-day streak`);
  lines.push(week);
  lines.push('');
  lines.push('https://threatleveltrivia.com');
  return lines.join('\n');
}

// ── RENDERING ────────────────────────────────────────────────────

let _dailyOptionsCache = [];   // shuffled options for today (cached so re-render keeps same order)
let _dailyOptionsForId = null; // which question id the cache belongs to

function _dailyOptionsFor(question) {
  // Re-use a stable shuffle for today's question. Without this, hover
  // states or re-renders would re-shuffle the answer order mid-view.
  if (_dailyOptionsForId === question.id && _dailyOptionsCache.length) {
    return _dailyOptionsCache;
  }
  _dailyOptionsCache = generateMCOptions(question);
  _dailyOptionsForId = question.id;
  return _dailyOptionsCache;
}

// Three-up stats strip: current streak, longest streak, and lifetime
// total correct. Sits just under the navy header on both the prompt and
// result cards so players always see their running totals.
function _statsRow(state) {
  const cur = state.current || 0;
  const lon = state.longest || 0;
  const tot = state.totalCorrect || 0;
  const flame = cur > 0
    ? ' <span class="daily-stat-flame" aria-hidden="true">&#128293;</span>'
    : '';
  return `
    <div class="daily-stats">
      <div class="daily-stat">
        <span class="daily-stat-num">${cur}${flame}</span>
        <span class="daily-stat-label">Current streak</span>
      </div>
      <div class="daily-stat">
        <span class="daily-stat-num">${lon}</span>
        <span class="daily-stat-label">Longest streak</span>
      </div>
      <div class="daily-stat">
        <span class="daily-stat-num">${tot}</span>
        <span class="daily-stat-label">Total correct</span>
      </div>
    </div>
  `;
}

function renderDailyQuestion() {
  const root = document.getElementById('daily-question');
  if (!root) return;

  const question = getDailyQuestion();
  if (!question) {
    // No eligible questions at all: hide the module rather than render an
    // empty card. Re-checked on each page load, so re-enabling questions
    // brings the module back without any code change.
    root.classList.add('hidden');
    return;
  }
  root.classList.remove('hidden');

  // Refresh stale streak (missed a day) before computing display state.
  let state = _decayStreakIfStale(getDailyState());

  const today = _localDateStr();
  const alreadyAnswered = state.lastAnsweredDate === today;
  const todayEntry = alreadyAnswered
    ? state.history[state.history.length - 1]
    : null;

  if (alreadyAnswered && todayEntry && todayEntry.questionId === question.id) {
    _renderDailyResultCard(root, question, todayEntry.correct, state);
  } else {
    _renderDailyPromptCard(root, question, state);
  }
}

function _renderDailyPromptCard(root, question, state) {
  const options = _dailyOptionsFor(question);
  root.innerHTML = `
    <div class="daily-card">
      <div class="daily-header">
        <span class="daily-eyebrow">Question of the Day</span>
      </div>
      ${_statsRow(state)}
      <p class="daily-q-text">${escHtml(question.question)}</p>
      <div class="daily-options" id="daily-options">
        ${options.map((opt, i) => `
          <button class="daily-option" data-idx="${i}" data-answer="${escHtml(opt)}">${escHtml(opt)}</button>
        `).join('')}
      </div>
      <p class="daily-footnote">Resets at your local midnight. One question, one shot.</p>
    </div>
  `;
  root.querySelectorAll('.daily-option').forEach(btn => {
    btn.addEventListener('click', () => _handleDailyAnswerClick(btn, question));
  });
}

function _handleDailyAnswerClick(btn, question) {
  // Guard against double-clicks racing into a second submission.
  if (btn.disabled) return;
  const buttons = document.querySelectorAll('#daily-options .daily-option');
  buttons.forEach(b => b.disabled = true);

  const selected = btn.dataset.answer;
  const correct  = selected === question.answer;

  // Visually mark selection & correct answer so the prompt-to-result
  // transition feels deliberate (~700ms) instead of an abrupt swap.
  buttons.forEach(b => {
    if (b.dataset.answer === question.answer) b.classList.add('daily-option-correct');
    else if (b === btn && !correct) b.classList.add('daily-option-wrong');
  });

  const today  = _localDateStr();
  let state    = getDailyState();
  state        = _applyDailyResult(state, today, question.id, correct);

  // Also bump the global per-question correct/wrong tally so the daily
  // contributes to Answer Stats just like any other play.
  if (typeof recordAnswerStat === 'function') recordAnswerStat(question.id, correct);

  // Report anonymously to the server for the admin retention dashboard.
  _reportDailyResultToServer(today, question, correct, state);

  setTimeout(() => {
    _renderDailyResultCard(document.getElementById('daily-question'), question, correct, state);
  }, 750);
}

function _renderDailyResultCard(root, question, correct, state) {
  const headline = correct
    ? '<span class="daily-result-headline daily-result-correct">&#10003; Correct</span>'
    : '<span class="daily-result-headline daily-result-wrong">&#10007; Not quite</span>';

  root.innerHTML = `
    <div class="daily-card daily-card-result">
      <div class="daily-header">
        <span class="daily-eyebrow">Question of the Day</span>
      </div>
      ${_statsRow(state)}
      <p class="daily-q-text daily-q-text-answered">${escHtml(question.question)}</p>
      <div class="daily-result-row">
        ${headline}
        <span class="daily-result-answer"><span class="daily-result-answer-label">Answer:</span> ${escHtml(question.answer)}</span>
      </div>
      <div class="daily-share-row">
        <button class="btn btn-primary daily-share-btn" id="btn-daily-share">Share result</button>
      </div>
      <p class="daily-comeback">Come back tomorrow to keep the streak alive.</p>
    </div>
  `;
  const shareBtn = root.querySelector('#btn-daily-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => shareOrCopyText(shareBtn, _buildDailyShareText(correct, state)));
  }
}

function initDailyQuestion() {
  // First call materializes the visitor ID so it's set before any later
  // event tries to use it; cheap no-op if already present.
  getDailyVisitorId();
  renderDailyQuestion();
}
