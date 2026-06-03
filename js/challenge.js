'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Challenge Mode (async multiplayer)
   Creator generates a memo, friends play the same question set via
   a shareable link, scores accumulate on a per-memo leaderboard.
   ================================================================ */

// -- SEEDED RNG (mulberry32) ------------------------------------------
// Used so every player sees MC options in the same order for a
// given (challenge code, question id) pair.

function _challengeStrHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function _challengeMulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function challengeSeededShuffle(arr, seedStr) {
  const a = [...arr];
  const rand = _challengeMulberry32(_challengeStrHash(seedStr));
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// -- CHALLENGE STATE --------------------------------------------------
// Kept separate from GameState so existing solo/party code is untouched.

const ChallengeState = {
  code: null,         // 6-char memo code
  creatorName: '',    // who sent the memo
  config: null,       // { category, difficulty, character, count, speedRound }
  questionIds: [],    // locked-in question IDs in play order
  isCreator: false,   // true after creating, false after joining a link
};

function _resetChallengeState() {
  ChallengeState.code = null;
  ChallengeState.creatorName = '';
  ChallengeState.config = null;
  ChallengeState.questionIds = [];
  ChallengeState.isCreator = false;
}

// -- URL HELPERS ------------------------------------------------------

function challengeLinkFor(code) {
  return window.location.origin + window.location.pathname + '?c=' + encodeURIComponent(code);
}

function _setUrlChallengeCode(code) {
  try {
    const url = code
      ? window.location.pathname + '?c=' + encodeURIComponent(code)
      : window.location.pathname;
    history.replaceState({}, '', url);
  } catch { /* ignore on file:// */ }
}

function _readUrlChallengeCode() {
  try {
    const code = new URL(window.location.href).searchParams.get('c');
    if (!code) return null;
    return /^[A-Z2-9]{6,8}$/.test(code.toUpperCase()) ? code.toUpperCase() : null;
  } catch { return null; }
}

// -- PUBLIC: ENTRY POINTS ---------------------------------------------

function challengeOpenSetup() {
  _resetChallengeState();
  _setUrlChallengeCode(null);
  document.getElementById('challenge-setup-pre').classList.remove('hidden');
  document.getElementById('challenge-setup-share').classList.add('hidden');
  const codeEl = document.getElementById('challenge-code-display');
  const linkEl = document.getElementById('challenge-link-text');
  if (codeEl) codeEl.textContent = '';
  if (linkEl) linkEl.textContent = '';
  updateLobbyPoolCount('challenge');
  showScreen('screen-challenge-setup');
}

// Called on page load when ?c=XXXXXX is detected in the URL.
async function challengeBootstrapFromUrl() {
  const code = _readUrlChallengeCode();
  if (!code) return false;
  try {
    const res = await fetch('/api/challenges?code=' + encodeURIComponent(code), { cache: 'no-store' });
    if (!res.ok) {
      showToast(res.status === 404
        ? 'That memo code doesn\'t exist. The mailroom lost it.'
        : 'Could not load that memo. Try again later.');
      _setUrlChallengeCode(null);
      return false;
    }
    const challenge = await res.json();
    _showChallengeIntro(challenge);
    return true;
  } catch {
    showToast('Could not reach the server. Memo links require the server to be running.');
    _setUrlChallengeCode(null);
    return false;
  }
}

function _showChallengeIntro(challenge) {
  ChallengeState.code = challenge.code;
  ChallengeState.creatorName = challenge.creatorName || 'A Coworker';
  ChallengeState.config = challenge.config || {};
  ChallengeState.questionIds = Array.isArray(challenge.questionIds) ? challenge.questionIds : [];
  ChallengeState.isCreator = false;

  const fromEl = document.getElementById('challenge-intro-from');
  const bodyEl = document.getElementById('challenge-intro-body');
  const tagEl  = document.getElementById('challenge-intro-tag');
  if (fromEl) fromEl.textContent = ChallengeState.creatorName;
  const count = ChallengeState.questionIds.length;
  const cat = ChallengeState.config.category && ChallengeState.config.category !== 'all'
    ? ChallengeState.config.category
    : 'mixed-category';
  const diff = ChallengeState.config.difficulty && ChallengeState.config.difficulty !== 'Mixed'
    ? ChallengeState.config.difficulty.toLowerCase() + ' '
    : '';
  if (bodyEl) {
    bodyEl.innerHTML = '<strong>' + escHtml(ChallengeState.creatorName) + '</strong> challenged you to '
      + count + ' ' + escHtml(diff) + escHtml(cat) + ' trivia questions.';
  }
  if (tagEl) {
    tagEl.textContent = 'Same questions for everyone. Same order. See how you compare.';
  }

  // Pre-fill name if we have one from a prior session
  const nameInput = document.getElementById('challenge-joiner-name');
  if (nameInput) {
    const stored = localStorage.getItem('tlt_last_name') || '';
    if (stored && !nameInput.value) nameInput.value = stored;
    nameInput.focus();
  }

  showScreen('screen-challenge-intro');
}

// -- CREATE FLOW (creator) --------------------------------------------

async function challengeCreate() {
  const btn  = document.getElementById('btn-challenge-create');
  const orig = btn ? btn.textContent : '';

  const setBtn = (txt, disabled) => {
    if (!btn) return;
    btn.textContent = txt;
    btn.disabled = !!disabled;
  };

  const name        = sanitizeName(document.getElementById('challenge-name-input').value);
  const category    = document.getElementById('challenge-category').value;
  const character   = document.getElementById('challenge-character').value;
  const difficulty  = document.querySelector('input[name="challenge-diff"]:checked').value;
  const speedSecs   = parseInt(document.querySelector('input[name="challenge-speed"]:checked')?.value || '0', 10);
  const speedRound  = speedSecs > 0;

  if (!name) {
    showToast('Sign the memo - enter your name first.');
    document.getElementById('challenge-name-input').focus();
    return;
  }

  setBtn('Drafting memo...', true);

  let qs;
  try {
    const count = parseInt(document.querySelector('input[name="challenge-count"]:checked').value, 10);
    qs = selectQuestions(category, difficulty, count, character);
  } catch (err) {
    console.error('[challenge] selectQuestions failed:', err);
    showToast('Could not assemble the question set. Try different settings.');
    setBtn(orig || 'Create & Copy Memo Link', false);
    return;
  }
  if (!qs || !qs.length) {
    showToast('Not enough questions for that combo. Try different settings.');
    setBtn(orig || 'Create & Copy Memo Link', false);
    return;
  }

  let payloadCode = null;
  try {
    const res = await fetch('/api/challenges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creatorName: name,
        config: { category, difficulty, character, count: qs.length, speedRound, speedSecs },
        questionIds: qs.map(q => q.id),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('HTTP ' + res.status + (body ? ': ' + body.slice(0, 120) : ''));
    }
    const data = await res.json();
    if (!data.ok || !data.code) throw new Error('Server did not return a code');
    payloadCode = data.code;
  } catch (e) {
    console.error('[challenge] create failed:', e);
    showToast('Could not create the memo. Make sure the server is running.');
    setBtn(orig || 'Create & Copy Memo Link', false);
    return;
  }

  // Stash the locked set so the creator plays the same exact questions.
  ChallengeState.code = payloadCode;
  ChallengeState.creatorName = name;
  ChallengeState.config = { category, difficulty, character, count: qs.length, speedRound, speedSecs };
  ChallengeState.questionIds = qs.map(q => q.id);
  ChallengeState.isCreator = true;

  try { localStorage.setItem('tlt_last_name', name); } catch {}

  // Render the share UI
  const linkEl = document.getElementById('challenge-link-text');
  const codeEl = document.getElementById('challenge-code-display');
  const url = challengeLinkFor(payloadCode);
  if (linkEl) linkEl.textContent = url;
  if (codeEl) codeEl.textContent = payloadCode;

  document.getElementById('challenge-setup-pre').classList.add('hidden');
  document.getElementById('challenge-setup-share').classList.remove('hidden');

  setBtn(orig || 'Create & Copy Memo Link', false);

  const copied = await challengeCopyLinkSilent();
  if (!copied) {
    showToast('Memo created. Tap "Copy Link" to copy it to your clipboard.');
  }
  if (linkEl) {
    linkEl.classList.remove('challenge-link-flash');
    void linkEl.offsetWidth;
    linkEl.classList.add('challenge-link-flash');
  }
}

// Copy the current challenge link to clipboard. Returns true on success.
async function challengeCopyLinkSilent() {
  const code = ChallengeState.code;
  if (!code) return false;
  const url = challengeLinkFor(code);
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch { /* fall through to legacy path */ }
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = url;
    ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return !!ok;
  } catch { return false; }
}

async function challengeCopyLink() {
  const code = ChallengeState.code;
  const btn  = document.getElementById('btn-challenge-copy');
  if (!code) { showToast('No memo to share yet.'); return; }
  const url = challengeLinkFor(code);

  const isMobile = 'ontouchstart' in window && window.innerWidth < 768;
  if (isMobile && navigator.share) {
    try {
      await navigator.share({ title: 'Threat Level Trivia', text: 'I just sent you a memo. Beat my score.', url });
      return;
    } catch { /* user cancelled - fall through to clipboard */ }
  }

  const copied = await challengeCopyLinkSilent();
  if (copied) {
    showToast('Link copied! Paste it anywhere.');
    if (btn) {
      const orig = btn.dataset.origText || btn.textContent;
      btn.dataset.origText = orig;
      btn.textContent = 'Copied!';
      btn.classList.add('btn-copied');
      setTimeout(() => {
        btn.textContent = orig;
        btn.classList.remove('btn-copied');
      }, 1800);
    }
  } else {
    showToast('Could not copy automatically. Long-press the link to copy it manually.');
  }
}

// -- PLAY FLOW --------------------------------------------------------

function _hydrateChallengeQuestions() {
  if (!ChallengeState.questionIds.length) return [];
  const lookup = new Map();
  getAllManagedQuestions().forEach(q => lookup.set(q.id, q));
  const out = [];
  for (const id of ChallengeState.questionIds) {
    const q = lookup.get(id);
    if (q) out.push(q);
  }
  return out;
}

async function challengeStartPlay(playerNameOverride) {
  const isCreator = ChallengeState.isCreator;
  const name = sanitizeName(
    playerNameOverride
    || (isCreator
        ? ChallengeState.creatorName
        : document.getElementById('challenge-joiner-name').value)
  );
  if (!name) { showToast('Please enter your name first.'); return; }

  // Re-sync admin-managed lists before hydrating the challenge's questions
  // so a question deleted in the admin portal is not served to a joiner.
  await syncAdminListsBeforeGame();

  const qs = _hydrateChallengeQuestions();
  if (!qs.length) {
    showToast('This memo\'s questions are no longer available. Sorry.');
    return;
  }

  try { localStorage.setItem('tlt_last_name', name); } catch {}

  resetGameState();
  GameState.mode = 'challenge';
  GameState.config = Object.assign(
    { category: 'all', difficulty: 'Mixed', count: qs.length, hardcore: false, speedRound: false, speedSecs: 0, character: 'all' },
    ChallengeState.config || {},
    { hardcore: false, count: qs.length }
  );
  if (GameState.config.speedRound) {
    const s = parseInt(GameState.config.speedSecs, 10);
    // Valid speeds: 30, 15, 10 (Ludicrous). Anything else falls back to 15s.
    GameState.speedMaxTime = [10, 15, 30].includes(s) ? s : 15;
  } else {
    GameState.speedMaxTime = 15;
  }
  GameState.questions = qs;
  GameState.players = [{ id: 1, name, score: 0, answers: [], isCreator }];
  GameState.currentPlayerIdx = 0;

  challengeNextQuestion();
}

function challengeNextQuestion() {
  if (pendingQuoteTimer) { clearTimeout(pendingQuoteTimer); pendingQuoteTimer = null; }
  dismissQuote();
  if (GameState.currentQIdx >= GameState.questions.length) {
    challengeFinish();
    return;
  }
  soloRatingSubmitted = false;
  soloRatingTouched = false;
  GameState.answerState = null;
  GameState.wasCorrect = null;
  renderQuestionScreen();
  if (GameState.config?.speedRound) {
    startSpeedTimer();
  }
}

function challengeNextQ() {
  if (soloRatingTouched && !soloRatingSubmitted) {
    soloSubmitRating();
  }
  const disputeForm = document.getElementById('q-dispute-form');
  const disputeTextEl = document.getElementById('dispute-text');
  if (!disputeForm.classList.contains('hidden')) {
    if (disputeTextEl.value.replace(/\s/g, '').length > 1) {
      soloSubmitDispute(disputeTextEl.value);
    }
  }
  GameState.currentQIdx++;
  challengeNextQuestion();
}

async function challengeFinish() {
  const player  = GameState.players[0];
  const answers = player.answers;
  const total   = answers.length;
  const correct = answers.filter(a => a.wasCorrect).length;
  const score   = player.score;

  // Submit to the server
  try {
    await fetch('/api/challenge-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: ChallengeState.code,
        name: player.name,
        score,
        total,
        correctCount: correct,
        isCreator: !!player.isCreator,
        breakdown: answers.map(a => ({
          questionId: a.questionId,
          wasCorrect: a.wasCorrect,
          pointsEarned: a.pointsEarned,
        })),
      }),
    });
  } catch { /* offline - leaderboard will just be missing this entry */ }

  // Fetch all scores for this challenge
  let allScores = [];
  try {
    const res = await fetch('/api/challenge-scores?code=' + encodeURIComponent(ChallengeState.code), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      allScores = Array.isArray(data.scores) ? data.scores : [];
    }
  } catch { /* offline */ }

  renderChallengeResults(player, allScores);
  showScreen('screen-challenge-results');
}

// -- RESULTS / LEADERBOARD RENDERING ---------------------------------

function renderChallengeResults(player, allScores) {
  const total   = player.answers.length;
  const correct = player.answers.filter(a => a.wasCorrect).length;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;
  const grade   = getGrade(pct);

  document.getElementById('challenge-results-name').textContent     = player.name;
  document.getElementById('challenge-results-score').textContent    = correct + ' / ' + total;
  document.getElementById('challenge-results-accuracy').textContent = pct + '% Accuracy';
  document.getElementById('challenge-results-grade').textContent    = grade.emoji + ' ' + grade.label;
  renderScoreQuote('challenge-results-quote', pct);
  document.getElementById('challenge-results-code').textContent     = ChallengeState.code || '';

  const lbEl = document.getElementById('challenge-leaderboard');
  if (!lbEl) return;

  const scores = (allScores || []).slice().sort((a, b) =>
    (b.score - a.score) || (b.correctCount - a.correctCount) || ((a.submittedAt || '') > (b.submittedAt || '') ? 1 : -1)
  );

  if (!scores.length) {
    lbEl.innerHTML = '<p class="empty-state">No one has played this memo yet. Once others play, their scores show up here.</p>';
    return;
  }

  const myName = player.name;
  let myIdx = -1;
  for (let i = scores.length - 1; i >= 0; i--) {
    if (scores[i].name === myName) { myIdx = i; break; }
  }

  const totalScores = scores.length;
  lbEl.innerHTML = scores.map((s, i) => {
    const isMe       = i === myIdx;
    const isCreator  = !!s.isCreator;
    const rank       = i + 1;
    const accuracy   = s.total > 0 ? Math.round((s.correctCount / s.total) * 100) : 0;
    const title      = getRankTitle(rank, totalScores);
    const badges     = [
      isCreator ? '<span class="cl-tag cl-tag-creator">SENT IT</span>' : '',
      isMe      ? '<span class="cl-tag cl-tag-me">YOU</span>'           : '',
    ].join('');
    return '<div class="cl-row ' + (rank === 1 ? 'cl-first' : '') + ' ' + (isMe ? 'cl-me' : '') + '">'
      + '<span class="cl-rank" title="' + escHtml(title) + '">' + rank + '</span>'
      + '<span class="cl-name">' + escHtml(s.name) + ' ' + badges + '</span>'
      + '<span class="cl-score">' + s.score + ' pts</span>'
      + '<span class="cl-acc">' + s.correctCount + '/' + s.total + ' &middot; ' + accuracy + '%</span>'
      + '</div>';
  }).join('');
}

// -- Re-share / new-memo actions on results screen --------------------

async function challengeReshare() {
  await challengeCopyLink();
}

function challengeStartNew() {
  _setUrlChallengeCode(null);
  challengeOpenSetup();
}

function challengeBackToHome() {
  _setUrlChallengeCode(null);
  showScreen('screen-home');
}

// -- Hook: override default MC option ordering when in challenge ------
// Patches generateMCOptions so the option order is deterministic per
// (challenge code, question id). Solo/party behavior is unchanged.

(function _patchMCForChallenge() {
  if (typeof generateMCOptions !== 'function') return;
  const _origGenerateMCOptions = generateMCOptions;
  // eslint-disable-next-line no-global-assign
  generateMCOptions = function (question) {
    if (GameState && GameState.mode === 'challenge' && ChallengeState.code) {
      const seed = ChallengeState.code + ':' + question.id;
      return challengeSeededShuffle([question.answer, ...question.distractors], seed);
    }
    return _origGenerateMCOptions(question);
  };
})();
