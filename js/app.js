'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — Entry Point
   Event binding and screen routing
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // Sync all persistent data from files into localStorage on every load
  loadDisputesFromFile();
  loadRatingsFromFile();
  loadVotesFromFile();
  loadTagsFromFile();
  loadLeaderboardFromFile();
  loadQuestionEditsFromFile();
  loadCustomQuestionsFromFile();
  loadDisabledQuestionsFromFile();

  // ── FEEDBACK ──────────────────────────────────────────────────────
  initFeedback();

  // ── DONATE ────────────────────────────────────────────────────────
  initDonate();

  // ── HAMBURGER MENU ───────────────────────────────────────────────
  const hamburgerBtn = document.getElementById('btn-hamburger');
  const hamburgerMenu = document.getElementById('hamburger-menu');

  hamburgerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    hamburgerMenu.classList.toggle('hidden');
    hamburgerBtn.classList.toggle('hamburger-open');
  });

  document.getElementById('menu-about').addEventListener('click', (e) => {
    e.stopPropagation();
    hamburgerMenu.classList.add('hidden');
    hamburgerBtn.classList.remove('hamburger-open');
    showScreen('screen-about');
  });

  document.getElementById('menu-rules').addEventListener('click', (e) => {
    e.stopPropagation();
    hamburgerMenu.classList.add('hidden');
    hamburgerBtn.classList.remove('hamburger-open');
    showScreen('screen-rules');
  });

  // Close menu when clicking outside
  document.addEventListener('click', () => {
    if (!hamburgerMenu.classList.contains('hidden')) {
      hamburgerMenu.classList.add('hidden');
      hamburgerBtn.classList.remove('hamburger-open');
    }
  });

  // ── HOME ────────────────────────────────────────────────────────
  document.getElementById('btn-solo').addEventListener('click', () => showScreen('screen-solo-name'));
  document.getElementById('btn-party').addEventListener('click', () => {
    initPartyNames();
    showScreen('screen-party-names');
  });
  document.getElementById('btn-leaderboard').addEventListener('click', () => {
    renderLeaderboard();
    showScreen('screen-leaderboard');
  });

  // ── BACK BUTTONS ────────────────────────────────────────────────
  document.querySelectorAll('.btn-back[data-target]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.target));
  });

  // ── SOLO FLOW ───────────────────────────────────────────────────
  document.getElementById('btn-solo-name-continue').addEventListener('click', () => {
    const name = sanitizeName(document.getElementById('solo-name-input').value);
    if (!name) { showToast('Please enter your name first.'); return; }
    showScreen('screen-solo-lobby');
  });
  document.getElementById('solo-name-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-solo-name-continue').click();
  });
  document.getElementById('btn-solo-start').addEventListener('click', soloStart);

  // ── QUESTION SCREEN (shared) ─────────────────────────────────────
  document.getElementById('btn-reveal-answer').addEventListener('click', () => {
    const q = GameState.questions[GameState.currentQIdx];
    document.getElementById('q-hardcore-panel').classList.add('hidden');
    revealAnswer(q, false); // wasRight=false, HC will self-score
  });

  document.getElementById('btn-hc-correct').addEventListener('click', () => handleHCScore(true));
  document.getElementById('btn-hc-wrong').addEventListener('click', () => handleHCScore(false));

  document.getElementById('btn-next-question').addEventListener('click', () => {
    if (GameState.mode === 'solo') soloNextQ();
    else if (GameState.isWagerRound) {
      // Save wager result and advance to next tied player
      const player = GameState.players[GameState.currentPlayerIdx];
      if (!GameState.wagerPlayerResults) GameState.wagerPlayerResults = [];
      GameState.wagerPlayerResults.push({ playerId: player.id, wasCorrect: GameState.wasCorrect });
      GameState.currentWagerIdx++;
      if (GameState.currentWagerIdx < GameState.wagerPlayerQueue.length) {
        renderWagerQuestionScreen();
      } else {
        partyResolveWager();
      }
    } else {
      partyNextQ();
    }
  });

  // Rating slider
  const rateSlider = document.getElementById('q-rate-slider');
  const rateValueEl = document.getElementById('q-rate-value');
  function activateRatingSlider() {
    if (!soloRatingTouched) {
      soloRatingTouched = true;
      rateSlider.classList.remove('rate-untouched');
      rateValueEl.classList.remove('rate-null-val');
      rateValueEl.textContent = rateSlider.value;
    }
  }
  rateSlider.addEventListener('pointerdown', activateRatingSlider);
  rateSlider.addEventListener('input', e => {
    activateRatingSlider();
    rateValueEl.textContent = e.target.value;
  });

  // Pause / Resume (party mode)
  document.getElementById('btn-pause-game').addEventListener('click', toggleGamePause);
  document.getElementById('btn-resume-game').addEventListener('click', toggleGamePause);

  // Exit game
  document.getElementById('btn-exit-game').addEventListener('click', () => {
    const isParty = GameState.mode === 'party';
    const msg = isParty
      ? 'Leave this party game? The session will end for all players.\n\n(Ratings and disputes already submitted will be kept.)'
      : 'Leave this game? Your score won\'t be saved to the leaderboard.\n\n(Ratings and disputes already submitted will be kept.)';
    if (confirm(msg)) showScreen('screen-home');
  });

  // Vote buttons
  document.getElementById('btn-vote-up').addEventListener('click', () => handleVote('up'));
  document.getElementById('btn-vote-down').addEventListener('click', () => handleVote('down'));

  // Dispute
  document.getElementById('btn-dispute-open').addEventListener('click', () => {
    document.getElementById('q-dispute-form').classList.toggle('hidden');
  });
  document.getElementById('btn-dispute-submit').addEventListener('click', () => {
    soloSubmitDispute(document.getElementById('dispute-text').value);
  });
  document.getElementById('btn-dispute-cancel').addEventListener('click', () => {
    document.getElementById('q-dispute-form').classList.add('hidden');
  });

  // Quote callout dismiss
  document.getElementById('quote-callout').addEventListener('click', dismissQuote);

  // ── SOLO RESULTS ─────────────────────────────────────────────────
  document.getElementById('btn-view-leaderboard').addEventListener('click', () => {
    renderLeaderboard();
    showScreen('screen-leaderboard');
  });
  document.getElementById('btn-play-again').addEventListener('click', () => {
    showScreen('screen-solo-lobby');
  });
  document.getElementById('btn-home-from-results').addEventListener('click', () => showScreen('screen-home'));

  // ── LEADERBOARD ──────────────────────────────────────────────────

  // ── PARTY FLOW ───────────────────────────────────────────────────
  document.getElementById('btn-add-player').addEventListener('click', partyBuildNameInputs);
  document.getElementById('btn-party-names-continue').addEventListener('click', partyStartLobby);
  document.getElementById('btn-party-start').addEventListener('click', partyStart);

  // ── WAGER ────────────────────────────────────────────────────────
  document.getElementById('btn-wager-reveal').addEventListener('click', partyRevealWagerQuestion);

  // ── PARTY RESULTS ────────────────────────────────────────────────
  document.getElementById('btn-party-again').addEventListener('click', () => {
    if (GameState.partyNames) {
      showScreen('screen-party-lobby');
    } else {
      initPartyNames();
      showScreen('screen-party-names');
    }
  });
  document.getElementById('btn-home-from-party').addEventListener('click', () => showScreen('screen-home'));

  // ── SETTINGS ─────────────────────────────────────────────────────
  document.getElementById('btn-admin-login').addEventListener('click', adminLogin);
  document.getElementById('admin-password-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') adminLogin();
  });
  document.getElementById('btn-pw-toggle').addEventListener('click', () => {
    const input = document.getElementById('admin-password-input');
    input.type = input.type === 'password' ? 'text' : 'password';
  });
  const _bind = (id, evt, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); };
  _bind('btn-export-questions',   'click', exportQuestions);
  _bind('btn-export-select-all',   'click', () => document.querySelectorAll('input[name="export-col"]').forEach(c => c.checked = true));
  _bind('btn-export-deselect-all', 'click', () => document.querySelectorAll('input[name="export-col"]').forEach(c => c.checked = false));

  // ── ADMIN NAV ────────────────────────────────────────────────────
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', () => switchAdminPanel(item.dataset.panel));
  });

  // Question management controls (guarded so missing elements don't break login)
  populateCategoryDropdowns();
  populateCharacterDropdowns();

  // Pool count live updates for both lobbies
  ['solo', 'party'].forEach(mode => {
    [`${mode}-category`, `${mode}-character`].forEach(id => {
      _bind(id, 'change', () => updateLobbyPoolCount(mode));
    });
    document.querySelectorAll(`input[name="${mode}-diff"]`).forEach(radio => {
      radio.addEventListener('change', () => {
        updateLobbyPoolCount(mode);
        if (mode === 'solo') updateSoloLbStatus();
      });
    });
  });

  // Leaderboard qualifier status — also updates on question count and hardcore changes
  document.querySelectorAll('input[name="solo-count"]').forEach(radio => {
    radio.addEventListener('change', updateSoloLbStatus);
  });
  _bind('solo-hardcore', 'change', updateSoloLbStatus);
  updateSoloLbStatus();

  _bind('aq-search', 'input', e => { adminQFilter.search = e.target.value; renderAdminQuestions(); });
  _bind('aq-filter-category', 'change', e => { adminQFilter.category = e.target.value; renderAdminQuestions(); });
  _bind('aq-filter-difficulty', 'change', e => { adminQFilter.difficulty = e.target.value; renderAdminQuestions(); });
  _bind('btn-add-question', 'click', () => openQuestionEditor(null));
  _bind('question-form', 'submit', saveQuestion);
  _bind('btn-question-modal-close', 'click', closeQuestionEditor);
  _bind('btn-qe-cancel', 'click', closeQuestionEditor);
  _bind('btn-qe-add-tag', 'click', addModalTag);
  _bind('qe-tag-input', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addModalTag(); } });
  _bind('qe-context', 'input', e => { document.getElementById('qe-context-count').textContent = e.target.value.length; });
  _bind('question-modal', 'click', e => { if (e.target.id === 'question-modal') closeQuestionEditor(); });

  // Community ratings tab controls
  _bind('cr-search',        'input',  e => { adminRatingsFilter.search = e.target.value; renderAdminRatings(); });
  _bind('cr-filter-status', 'change', e => { adminRatingsFilter.status = e.target.value; renderAdminRatings(); });

  // Privacy / storage notice banner
  (function () {
    const banner = document.getElementById('privacy-banner');
    const btn    = document.getElementById('btn-privacy-ok');
    if (!banner || !btn) return;
    if (!localStorage.getItem('tlt_privacy_ok')) {
      banner.classList.remove('hidden');
    }
    btn.addEventListener('click', () => {
      localStorage.setItem('tlt_privacy_ok', '1');
      banner.classList.add('hidden');
    });
  })();

  // Tag suggestions datalist
  const dl = document.getElementById('tag-suggestions-list');
  if (dl) {
    TAG_SUGGESTIONS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      dl.appendChild(opt);
    });
  }

  _bind('btn-chpw-save', 'click', changeAdminPassword);

});
