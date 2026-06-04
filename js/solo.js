'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Solo Mode
   Game flow for single-player sessions
   ================================================================ */

let soloCurrentOptions = [];
let soloRatingSubmitted = false;
let soloRatingTouched = false;
let soloCurrentRating = 5;
let soloVoteSubmitted = false;
let pendingQuoteTimer = null;

function updateSoloLbStatus() {
  const el = document.getElementById('solo-lb-status');
  if (!el) return;
  const diff  = document.querySelector('input[name="solo-diff"]:checked')?.value;
  const count = parseInt(document.querySelector('input[name="solo-count"]:checked')?.value || '0', 10);
  const hardcore  = document.getElementById('solo-hardcore')?.checked;
  const qualifies = (diff === 'Medium' || diff === 'Hard') && count >= 25 && !hardcore;
  if (qualifies) {
    el.innerHTML = '<span class="lb-status-pill qualifies">★ Qualifies for Global Leaderboard</span>';
  } else {
    const reasons = [];
    if (diff !== 'Medium' && diff !== 'Hard') reasons.push('Medium or Hard difficulty');
    if (count < 25) reasons.push('25 questions');
    if (reasons.length) {
      el.innerHTML = `<span class="lb-status-pill no-qualify">Needs ${reasons.join(' + ')} to qualify for Global Leaderboard</span>`;
    } else {
      el.innerHTML = '<span class="lb-status-pill no-qualify">Hardcore Mode disqualifies from leaderboard</span>';
    }
  }
}

async function soloStart() {
  const name  = sanitizeName(document.getElementById('solo-name-input').value);
  if (!name) { showToast('Please enter your name first.'); return; }

  const category   = document.getElementById('solo-category').value;
  const character  = document.getElementById('solo-character').value;
  const difficulty = document.querySelector('input[name="solo-diff"]:checked').value;
  const count      = parseInt(document.querySelector('input[name="solo-count"]:checked').value, 10);
  const hardcore   = document.getElementById('solo-hardcore').checked;
  const excludeBts = !!document.getElementById('solo-exclude-bts')?.checked;

  // Re-sync admin-managed lists (deleted/disabled/edits/custom) before
  // building the question pool. This prevents a stale localStorage from
  // serving a question that was deleted via the admin portal hours ago.
  await syncAdminListsBeforeGame();

  const qs = selectQuestions(category, difficulty, count, character, excludeBts);
  if (!qs.length) { showToast('Not enough questions for that combo. Try different settings.'); return; }

  resetGameState();
  GameState.mode = 'solo';
  GameState.config = { category, difficulty, count, hardcore, speedRound: false, character, excludeBts };
  GameState.questions = qs;
  GameState.players = [{ id: 1, name, score: 0, answers: [] }];
  GameState.currentPlayerIdx = 0;

  soloNextQuestion();
}

/* Restart the current solo quiz from question 1 with the same settings.
   Same category/difficulty/count, but a freshly-shuffled question pool so
   the player doesn't just see the same order again. Used by the in-game
   "↻ Start Over" button - hidden in party (would wipe others' scores)
   and challenge (uses a fixed share-code question list). */
async function soloStartOver() {
  if (GameState.mode !== 'solo') return;
  if (!confirm('Start over from question 1?\n\nYour current progress will be lost. Same category, difficulty, and count - questions will be re-shuffled.')) return;

  const { category, difficulty, count, hardcore, speedRound, character, excludeBts } = GameState.config;
  const playerName = (GameState.players[0] && GameState.players[0].name) || 'Player';

  // Re-sync admin-managed lists before re-shuffling (see soloStart).
  await syncAdminListsBeforeGame();

  const qs = selectQuestions(category, difficulty, count, character, excludeBts);
  if (!qs.length) {
    showToast('Could not start over - no matching questions available.');
    return;
  }

  if (pendingQuoteTimer) { clearTimeout(pendingQuoteTimer); pendingQuoteTimer = null; }
  dismissQuote();

  resetGameState();
  GameState.mode = 'solo';
  GameState.config = { category, difficulty, count, hardcore, speedRound, character, excludeBts };
  GameState.questions = qs;
  GameState.players = [{ id: 1, name: playerName, score: 0, answers: [] }];
  GameState.currentPlayerIdx = 0;

  soloNextQuestion();
}

function soloNextQuestion() {
  if (pendingQuoteTimer) { clearTimeout(pendingQuoteTimer); pendingQuoteTimer = null; }
  dismissQuote();
  if (GameState.currentQIdx >= GameState.questions.length) {
    soloFinish(); return;
  }
  soloRatingSubmitted = false;
  soloRatingTouched = false;
  soloVoteSubmitted = false;
  GameState.answerState = null;
  GameState.wasCorrect = null;
  renderQuestionScreen();
}

function renderQuestionScreen() {
  const q      = GameState.questions[GameState.currentQIdx];
  const player = GameState.players[GameState.currentPlayerIdx];
  const cfg    = GameState.config;
  const total  = GameState.questions.length;
  const idx    = GameState.currentQIdx;

  document.getElementById('q-player-label').textContent =
    GameState.mode === 'party'
      ? `${escHtml(player.name)}'s Turn`
      : `Playing as ${escHtml(player.name)}`;

  document.getElementById('q-progress').textContent = `Question ${idx + 1} of ${total}`;
  document.getElementById('q-category').textContent = q.category;
  document.getElementById('q-category').className = 'badge badge-category';
  const diffBadge = document.getElementById('q-difficulty');
  const communityInfo = getCommunityDifficultyInfo(q.id);
  const isOverriding = communityInfo && communityInfo.count >= COMMUNITY_THRESHOLD;
  const displayDiff = isOverriding ? communityInfo.label : q.difficulty;
  diffBadge.className = `badge ${difficultyClass(displayDiff)}`;
  if (isOverriding) {
    diffBadge.innerHTML = `${escHtml(displayDiff)}<span class="community-score-hint"> ★${communityInfo.avg}</span>`;
  } else {
    diffBadge.textContent = q.difficulty;
  }
  document.getElementById('q-text').textContent = q.question;

  renderQuestionTags(q);

  // Reset answer reveal
  document.getElementById('q-reveal').classList.add('hidden');
  document.getElementById('q-reveal-result').textContent = '';
  document.getElementById('q-hc-score').classList.add('hidden');
  document.getElementById('q-dispute-form').classList.add('hidden');
  document.getElementById('dispute-text').value = '';
  document.getElementById('btn-dispute-open').textContent = 'Question Feedback / Dispute';
  document.getElementById('btn-dispute-open').disabled = false;

  // Vote reset
  const btnUp = document.getElementById('btn-vote-up');
  const btnDown = document.getElementById('btn-vote-down');
  btnUp.classList.remove('vote-active-up');
  btnDown.classList.remove('vote-active-down');
  btnUp.disabled = false;
  btnDown.disabled = false;
  soloVoteSubmitted = false;

  // Rating reset
  const slider = document.getElementById('q-rate-slider');
  const rateVal = document.getElementById('q-rate-value');
  slider.value = 5;
  slider.classList.add('rate-untouched');
  rateVal.textContent = '–';
  rateVal.classList.add('rate-null-val');
  soloRatingSubmitted = false;

  // Solo/challenge post-answer panel (ratings, votes, disputes)
  document.getElementById('q-solo-actions').classList.toggle('hidden', GameState.mode !== 'solo' && GameState.mode !== 'challenge');

  // Pause button: party-only
  const pauseBtn = document.getElementById('btn-pause-game');
  pauseBtn.classList.toggle('hidden', GameState.mode !== 'party');
  pauseBtn.textContent = '⏸ Pause';
  pauseBtn.title = 'Pause game';

  // Start Over button: solo-only. Party would wipe everyone's score, and
  // challenge mode uses a fixed share-code question list (restarting there
  // would need a different code path).
  const restartBtn = document.getElementById('btn-restart-game');
  if (restartBtn) restartBtn.classList.toggle('hidden', GameState.mode !== 'solo');

  // Ensure pause overlay is cleared between questions
  document.getElementById('pause-overlay').classList.add('hidden');

  // Speed timer
  document.getElementById('speed-timer').classList.add('hidden');

  if (cfg.hardcore) {
    document.getElementById('q-options').innerHTML = '';
    document.getElementById('q-options').classList.add('hidden');
    document.getElementById('q-hardcore-panel').classList.remove('hidden');
  } else {
    document.getElementById('q-hardcore-panel').classList.add('hidden');
    document.getElementById('q-options').classList.remove('hidden');
    soloCurrentOptions = generateMCOptions(q);
    renderMCOptions(q, soloCurrentOptions);
  }

  // Party scoreboard + per-question countdown.
  // The 3-2-1-GO countdown only fires when speed round is on - otherwise
  // there's no time pressure to set up and the countdown is just friction.
  if (GameState.mode === 'party') {
    renderPartyScoreboard();
    if (GameState.config.speedRound) {
      const player = GameState.players[GameState.currentPlayerIdx];
      startPartyCountdown(player.name, () => startSpeedTimer());
    }
  }

  showScreen('screen-question');
}

function renderMCOptions(q, options) {
  const container = document.getElementById('q-options');
  container.innerHTML = options.map((opt, i) => `
    <button class="mc-option" data-idx="${i}" data-answer="${escHtml(opt)}">${escHtml(opt)}</button>
  `).join('');
  container.querySelectorAll('.mc-option').forEach(btn => {
    btn.addEventListener('click', () => handleMCAnswer(btn, q));
  });
}

function handleMCAnswer(btn, q) {
  if (GameState.answerState) return; // already answered
  GameState.answerState = 'answered';

  const selected = btn.dataset.answer;
  const correct  = q.answer;
  const wasRight = selected === correct;
  GameState.wasCorrect = wasRight;
  GameState.selectedAnswer = selected;

  // Lock all options, highlight correct/wrong
  document.querySelectorAll('.mc-option').forEach(b => {
    b.disabled = true;
    if (b.dataset.answer === correct) b.classList.add('mc-correct');
    else if (b === btn && !wasRight) b.classList.add('mc-wrong');
  });

  // Snappy wrong-answer reaction (separate from the inline quote callout).
  if (!wasRight) showToast(pickWrongAnswerQuip(), 1800);

  revealAnswer(q, wasRight);
}

function revealAnswer(q, wasRight) {
  document.getElementById('q-reveal').classList.remove('hidden');
  const resultEl = document.getElementById('q-reveal-result');
  document.getElementById('q-reveal-answer').textContent = q.answer;

  const ctxEl = document.getElementById('q-reveal-context');
  if (!wasRight && q.context) {
    ctxEl.textContent = q.context;
    ctxEl.classList.remove('hidden');
  } else {
    ctxEl.textContent = '';
    ctxEl.classList.add('hidden');
  }

  if (GameState.config.hardcore) {
    // Don't show correct/incorrect yet - player will self-score
    resultEl.textContent = 'The answer is:';
    resultEl.className = 'reveal-result';
    document.getElementById('q-hc-score').classList.remove('hidden');
    // Context deferred until self-score for hardcore
    ctxEl.classList.add('hidden');
  } else {
    resultEl.textContent = wasRight ? '✓ Correct!' : '✗ Incorrect';
    resultEl.className = 'reveal-result ' + (wasRight ? 'result-correct' : 'result-wrong');
    scoreAnswer(wasRight);
    if (pendingQuoteTimer) clearTimeout(pendingQuoteTimer);
    pendingQuoteTimer = setTimeout(() => { pendingQuoteTimer = null; showQuote(wasRight); }, 300);
  }
}

function scoreAnswer(wasRight) {
  const player = GameState.players[GameState.currentPlayerIdx];
  const q = GameState.questions[GameState.currentQIdx];

  let pts = 0;
  if (wasRight) {
    if (GameState.config.speedRound) {
      pts = Math.max(1, Math.ceil((GameState.speedTimeLeft / GameState.speedMaxTime) * 10));
    } else {
      pts = 1;
    }
    player.score += pts;
  }

  player.answers.push({
    questionId: q.id,
    category: q.category,
    wasCorrect: wasRight,
    pointsEarned: pts,
  });

  logAnswer(player.name, q, wasRight, null);
  // Bump the global per-question correct/wrong tally (admin Answer Stats).
  // Shared chokepoint for solo, party, challenge, and hardcore self-scoring.
  recordAnswerStat(q.id, wasRight);

  if (GameState.config.speedRound && GameState.speedInterval) {
    clearInterval(GameState.speedInterval);
    GameState.speedInterval = null;
  }
}

// Hardcore: player self-scores
function handleHCScore(wasRight) {
  if (GameState.answerState === 'scored') return;
  GameState.answerState = 'scored';
  GameState.wasCorrect = wasRight;
  const resultEl = document.getElementById('q-reveal-result');
  resultEl.textContent = wasRight ? '✓ Got It!' : '✗ Missed It';
  resultEl.className = 'reveal-result ' + (wasRight ? 'result-correct' : 'result-wrong');
  document.getElementById('q-hc-score').classList.add('hidden');
  scoreAnswer(wasRight);

  const q = GameState.questions[GameState.currentQIdx];
  const ctxEl = document.getElementById('q-reveal-context');
  if (!wasRight && q.context) {
    ctxEl.textContent = q.context;
    ctxEl.classList.remove('hidden');
  }

  showQuote(wasRight);
}

function soloSubmitRating() {
  if (soloRatingSubmitted) return;
  const rating = parseInt(document.getElementById('q-rate-slider').value, 10);
  const q = GameState.questions[GameState.currentQIdx];
  const player = GameState.players[0];
  // Update the last answer's rating in history
  const history = getHistory();
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].questionId === q.id && history[i].player === player.name) {
      history[i].difficultyRating = rating;
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(history));
      break;
    }
  }
  // Persist rating to file
  addRating(q, rating, player.name);
  soloRatingSubmitted = true;
}

function soloSubmitDispute(rawText) {
  const text = sanitizeName(rawText, 300);
  if (!text) { showToast('Please describe the issue first.'); return; }
  const q = GameState.questions[GameState.currentQIdx];
  const player = GameState.players[0];
  const rating = soloRatingSubmitted
    ? parseInt(document.getElementById('q-rate-slider').value, 10)
    : null;
  addDispute(q, text, player.name, rating);
  document.getElementById('q-dispute-form').classList.add('hidden');
  document.getElementById('btn-dispute-open').textContent = 'Dispute Filed ✓';
  document.getElementById('btn-dispute-open').disabled = true;
  showToast('Dispute filed. HR has been notified. (Nobody will do anything.)');
}

function soloNextQ() {
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
  soloNextQuestion();
}

function handleVote(direction) {
  if (soloVoteSubmitted) return;
  soloVoteSubmitted = true;
  const q = GameState.questions[GameState.currentQIdx];
  const player = GameState.players[GameState.currentPlayerIdx];
  addVote(q, direction, player.name);

  const btnUp = document.getElementById('btn-vote-up');
  const btnDown = document.getElementById('btn-vote-down');
  if (direction === 'up') {
    btnUp.classList.add('vote-active-up');
  } else {
    btnDown.classList.add('vote-active-down');
  }
  btnUp.disabled = true;
  btnDown.disabled = true;
}

async function soloFinish() {
  const player   = GameState.players[0];
  const total    = player.answers.length;
  const correct  = player.answers.filter(a => a.wasCorrect).length;
  const { difficulty, category } = GameState.config;

  addLeaderboardEntry(player.name, correct, total, category, difficulty);

  const qualifies = total >= 25 && (difficulty === 'Medium' || difficulty === 'Hard') && !GameState.config.hardcore;
  GameState.lastGameQualified = qualifies;
  GameState.globalSubmitted   = false;

  if (qualifies) {
    GameState.globalSubmitted = await submitGlobalLeaderboardEntry(
      player.name, correct, total, category, difficulty, GameState.config.excludeBts
    );
  }

  renderSoloResults(player);
  showScreen('screen-solo-results');
}
