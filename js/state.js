'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — State & Storage
   Global game state and all localStorage operations
   ================================================================ */

const STORAGE_KEYS = {
  leaderboard: 'tlt_leaderboard',
  history:     'tlt_history',
  disputes:    'tlt_disputes',
  tags:        'tlt_tags',
};

// Current game state — reset at the start of each game
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
  _persistLeaderboardToFile(entries);
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
  _persistLeaderboardToFile([]);
}

function _persistLeaderboardToFile(entries) {
  fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  }).catch(() => {});
}

function loadLeaderboardFromFile() {
  fetch('/api/leaderboard')
    .then(r => r.json())
    .then(fileEntries => {
      if (!Array.isArray(fileEntries) || !fileEntries.length) return;
      const local = getLeaderboard();
      // Merge: combine both sets, re-sort, keep top 10
      const combined = [...fileEntries];
      local.forEach(le => {
        const alreadyIn = combined.some(fe =>
          fe.name === le.name && fe.date === le.date && fe.score === le.score);
        if (!alreadyIn) combined.push(le);
      });
      combined.sort((a, b) => b.score - a.score || b.accuracy - a.accuracy);
      localStorage.setItem(STORAGE_KEYS.leaderboard, JSON.stringify(combined.slice(0, 10)));
    })
    .catch(() => {});
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

// Fire-and-forget: write disputes to data/disputes.json via local server.
// Silently no-ops if the server isn't running.
function _persistDisputesToFile(disputes) {
  fetch('/api/disputes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(disputes),
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
    .catch(() => {}); // server not running — use localStorage only
}

function addDispute(question, disputeText, playerName, difficultyRating) {
  const disputes = getDisputes();
  disputes.push({
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
  });
  localStorage.setItem(STORAGE_KEYS.disputes, JSON.stringify(disputes));
  _persistDisputesToFile(disputes);
}

function updateDisputeStatus(id, status) {
  const disputes = getDisputes();
  const d = disputes.find(x => x.id === id);
  if (d) d.status = status;
  localStorage.setItem(STORAGE_KEYS.disputes, JSON.stringify(disputes));
  _persistDisputesToFile(disputes);
}

// ── RATINGS ───────────────────────────────────────────────────────
function getRatings() {
  try { return JSON.parse(localStorage.getItem('tlt_ratings')) || []; }
  catch { return []; }
}

function addRating(question, rating, playerName) {
  const ratings = getRatings();
  ratings.push({
    id: Date.now(),
    questionId: question.id,
    question: question.question,
    answer: question.answer,
    category: question.category,
    difficulty: question.difficulty,
    rating,
    player: playerName,
    timestamp: new Date().toLocaleString('en-US'),
  });
  localStorage.setItem('tlt_ratings', JSON.stringify(ratings));
  // Persist to file
  fetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ratings),
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
