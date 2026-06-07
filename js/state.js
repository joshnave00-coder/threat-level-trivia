'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - State & Storage
   Global game state and all localStorage operations
   ================================================================ */

const STORAGE_KEYS = {
  leaderboard:       'tlt_leaderboard',
  history:           'tlt_history',
  disputes:          'tlt_disputes',
  tags:              'tlt_tags',
  votes:             'tlt_votes',
  questionEdits:     'tlt_question_edits',
  customQuestions:   'tlt_custom_questions',
  disabledQuestions: 'tlt_disabled_questions',
  deletedQuestions:  'tlt_deleted_questions',
};

// Current game state - reset at the start of each game
const GameState = {
  mode: null,           // 'solo' | 'party'
  players: [],          // [{ id, name, score, answers }]
  currentPlayerIdx: 0,
  questions: [],        // filtered + shuffled questions for this game
  currentQIdx: 0,
  config: {
    category: 'all',
    difficulty: 'Mixed',
    count: 10,
    hardcore: false,
    speedRound: false,
  },
  // Speed-round timer internals
  speedInterval: null,
  speedTimeLeft: 0,
  speedMaxTime: 15,
  // Per-question answer state
  answerState: null,    // null | 'revealed' | 'scored'
  selectedAnswer: null,
  wasCorrect: null,
  // Wager round
  wagerQuestion: null,
  wagerAnswers: [],     // [{ playerId, wager, wasCorrect }]
};

function resetGameState() {
  GameState.mode = null;
  GameState.players = [];
  GameState.currentPlayerIdx = 0;
  GameState.questions = [];
  GameState.currentQIdx = 0;
  GameState.config = { category: 'all', difficulty: 'Mixed', count: 10, hardcore: false, speedRound: false };
  if (GameState.speedInterval) { clearInterval(GameState.speedInterval); GameState.speedInterval = null; }
  GameState.speedTimeLeft = 0;
  GameState.answerState = null;
  GameState.selectedAnswer = null;
  GameState.wasCorrect = null;
  GameState.wagerQuestion = null;
  GameState.wagerAnswers = [];
}

// ── LEADERBOARD ───────────────────────────────────────────────────
function getLeaderboard() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.leaderboard)) || []; }
  catch { return []; }
}

function saveLeaderboard(entries) {
  localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(entries));
}

function addLeaderboardEntry(name, score, total, category, difficulty) {
  const entries = getLeaderboard();
  entries.push({
    name, score, total,
    accuracy: total > 0 ? Math.round((score / total) * 100) : 0,
    category: category === 'all' ? 'All Categories' : category,
    difficulty,
    date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  });
  entries.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);
  saveLeaderboard(entries.slice(0, 10));
}

function clearLeaderboard() {
  localStorage.removeItem(STORAGE_KEYS.leaderboard);
}

function loadLeaderboardFromFile() {
  // Global leaderboard is fetched live from the server when the leaderboard screen opens.
}

async function submitGlobalLeaderboardEntry(name, score, total, category, difficulty, excludeBts) {
  try {
    const res = await fetch('/api/leaderboard/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        score,
        total,
        accuracy: total > 0 ? Math.round((score / total) * 100) : 0,
        category: category === 'all' ? 'All Categories' : category,
        difficulty,
        excludeBts: !!excludeBts,
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── HISTORY LOG ───────────────────────────────────────────────────
function getHistory() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.history)) || []; }
  catch { return []; }
}

function logAnswer(playerName, question, wasCorrect, difficultyRating) {
  const history = getHistory();
  history.push({
    player: playerName,
    questionId: question.id,
    question: question.question,
    answer: question.answer,
    category: question.category,
    difficulty: question.difficulty,
    wasCorrect,
    difficultyRating: difficultyRating || null,
    datetime: new Date().toISOString(),
  });
  // Cap at 5000 entries to keep localStorage healthy
  if (history.length > 5000) history.splice(0, history.length - 5000);
  localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
}

function clearHistory() {
  localStorage.removeItem(STORAGE_KEYS.history);
}

function getRecentlySeenIds(limit = 100) {
  const history = getHistory();
  return new Set(history.slice(-limit).map(h => h.questionId));
}

function exportHistory() {
  const history = getHistory();
  if (!history.length) return alert('No answer history to export.');
  const headers = ['Player','Question ID','Question','Answer','Category','Difficulty','Correct','Rating','Date'];
  const rows = history.map(h => [
    h.player, h.questionId, `"${h.question.replace(/"/g,'""')}"`,
    `"${h.answer.replace(/"/g,'""')}"`, h.category, h.difficulty,
    h.wasCorrect ? 'Yes' : 'No', h.difficultyRating ?? '', h.datetime
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `tlt-history-${Date.now()}.csv`; a.click();
}

// ── DISPUTES ──────────────────────────────────────────────────────
function getDisputes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.disputes)) || []; }
  catch { return []; }
}

// Per-item POST to the server. The server appends under a lock so two
// players filing disputes at the same moment can't clobber each other,
// and an admin status change happening in the same window can't be lost
// to a wholesale array overwrite (which is what the old code did).
function _appendDisputeToFile(dispute) {
  fetch('/api/disputes', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(dispute),
  }).catch(() => {});
}

// On startup, load disputes from file and merge into localStorage so
// feedback is never lost even if the browser was cleared.
function loadDisputesFromFile() {
  fetch('/api/disputes')
    .then(r => r.json())
    .then(fileDisputes => {
      if (!Array.isArray(fileDisputes) || !fileDisputes.length) return;
      const local = getDisputes();
      const fileIds = new Set(fileDisputes.map(d => d.id));
      // File is source of truth; append any local-only entries not yet saved
      const merged = [...fileDisputes, ...local.filter(d => !fileIds.has(d.id))];
      localStorage.setItem(STORAGE_KEYS.disputes, JSON.stringify(merged));
    })
    .catch(() => {}); // server not running - use localStorage only
}

function addDispute(question, disputeText, playerName, difficultyRating) {
  const dispute = {
    id: Date.now(),
    questionId: question.id,
    question: question.question,
    answer: question.answer,
    category: question.category,
    disputeText,
    player: playerName,
    difficultyRating: difficultyRating || null,
    timestamp: new Date().toLocaleString('en-US'),
    status: 'open',   // 'open' | 'approved' | 'dismissed'
  };
  // Optimistic local update so the in-session UI feels instant; the
  // server append is the source of truth and is what other devices see.
  const disputes = getDisputes();
  disputes.push(dispute);
  localStorage.setItem(STORAGE_KEYS.disputes, JSON.stringify(disputes));
  _appendDisputeToFile(dispute);
}

// Admin: change a single dispute's status. Goes through a dedicated
// per-id endpoint (server reads, mutates, writes under lock) instead of
// resending the whole array - that's what used to let an admin's
// approval be silently overwritten the next time a player filed a
// dispute or another tab synced.
function updateDisputeStatus(id, status) {
  const disputes = getDisputes();
  const d = disputes.find(x => x.id === id);
  if (d) d.status = status;
  localStorage.setItem(STORAGE_KEYS.disputes, JSON.stringify(disputes));

  const token = sessionStorage.getItem('tlt_admin_token') || '';
  fetch('/api/admin/disputes/status', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body:    JSON.stringify({ id, status }),
  }).then(r => {
    if (!r.ok) console.warn('[disputes] status update failed:', r.status, r.statusText);
  }).catch(err => console.warn('[disputes] status update network error:', err));
}

// Admin: permanently delete a single dispute. Same per-id pattern as
// updateDisputeStatus (server mutates by id under a lock).
function deleteDispute(id) {
  const disputes = getDisputes().filter(x => x.id !== id);
  localStorage.setItem(STORAGE_KEYS.disputes, JSON.stringify(disputes));

  const token = sessionStorage.getItem('tlt_admin_token') || '';
  fetch('/api/admin/disputes/delete', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body:    JSON.stringify({ id }),
  }).then(r => {
    if (!r.ok) console.warn('[disputes] delete failed:', r.status, r.statusText);
  }).catch(err => console.warn('[disputes] delete network error:', err));
}

// Refresh disputes from the server file and overwrite localStorage. The
// admin dispute panel calls this before render so an admin always sees
// the current server state, not whatever stale view their localStorage
// last cached. Returns a promise so callers can await it.
function reloadDisputesFromFile() {
  return fetch('/api/disputes', { cache: 'no-store' })
    .then(r => r.json())
    .then(fileDisputes => {
      if (Array.isArray(fileDisputes)) {
        localStorage.setItem(STORAGE_KEYS.disputes, JSON.stringify(fileDisputes));
      }
    })
    .catch(() => {});
}

// ── RATINGS ───────────────────────────────────────────────────────
function getRatings() {
  try { return JSON.parse(localStorage.getItem('tlt_ratings')) || []; }
  catch { return []; }
}

function addRating(question, rating, playerName) {
  const entry = {
    id: Date.now(),
    questionId: question.id,
    question: question.question,
    answer: question.answer,
    category: question.category,
    difficulty: question.difficulty,
    rating,
    player: playerName,
    timestamp: new Date().toLocaleString('en-US'),
  };
  // Optimistic local update; server append is the source of truth.
  const ratings = getRatings();
  ratings.push(entry);
  localStorage.setItem('tlt_ratings', JSON.stringify(ratings));
  // Per-item POST so two players rating at the same moment can't
  // overwrite each other's ratings (the old code POSTed the whole array
  // and last-writer-wins lost the earlier rating).
  fetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

function loadRatingsFromFile() {
  fetch('/api/ratings')
    .then(r => r.json())
    .then(fileRatings => {
      if (!Array.isArray(fileRatings) || !fileRatings.length) return;
      const local = getRatings();
      const fileIds = new Set(fileRatings.map(r => r.id));
      const merged = [...fileRatings, ...local.filter(r => !fileIds.has(r.id))];
      localStorage.setItem('tlt_ratings', JSON.stringify(merged));
    })
    .catch(() => {});
}

const COMMUNITY_THRESHOLD = 3;

function getCommunityDifficultyInfo(questionId) {
  const all = getRatings().filter(r => r.questionId === questionId);
  if (!all.length) return null;
  const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
  const rounded = Math.round(avg * 10) / 10;
  const label = rounded < 4 ? 'Easy' : rounded < 7 ? 'Medium' : 'Hard';
  return { count: all.length, avg: rounded, label };
}

// Admin: clear every rating for one question. Server filters its own
// copy under a lock so this can't clobber a concurrent player rating
// on a different question that's in flight at the same moment.
function resetQuestionRatings(questionId) {
  const filtered = getRatings().filter(r => r.questionId !== questionId);
  localStorage.setItem('tlt_ratings', JSON.stringify(filtered));
  const token = sessionStorage.getItem('tlt_admin_token') || '';
  fetch('/api/admin/ratings/reset', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body:    JSON.stringify({ questionId }),
  }).then(r => {
    if (!r.ok) console.warn('[ratings] reset failed:', r.status, r.statusText);
  }).catch(err => console.warn('[ratings] reset network error:', err));
}

// Refresh ratings from the server. Called by the admin Community
// Ratings panel before render so the admin sees the live server state.
function reloadRatingsFromFile() {
  return fetch('/api/ratings', { cache: 'no-store' })
    .then(r => r.json())
    .then(fileRatings => {
      if (Array.isArray(fileRatings)) {
        localStorage.setItem('tlt_ratings', JSON.stringify(fileRatings));
      }
    })
    .catch(() => {});
}

// ── VOTES (question quality up/down) ─────────────────────────────
function getVotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.votes)) || []; }
  catch { return []; }
}

function addVote(question, vote, playerName) {
  const entry = {
    id: Date.now(),
    questionId: question.id,
    question: question.question,
    category: question.category,
    vote, // 'up' or 'down'
    player: playerName,
    timestamp: new Date().toLocaleString('en-US'),
  };
  // Optimistic local update with the local dedupe (player can change
  // their vote on a question). The server applies the same dedupe
  // under a lock when it ingests the new vote.
  const votes = getVotes();
  const filtered = votes.filter(v => !(v.questionId === question.id && v.player === playerName));
  filtered.push(entry);
  localStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(filtered));
  // Per-item POST. Server handles the (player, questionId) dedupe so
  // two players voting on different questions can't clobber each other.
  fetch('/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}

function getVoteSummary(questionId) {
  const all = getVotes().filter(v => v.questionId === questionId);
  const up = all.filter(v => v.vote === 'up').length;
  const down = all.filter(v => v.vote === 'down').length;
  return { up, down, total: all.length };
}

function getPlayerVote(questionId, playerName) {
  const votes = getVotes();
  const v = votes.find(v => v.questionId === questionId && v.player === playerName);
  return v ? v.vote : null;
}

// Admin: clear every vote for one question. Server filters its own
// copy under a lock; concurrent votes on other questions are preserved.
function resetQuestionVotes(questionId) {
  const filtered = getVotes().filter(v => v.questionId !== questionId);
  localStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(filtered));
  const token = sessionStorage.getItem('tlt_admin_token') || '';
  fetch('/api/admin/votes/reset', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body:    JSON.stringify({ questionId }),
  }).then(r => {
    if (!r.ok) console.warn('[votes] reset failed:', r.status, r.statusText);
  }).catch(err => console.warn('[votes] reset network error:', err));
}

// Refresh votes from the server. Called by the admin Community Ratings
// panel before render so the admin sees the live server state.
function reloadVotesFromFile() {
  return fetch('/api/votes', { cache: 'no-store' })
    .then(r => r.json())
    .then(fileVotes => {
      if (Array.isArray(fileVotes)) {
        localStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(fileVotes));
      }
    })
    .catch(() => {});
}

function loadVotesFromFile() {
  fetch('/api/votes')
    .then(r => r.json())
    .then(fileVotes => {
      if (!Array.isArray(fileVotes) || !fileVotes.length) return;
      const local = getVotes();
      const fileIds = new Set(fileVotes.map(v => v.id));
      const merged = [...fileVotes, ...local.filter(v => !fileIds.has(v.id))];
      localStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(merged));
    })
    .catch(() => {});
}

// ── ANSWER STATS ──────────────────────────────────────────────────
// Fire-and-forget: tell the server one more player answered this question
// correctly or incorrectly. The server keeps an aggregate correct/wrong
// tally per question (admin "Answer Stats" panel). Unlike votes/ratings,
// this is NOT a client-held array we overwrite - the server increments its
// own counter so concurrent players don't clobber each other's counts.
function recordAnswerStat(questionId, wasCorrect) {
  // Only base + custom questions have numeric IDs; guard against anything else.
  if (typeof questionId !== 'number' || !isFinite(questionId)) return;
  fetch('/api/answer-stats', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, correct: !!wasCorrect }),
  }).catch(() => {});
}

// ── TAGS ──────────────────────────────────────────────────────────
function getAllTags() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.tags)) || {}; }
  catch { return {}; }
}

function getTagsForQuestion(questionId) {
  const all = getAllTags();
  return all[questionId] || [];
}

function saveTagsForQuestion(questionId, tags) {
  const all = getAllTags();
  all[questionId] = tags;
  localStorage.setItem(STORAGE_KEYS.tags, JSON.stringify(all));
  _persistTagsToFile(all);
}

function _persistTagsToFile(tags) {
  fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tags),
  }).catch(() => {});
}

function loadTagsFromFile() {
  fetch('/api/tags')
    .then(r => r.json())
    .then(fileTags => {
      if (!fileTags || typeof fileTags !== 'object' || !Object.keys(fileTags).length) return;
      const local = getAllTags();
      // Merge: file is source of truth, local adds any question IDs not yet in file
      const merged = Object.assign({}, fileTags, ...Object.keys(local)
        .filter(k => !(k in fileTags))
        .map(k => ({ [k]: local[k] })));
      localStorage.setItem(STORAGE_KEYS.tags, JSON.stringify(merged));
    })
    .catch(() => {});
}

// ── QUESTION MANAGEMENT ──────────────────────────────────────────

function getQuestionEdits() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.questionEdits)) || {}; }
  catch { return {}; }
}

function saveQuestionEdit(id, data) {
  const edits = getQuestionEdits();
  edits[id] = data;
  localStorage.setItem(STORAGE_KEYS.questionEdits, JSON.stringify(edits));
  _persistToFile('/api/question-edits', edits);
}

function revertQuestionEdit(id) {
  const edits = getQuestionEdits();
  delete edits[id];
  localStorage.setItem(STORAGE_KEYS.questionEdits, JSON.stringify(edits));
  _persistToFile('/api/question-edits', edits);
}

function getCustomQuestions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.customQuestions)) || []; }
  catch { return []; }
}

function saveCustomQuestions(questions) {
  localStorage.setItem(STORAGE_KEYS.customQuestions, JSON.stringify(questions));
  _persistToFile('/api/custom-questions', questions);
}

function addCustomQuestion(q) {
  const custom = getCustomQuestions();
  custom.push(q);
  saveCustomQuestions(custom);
}

function updateCustomQuestion(id, data) {
  const custom = getCustomQuestions();
  const idx = custom.findIndex(q => q.id === id);
  if (idx >= 0) { Object.assign(custom[idx], data); saveCustomQuestions(custom); }
}

function deleteCustomQuestion(id) {
  const custom = getCustomQuestions().filter(q => q.id !== id);
  saveCustomQuestions(custom);
  setQuestionDisabled(id, false);
}

function getDeletedQuestions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.deletedQuestions)) || []; }
  catch { return []; }
}

function markQuestionDeleted(id) {
  const baseIds = new Set(QUESTIONS.map(q => q.id));
  if (!baseIds.has(id)) {
    // Custom question - remove it outright
    deleteCustomQuestion(id);
  } else {
    // Base question - add to deleted list so it's excluded everywhere
    const list = getDeletedQuestions();
    if (!list.includes(id)) {
      list.push(id);
      localStorage.setItem(STORAGE_KEYS.deletedQuestions, JSON.stringify(list));
      _persistToFile('/api/deleted-questions', list);
    }
    setQuestionDisabled(id, false);
  }
}

function loadDeletedQuestionsFromFile() {
  // Server is the source of truth. Overwrite local state entirely so that
  // questions un-deleted in the admin portal reappear for all visitors.
  // Returns a promise so callers (e.g. game-start) can await a fresh sync
  // and avoid serving a question that was deleted hours ago in another tab.
  // cache: 'no-store' defeats any heuristic browser caching of the response.
  return fetch('/api/deleted-questions', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      if (!Array.isArray(data)) return;
      localStorage.setItem(STORAGE_KEYS.deletedQuestions, JSON.stringify(data));
    })
    .catch(() => {});
}

function getNextQuestionId() {
  const baseMax = Math.max(...QUESTIONS.map(q => q.id), 0);
  const customMax = Math.max(...getCustomQuestions().map(q => q.id), 0);
  return Math.max(baseMax, customMax) + 1;
}

function getDisabledQuestions() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.disabledQuestions)) || []; }
  catch { return []; }
}

function setQuestionDisabled(id, disabled) {
  const list = getDisabledQuestions();
  const idx = list.indexOf(id);
  if (disabled && idx < 0) list.push(id);
  else if (!disabled && idx >= 0) list.splice(idx, 1);
  localStorage.setItem(STORAGE_KEYS.disabledQuestions, JSON.stringify(list));
  _persistToFile('/api/disabled-questions', list);
}

function isQuestionDisabled(id) {
  return getDisabledQuestions().includes(id);
}

function _persistToFile(endpoint, data) {
  // Admin endpoints (question-edits, custom-questions, disabled-questions,
  // deleted-questions, etc.) require X-Admin-Token. Reading from sessionStorage
  // keeps this file decoupled from admin.js. Without the token, the server
  // rejects with 401 — which used to be swallowed silently and is the reason
  // admin deletes never reached production. See state.js commit history.
  const token = sessionStorage.getItem('tlt_admin_token') || '';
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify(data),
  }).then(r => {
    if (!r.ok) {
      console.warn(`[persist] POST ${endpoint} failed: ${r.status} ${r.statusText}`);
    }
  }).catch(err => {
    console.warn(`[persist] POST ${endpoint} network error:`, err);
  });
}

function loadQuestionEditsFromFile() {
  // Server is the source of truth. Overwrite local state entirely so that
  // edits removed in the admin portal are reflected for all visitors.
  return fetch('/api/question-edits', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      if (!data || typeof data !== 'object') return;
      localStorage.setItem(STORAGE_KEYS.questionEdits, JSON.stringify(data));
    })
    .catch(() => {});
}

function loadCustomQuestionsFromFile() {
  // Server is the source of truth. Overwrite local state entirely so that
  // custom questions removed in the admin portal disappear for all visitors.
  return fetch('/api/custom-questions', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      if (!Array.isArray(data)) return;
      localStorage.setItem(STORAGE_KEYS.customQuestions, JSON.stringify(data));
    })
    .catch(() => {});
}

function loadDisabledQuestionsFromFile() {
  // Server is the source of truth. Overwrite local state entirely so that
  // questions re-enabled in the admin portal re-appear for all visitors.
  // Returns a promise (see loadDeletedQuestionsFromFile for rationale).
  return fetch('/api/disabled-questions', { cache: 'no-store' })
    .then(r => r.json())
    .then(data => {
      if (!Array.isArray(data)) return;
      localStorage.setItem(STORAGE_KEYS.disabledQuestions, JSON.stringify(data));
    })
    .catch(() => {});
}

// Re-syncs the admin-managed lists that affect which questions are eligible
// for play. Call (and await) this before starting any game so a question
// deleted/disabled in the admin portal can never be served from a stale
// localStorage snapshot - even in tabs that have been open for hours.
function syncAdminListsBeforeGame() {
  return Promise.all([
    loadDeletedQuestionsFromFile(),
    loadDisabledQuestionsFromFile(),
    loadQuestionEditsFromFile(),
    loadCustomQuestionsFromFile(),
  ]);
}
