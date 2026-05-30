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

async function submitGlobalLeaderboardEntry(name, score, total, category, difficulty) {
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
    .catch(() => {}); // server not running - use localStorage only
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

// Permanently removes a dispute from both localStorage and the server file.
function deleteDispute(id) {
  const disputes = getDisputes().filter(x => x.id !== id);
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

const COMMUNITY_THRESHOLD = 3;

function getCommunityDifficultyInfo(questionId) {
  const all = getRatings().filter(r => r.questionId === questionId);
  if (!all.length) return null;
  const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
  const rounded = Math.round(avg * 10) / 10;
  const label = rounded < 4 ? 'Easy' : rounded < 7 ? 'Medium' : 'Hard';
  return { count: all.length, avg: rounded, label };
}

function resetQuestionRatings(questionId) {
  const filtered = getRatings().filter(r => r.questionId !== questionId);
  localStorage.setItem('tlt_ratings', JSON.stringify(filtered));
  fetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filtered),
  }).catch(() => {});
}

// ── VOTES (question quality up/down) ─────────────────────────────
function getVotes() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.votes)) || []; }
  catch { return []; }
}

function addVote(question, vote, playerName) {
  const votes = getVotes();
  // Remove any existing vote by this player on this question
  const filtered = votes.filter(v => !(v.questionId === question.id && v.player === playerName));
  filtered.push({
    id: Date.now(),
    questionId: question.id,
    question: question.question,
    category: question.category,
    vote, // 'up' or 'down'
    player: playerName,
    timestamp: new Date().toLocaleString('en-US'),
  });
  localStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(filtered));
  // Persist to file
  fetch('/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filtered),
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

function resetQuestionVotes(questionId) {
  const filtered = getVotes().filter(v => v.questionId !== questionId);
  localStorage.setItem(STORAGE_KEYS.votes, JSON.stringify(filtered));
  fetch('/api/votes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(filtered),
  }).catch(() => {});
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
  fetch('/api/deleted-questions').then(r => r.json()).then(data => {
    if (!Array.isArray(data) || !data.length) return;
    localStorage.setItem(STORAGE_KEYS.deletedQuestions, JSON.stringify(data));
  }).catch(() => {});
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
  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {});
}

function loadQuestionEditsFromFile() {
  fetch('/api/question-edits').then(r => r.json()).then(data => {
    if (!data || typeof data !== 'object' || !Object.keys(data).length) return;
    const local = getQuestionEdits();
    const merged = Object.assign({}, data, local);
    localStorage.setItem(STORAGE_KEYS.questionEdits, JSON.stringify(merged));
  }).catch(() => {});
}

function loadCustomQuestionsFromFile() {
  fetch('/api/custom-questions').then(r => r.json()).then(data => {
    if (!Array.isArray(data) || !data.length) return;
    const local = getCustomQuestions();
    const localIds = new Set(local.map(q => q.id));
    const merged = [...local, ...data.filter(q => !localIds.has(q.id))];
    localStorage.setItem(STORAGE_KEYS.customQuestions, JSON.stringify(merged));
  }).catch(() => {});
}

function loadDisabledQuestionsFromFile() {
  fetch('/api/disabled-questions').then(r => r.json()).then(data => {
    if (!Array.isArray(data) || !data.length) return;
    const local = getDisabledQuestions();
    const merged = [...new Set([...data, ...local])];
    localStorage.setItem(STORAGE_KEYS.disabledQuestions, JSON.stringify(merged));
  }).catch(() => {});
}
