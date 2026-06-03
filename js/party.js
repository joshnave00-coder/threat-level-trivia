'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Party Mode
   Multi-player game flow, speed round, wager tiebreaker
   ================================================================ */

function partyBuildNameInputs() {
  const container = document.getElementById('party-name-inputs');
  const count = container.querySelectorAll('.party-name-row').length;
  if (count >= 8) return;
  const idx = count + 1;
  const row = document.createElement('div');
  row.className = 'party-name-row form-group';
  row.innerHTML = `
    <label>Player ${idx}</label>
    <div class="party-name-input-row">
      <input type="text" class="input-field party-name-field" placeholder="Enter name" maxlength="20">
      ${idx > 2 ? '<button class="btn-icon remove-player" title="Remove">✕</button>' : ''}
    </div>`;
  container.appendChild(row);
  const field = row.querySelector('.party-name-field');
  attachIdentityTheftWatch(field);
  applyRotatingPlaceholder(field);
  row.querySelector('.remove-player')?.addEventListener('click', () => {
    row.remove();
    rebuildPlayerLabels();
  });
}

function rebuildPlayerLabels() {
  document.querySelectorAll('.party-name-row').forEach((row, i) => {
    row.querySelector('label').textContent = `Player ${i + 1}`;
  });
}

function initPartyNames() {
  const container = document.getElementById('party-name-inputs');
  container.innerHTML = '';
  partyBuildNameInputs();
  partyBuildNameInputs();
}

function partyStartLobby() {
  const fields = document.querySelectorAll('.party-name-field');
  const names = [];
  fields.forEach(f => { const n = sanitizeName(f.value); if (n) names.push(n); });
  if (names.length < 2) { showToast('At least 2 players are required.'); return; }

  GameState.partyNames = names;
  showScreen('screen-party-lobby');
}

async function partyStart() {
  const names = GameState.partyNames;
  if (!names || names.length < 2) { showScreen('screen-party-names'); return; }

  const category    = document.getElementById('party-category').value;
  const character   = document.getElementById('party-character').value;
  const difficulty  = document.querySelector('input[name="party-diff"]:checked').value;
  const rawCount    = parseInt(document.querySelector('input[name="party-count"]:checked').value, 10);
  // Party speed: radio group with values 0 (Off), 15, 20, 30 (seconds).
  const speedSecs   = parseInt(document.querySelector('input[name="party-speed"]:checked')?.value || '0', 10);
  const speedRound  = speedSecs > 0;

  // Round down to the nearest multiple of player count so every player
  // gets the exact same number of questions (never one player short-changed).
  const playerCount = names.length;
  const count = Math.max(playerCount, Math.floor(rawCount / playerCount) * playerCount);

  if (count !== rawCount) {
    showToast(`Using ${count} questions so each player gets ${count / playerCount} turn${count / playerCount !== 1 ? 's' : ''}.`);
  }

  // Re-sync admin-managed lists before building the pool (see soloStart).
  await syncAdminListsBeforeGame();

  const qs = selectQuestions(category, difficulty, count, character);
  if (!qs.length) { showToast('Not enough questions for that combo. Try different settings.'); return; }

  resetGameState();
  GameState.mode = 'party';
  GameState.config = { category, difficulty, count, hardcore: false, speedRound, speedSecs, character };
  // Pin the per-question time so startSpeedTimer() picks it up. Valid
  // values are 15/20/30; anything else falls back to 15s as a guardrail.
  GameState.speedMaxTime = (speedRound && [15, 20, 30].includes(speedSecs)) ? speedSecs : 15;
  GameState.questions = qs;
  GameState.players = names.map((name, i) => ({ id: i + 1, name, score: 0, answers: [] }));
  GameState.currentPlayerIdx = 0;

  partyNextQuestion();
}

function partyNextQuestion() {
  if (pendingQuoteTimer) { clearTimeout(pendingQuoteTimer); pendingQuoteTimer = null; }
  dismissQuote();
  if (GameState.currentQIdx >= GameState.questions.length) {
    partyCheckTie(); return;
  }
  GameState.answerState = null;
  GameState.wasCorrect  = null;
  // Rotate player
  GameState.currentPlayerIdx = GameState.currentQIdx % GameState.players.length;
  renderQuestionScreen();
}

function partyNextQ() {
  GameState.currentQIdx++;
  partyNextQuestion();
}

// ── PARTY COUNTDOWN (3-2-1-GO) ────────────────────────────────────
function startPartyCountdown(playerName, onComplete) {
  const overlay = document.getElementById('party-countdown');
  const numEl   = document.getElementById('party-countdown-number');
  const nameEl  = document.getElementById('party-countdown-name');

  nameEl.textContent = `${playerName}'s Question`;
  numEl.className    = 'party-countdown-number';
  numEl.textContent  = '3';
  overlay.classList.remove('hidden');

  // Trigger initial pop animation
  void overlay.offsetWidth;
  numEl.classList.add('countdown-anim');

  let count = 3;

  const tick = () => {
    count--;
    // Strip and re-add animation class to restart it (CSS reflow trick)
    numEl.classList.remove('countdown-anim', 'countdown-go');
    void numEl.offsetWidth;

    if (count > 0) {
      numEl.textContent = count;
      numEl.classList.add('countdown-anim');
      setTimeout(tick, 850);
    } else {
      numEl.textContent = 'GO!';
      numEl.classList.add('countdown-go', 'countdown-anim');
      setTimeout(() => {
        overlay.classList.add('hidden');
        onComplete();
      }, 650);
    }
  };

  setTimeout(tick, 850);
}

// ── SPEED TIMER ───────────────────────────────────────────────────
function startSpeedTimer(resume) {
  const maxTime = GameState.speedMaxTime;
  // On resume=true, keep existing speedTimeLeft; otherwise reset to full
  if (!resume) GameState.speedTimeLeft = maxTime;
  document.getElementById('speed-timer').classList.remove('hidden');
  updateSpeedTimerUI();

  GameState.speedInterval = setInterval(() => {
    GameState.speedTimeLeft--;
    updateSpeedTimerUI();
    if (GameState.speedTimeLeft <= 0) {
      clearInterval(GameState.speedInterval);
      GameState.speedInterval = null;
      handleTimeExpired();
    }
  }, 1000);
}

function updateSpeedTimerUI() {
  const max  = GameState.speedMaxTime;
  const left = GameState.speedTimeLeft;
  const pct  = (left / max) * 100;
  document.getElementById('speed-timer-value').textContent = left;
  const fill = document.getElementById('speed-timer-fill');
  fill.style.width = pct + '%';
  fill.className = 'speed-timer-fill' + (pct <= 30 ? ' timer-danger' : pct <= 60 ? ' timer-warn' : '');
}

function handleTimeExpired() {
  if (GameState.answerState) return;
  GameState.answerState = 'answered';
  GameState.wasCorrect = false;
  const q = GameState.questions[GameState.currentQIdx];
  const player = GameState.players[GameState.currentPlayerIdx];

  // Lock MC options and show correct
  document.querySelectorAll('.mc-option').forEach(b => {
    b.disabled = true;
    if (b.dataset.answer === q.answer) b.classList.add('mc-correct');
  });

  player.answers.push({ questionId: q.id, category: q.category, wasCorrect: false, pointsEarned: 0 });
  logAnswer(player.name, q, false, null);

  document.getElementById('q-reveal').classList.remove('hidden');
  const resultEl = document.getElementById('q-reveal-result');
  resultEl.textContent = '⏱ Time\'s Up!';
  resultEl.className = 'reveal-result result-wrong';
  document.getElementById('q-reveal-answer').textContent = q.answer;
  document.getElementById('q-solo-actions').classList.add('hidden');

  if (pendingQuoteTimer) clearTimeout(pendingQuoteTimer);
  pendingQuoteTimer = setTimeout(() => { pendingQuoteTimer = null; showQuote(false); }, 300);
}

// ── WAGER TIMER ───────────────────────────────────────────────────
const WAGER_TIME = 45;
let wagerTimerInterval = null;

function startWagerTimer() {
  let timeLeft = WAGER_TIME;
  const timerEl  = document.getElementById('wager-timer');
  const fillEl   = document.getElementById('wager-timer-fill');
  const valueEl  = document.getElementById('wager-timer-value');

  timerEl.classList.remove('hidden');
  valueEl.textContent = timeLeft;
  fillEl.style.width = '100%';
  fillEl.className = 'wager-timer-fill';

  wagerTimerInterval = setInterval(() => {
    timeLeft--;
    const pct = (timeLeft / WAGER_TIME) * 100;
    valueEl.textContent = timeLeft;
    fillEl.style.width = pct + '%';
    fillEl.className = 'wager-timer-fill' + (pct <= 22 ? ' timer-danger' : pct <= 55 ? ' timer-warn' : '');

    if (timeLeft <= 0) {
      clearWagerTimer();
      showToast('Time\'s up! Revealing the tiebreaker...');
      partyRevealWagerQuestion();
    }
  }, 1000);
}

function clearWagerTimer() {
  if (wagerTimerInterval) {
    clearInterval(wagerTimerInterval);
    wagerTimerInterval = null;
  }
  const timerEl = document.getElementById('wager-timer');
  if (timerEl) timerEl.classList.add('hidden');
}

// ── PARTY PAUSE ───────────────────────────────────────────────────
function toggleGamePause() {
  const overlay = document.getElementById('pause-overlay');
  const btn     = document.getElementById('btn-pause-game');
  const isPaused = !overlay.classList.contains('hidden');

  if (isPaused) {
    // Resume
    overlay.classList.add('hidden');
    btn.textContent = '⏸ Pause';
    btn.title = 'Pause game';
    // Resume speed timer with remaining time (pass true to skip reset)
    if (GameState.config?.speedRound && GameState.speedTimeLeft > 0 && !GameState.answerState) {
      startSpeedTimer(true);
    }
  } else {
    // Pause
    // Suspend speed timer if running
    if (GameState.speedInterval) {
      clearInterval(GameState.speedInterval);
      GameState.speedInterval = null;
    }

    // Pick a random pause quote
    const q = PAUSE_QUOTES[Math.floor(Math.random() * PAUSE_QUOTES.length)];
    document.getElementById('pause-quote-text').textContent = q.text;
    document.getElementById('pause-quote-attr').textContent = '- ' + q.character;

    overlay.classList.remove('hidden');
    btn.textContent = '▶ Resume';
    btn.title = 'Resume game';
  }
}

// ── TIE DETECTION & WAGER ─────────────────────────────────────────
function partyCheckTie() {
  const sorted = [...GameState.players].sort((a, b) => b.score - a.score);
  const topScore = sorted[0].score;
  const tied = GameState.players.filter(p => p.score === topScore);

  if (tied.length < 2) {
    renderPartyResults(GameState.players);
    showScreen('screen-party-results');
    return;
  }

  // Start wager round
  const remaining = QUESTIONS.filter(q => !GameState.questions.some(gq => gq.id === q.id));
  const shuffled  = shuffle(remaining);
  GameState.wagerQuestion = shuffled[0] || GameState.questions[0]; // fallback to used q
  GameState.wagerTiedPlayers = tied;
  GameState.wagerAnswers = [];

  renderWagerInputs(tied);
  showScreen('screen-wager');
  startWagerTimer();
}

function renderWagerInputs(tiedPlayers) {
  const container = document.getElementById('wager-inputs');
  container.innerHTML = tiedPlayers.map(p => `
    <div class="wager-row">
      <label class="wager-label">${escHtml(p.name)} <span class="wager-current">(${p.score} pts)</span></label>
      <div class="wager-input-row">
        <input type="number" class="input-field wager-field" data-player-id="${p.id}"
          min="1" max="${Math.max(1, p.score)}" value="${Math.floor(p.score / 2) || 1}"
          placeholder="Wager amount">
        <span class="wager-hint">max ${p.score}</span>
      </div>
    </div>`).join('');
}

function partyRevealWagerQuestion() {
  clearWagerTimer();
  const tiedPlayers = GameState.wagerTiedPlayers;
  const wagerFields = document.querySelectorAll('.wager-field');
  GameState.wagerAnswers = [];

  let valid = true;
  wagerFields.forEach(f => {
    const playerId = parseInt(f.dataset.playerId, 10);
    const player   = GameState.players.find(p => p.id === playerId);
    const wager    = parseInt(f.value, 10);
    if (!player || isNaN(wager) || wager < 1 || wager > player.score) {
      valid = false; return;
    }
    GameState.wagerAnswers.push({ playerId, wager });
  });

  if (!valid) { showToast('Each player must wager between 1 and their current score.'); return; }

  // Now run wager question as party question flow
  GameState.questions.push(GameState.wagerQuestion);
  GameState.currentQIdx = GameState.questions.length - 1;
  GameState.currentPlayerIdx = 0;
  GameState.isWagerRound = true;
  GameState.wagerPlayerQueue = [...tiedPlayers];
  GameState.currentWagerIdx = 0;

  renderWagerQuestionScreen();
}

function renderWagerQuestionScreen() {
  const currentTiedPlayer = GameState.wagerPlayerQueue[GameState.currentWagerIdx];
  if (!currentTiedPlayer) { partyResolveWager(); return; }

  GameState.currentPlayerIdx = GameState.players.indexOf(currentTiedPlayer);
  GameState.answerState = null;
  renderQuestionScreen();
}

function partyResolveWager() {
  GameState.isWagerRound = false;
  // Apply wager results
  for (const wa of GameState.wagerAnswers) {
    const player = GameState.players.find(p => p.id === wa.playerId);
    const answer = GameState.wagerPlayerResults?.find(r => r.playerId === wa.playerId);
    if (player && answer) {
      if (answer.wasCorrect) player.score += wa.wager;
      else player.score = Math.max(0, player.score - wa.wager);
    }
  }
  renderPartyResults(GameState.players);
  showScreen('screen-party-results');
}
