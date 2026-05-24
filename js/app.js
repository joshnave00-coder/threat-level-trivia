'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — Entry Point
   Event binding and screen routing
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // Sync all persistent data from files into localStorage on every load
  loadDisputesFromFile();
  loadRatingsFromFile();
  loadTagsFromFile();
  loadLeaderboardFromFile();

  // ── FEEDBACK ──────────────────────────────────────────────────────
  initFeedback();

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
  document.getElementById('btn-settings').addEventListener('click', () => showScreen('screen-settings'));

  // ── BACK BUTTONS ────────────────────────────────────────────────
  document.querySelectorAll('.btn-back[data-target]').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.target));
  });

  // ── SOLO FLOW ───────────────────────────────────────────────────
  document.getElementById('btn-solo-name-continue').addEventListener('click', () => {
    const name = document.getElementById('solo-name-input').value.trim();
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

  // Exit game
  document.getElementById('btn-exit-game').addEventListener('click', () => {
    const isParty = GameState.mode === 'party';
    const msg = isParty
      ? 'Leave this party game? The session will end for all players.\n\n(Ratings and disputes already submitted will be kept.)'
      : 'Leave this game? Your score won\'t be saved to the leaderboard.\n\n(Ratings and disputes already submitted will be kept.)';
    if (confirm(msg)) showScreen('screen-home');
  });

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
  document.getElementById('btn-clear-leaderboard').addEventListener('click', () => {
    if (confirm('Clear all employee records? This cannot be undone.')) {
      clearLeaderboard();
      renderLeaderboard();
    }
  });

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
  document.getElementById('btn-export-history').addEventListener('click', exportHistory);
  document.getElementById('btn-clear-history').addEventListener('click', () => {
    if (confirm('Clear all answer history? This cannot be undone.')) {
      clearHistory();
      showToast('History cleared.');
    }
  });

  // ── ADMIN TABS ───────────────────────────────────────────────────
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAdminTab(tab.dataset.tab));
  });

  // Admin tag search
  document.getElementById('admin-tag-search').addEventListener('input', e => {
    renderAdminTags(e.target.value);
  });

  // Tag suggestions datalist
  const dl = document.getElementById('tag-suggestions-list');
  if (dl) {
    TAG_SUGGESTIONS.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      dl.appendChild(opt);
    });
  }

});
