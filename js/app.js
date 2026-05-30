'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Entry Point
   Event binding and screen routing
   ================================================================ */

// Toggles the search-box "has text" state so the clear (x) button can
// appear on hover/focus only when there's something to clear.
function _toggleSearchClear(value) {
  const wrap = document.querySelector('.aq-search-wrap');
  if (wrap) wrap.classList.toggle('aq-has-text', !!value);
}

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
  loadDeletedQuestionsFromFile();

  // Apply site-wide settings (e.g. donate link visibility)
  applySiteSettings();

  // ── FEEDBACK ──────────────────────────────────────────────────────
  initFeedback();

  // ── QUESTION SUGGESTIONS ──────────────────────────────────────────
  initSuggestions();

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
  // Easter egg: double-click the paper-airplane logo for a random Office
  // quote toast. Pure-random pick each time (pickEggQuote), no rotation.
  const homeLogoEgg = document.getElementById('home-logo-egg');
  if (homeLogoEgg) {
    homeLogoEgg.addEventListener('dblclick', () => {
      const q = pickEggQuote();
      if (q) showToast(`"${q.text}" - ${q.character}`, 4500);
    });
  }
  // Easter egg: tap the paper-airplane logo on the About screen 5 times
  // quickly (within 2 seconds) for a random Office-flavored saying.
  const aboutLogoEgg = document.getElementById('about-logo-egg');
  if (aboutLogoEgg) {
    let _aboutTaps = 0;
    let _aboutTapTimer = null;
    aboutLogoEgg.addEventListener('click', () => {
      _aboutTaps++;
      if (_aboutTapTimer) clearTimeout(_aboutTapTimer);
      if (_aboutTaps >= 5) {
        _aboutTaps = 0;
        showToast('Easter egg found! ' + pickAboutEggSaying(), 4500);
      } else {
        // Reset the counter after 2 seconds of no taps.
        _aboutTapTimer = setTimeout(() => { _aboutTaps = 0; }, 2000);
      }
    });
  }

  document.getElementById('btn-solo').addEventListener('click', () => showScreen('screen-solo-name'));
  document.getElementById('btn-party').addEventListener('click', () => {
    initPartyNames();
    showScreen('screen-party-names');
  });
  document.getElementById('btn-challenge').addEventListener('click', () => challengeOpenSetup());
  document.getElementById('btn-leaderboard').addEventListener('click', () => {
    renderLeaderboard();
    showScreen('screen-leaderboard');
  });
  // Re-render the leaderboard list when the difficulty filter changes.
  // Uses the cached server response, so no extra API call per change.
  const lbFilter = document.getElementById('lb-filter-difficulty');
  if (lbFilter) lbFilter.addEventListener('change', renderLeaderboardList);

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
    if (GameState.mode === 'challenge') challengeNextQ();
    else if (GameState.mode === 'solo') soloNextQ();
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

  // Exit game - shared by the text "← Leave" button (right side of the
  // header) and the paper-airplane logo button (top-left of the header).
  // Both trigger the same confirm dialog and routing.
  const exitGameHandler = () => {
    const isParty = GameState.mode === 'party';
    const msg = isParty
      ? 'Leave this party game? The session will end for all players.\n\n(Ratings and disputes already submitted will be kept.)'
      : 'Leave this game? Your score won\'t be saved to the leaderboard.\n\n(Ratings and disputes already submitted will be kept.)';
    if (confirm(msg)) showScreen('screen-home');
  };
  document.getElementById('btn-exit-game').addEventListener('click', exitGameHandler);
  const exitLogoBtn = document.getElementById('btn-exit-game-logo');
  if (exitLogoBtn) exitLogoBtn.addEventListener('click', exitGameHandler);

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
    document.querySelectorAll(`input[name="${mode}-count"]`).forEach(radio => {
      radio.addEventListener('change', () => updateLobbyPoolCount(mode));
    });
  });

  // Leaderboard qualifier status - also updates on question count and hardcore changes
  document.querySelectorAll('input[name="solo-count"]').forEach(radio => {
    radio.addEventListener('change', updateSoloLbStatus);
  });
  _bind('solo-hardcore', 'change', updateSoloLbStatus);
  updateSoloLbStatus();

  // "Deep tracks only" - Andy Bernard quip when Hard is selected
  // (Roller skating party: "Just play Dave Matthews Band. Deep tracks only.")
  document.querySelectorAll('input[name="solo-diff"], input[name="party-diff"], input[name="challenge-diff"]').forEach(radio => {
    radio.addEventListener('change', e => {
      if (e.target.checked && e.target.value === 'Hard') {
        showToast('Sweet. Deep tracks only.');
      }
    });
  });

  // Dwight quip when Hardcore Mode toggles ON
  const hcToggle = document.getElementById('solo-hardcore');
  if (hcToggle) {
    hcToggle.addEventListener('change', e => {
      if (e.target.checked) {
        showToast('Question: What kind of bear is best? Black bear. Hardcore.');
      }
    });
  }

  // Identity theft detector - watches name inputs for cast names.
  // Also assigns a rotating Office cast placeholder to each name input.
  // (Dynamically added party name fields are handled inside partyBuildNameInputs.)
  ['solo-name-input', 'challenge-name-input', 'challenge-joiner-name'].forEach(id => {
    const el = document.getElementById(id);
    attachIdentityTheftWatch(el);
    applyRotatingPlaceholder(el);
  });

  _bind('aq-search', 'input', e => {
    adminQFilter.search = e.target.value;
    _toggleSearchClear(e.target.value);
    renderAdminQuestions();
  });
  // Clear button (x) inside the search box: empties it and re-renders.
  _bind('aq-search-clear', 'click', () => {
    const input = document.getElementById('aq-search');
    if (input) input.value = '';
    adminQFilter.search = '';
    _toggleSearchClear('');
    renderAdminQuestions();
    if (input) input.focus();
  });
  _bind('aq-filter-category', 'change', e => { adminQFilter.category = e.target.value; renderAdminQuestions(); });
  _bind('aq-filter-difficulty', 'change', e => { adminQFilter.difficulty = e.target.value; renderAdminQuestions(); });
  _bind('btn-add-question', 'click', () => openQuestionEditor(null));
  _bind('question-form', 'submit', saveQuestion);
  _bind('btn-question-modal-close', 'click', closeQuestionEditor);
  _bind('btn-qe-cancel', 'click', closeQuestionEditor);
  _bind('btn-qe-add-tag', 'click', addModalTag);
  _bind('qe-tag-input', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addModalTag(); } });
  _bind('qe-context', 'input', e => { document.getElementById('qe-context-count').textContent = e.target.value.length; });
  // NOTE: Intentionally no backdrop-click-to-close. Admins were losing
  // half-entered questions by clicking just outside the card. Close only
  // via the X button (sticky in the header) or the Cancel button.

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

  // Site settings toggles
  _SITE_TOGGLES.forEach(({ key, toggleId }) => {
    _bind(toggleId, 'change', () => handleSiteToggle(key));
  });

  // ── CHALLENGE MODE ──────────────────────────────────────────────
  _bind('btn-challenge-create',           'click', challengeCreate);
  _bind('btn-challenge-copy',             'click', challengeCopyLink);
  _bind('btn-challenge-start-creator',    'click', () => challengeStartPlay());
  _bind('btn-challenge-new',              'click', challengeStartNew);
  _bind('btn-challenge-accept',           'click', () => challengeStartPlay());
  _bind('btn-challenge-decline',          'click', () => showScreen('screen-home'));
  _bind('btn-challenge-reshare',          'click', challengeReshare);
  _bind('btn-challenge-new-from-results', 'click', challengeStartNew);
  _bind('btn-challenge-home',             'click', challengeBackToHome);

  // Challenge lobby: pool count live updates
  ['challenge-category', 'challenge-character'].forEach(id => {
    _bind(id, 'change', () => updateLobbyPoolCount('challenge'));
  });
  document.querySelectorAll('input[name="challenge-diff"]').forEach(radio => {
    radio.addEventListener('change', () => updateLobbyPoolCount('challenge'));
  });
  document.querySelectorAll('input[name="challenge-count"]').forEach(radio => {
    radio.addEventListener('change', () => updateLobbyPoolCount('challenge'));
  });

  // Enter key on challenge name input
  const challengeNameInput = document.getElementById('challenge-name-input');
  if (challengeNameInput) {
    challengeNameInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') challengeCreate();
    });
  }
  const challengeJoinerInput = document.getElementById('challenge-joiner-name');
  if (challengeJoinerInput) {
    challengeJoinerInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') challengeStartPlay();
    });
  }

  // Check for ?c=XXXXXX challenge link on page load
  challengeBootstrapFromUrl();

  // /nave routes directly to the Settings (admin login) screen.
  // Matches /nave, /nave/, and any /nave?query=... variations.
  (function routeNave() {
    const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
    if (path === '/nave') {
      showScreen('screen-settings');
      // Focus the password input so the user can just start typing.
      const pwInput = document.getElementById('admin-password-input');
      if (pwInput) setTimeout(() => pwInput.focus(), 50);
    }
  })();

  // ── SCROLL-TO-TOP BUTTON ─────────────────────────────────────────
  const scrollTopBtn = document.getElementById('btn-scroll-top');
  if (scrollTopBtn) {
    let _scrollTicking = false;
    window.addEventListener('scroll', () => {
      if (!_scrollTicking) {
        window.requestAnimationFrame(() => {
          scrollTopBtn.classList.toggle('visible', window.scrollY > 300);
          _scrollTicking = false;
        });
        _scrollTicking = true;
      }
    });
    scrollTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ── EASTER EGGS: secret-keyword triggers ─────────────────────────
  // Rolling keystroke buffer. Each trigger has its own quip pool and
  // fires a screen flash + toast. Ignores typing inside form fields.
  // Cooldown prevents back-to-back spam.
  (function () {
    // Trigger -> array of possible quips. Random pick on each fire.
    const TRIGGER_MAP = {
      'false': [
        'FALSE. Black bears are the most predatory of the bear family. They will eat both fish and honey.',
        'FALSE. Black bear. That\'s correct.',
        'FALSE. A peacock cannot fly with a full belly. Anyone who has half a brain knows that.'
      ],
      'schrute': [
        'Identity theft is not a joke, Jim! Millions of families suffer every year!',
        'Through concentration, I can raise and lower my cholesterol at will.',
        'Whenever I\'m about to do something, I think: would an idiot do that? And if they would, I do not do that thing.'
      ],
      'bears': [
        'Bears. Beets. Battlestar Galactica.',
        'Question: what kind of bear is best? Black bear.',
        'Fact. Bears eat beets.'
      ],
      'boomroasted': [
        'BOOM. ROASTED.',
        'Boom. Roasted. Toby, you\'re Spider-Man.',
        'Pam, you failed art school. Boom. Roasted.'
      ],
      'mose': [
        'WELCOME, MOSE. The beets are this way.',
        'When products melt the snow off our roads, it\'s a beautiful sight.',
        'It is your birthday.'
      ],
      'bankruptcy': [
        'I... DECLARE... BANKRUPTCY!',
        'I didn\'t say it. I declared it.',
        'You have to actually file the paperwork, Michael.'
      ],
      'pretzel': [
        'Best day of the year.',
        'Cinnamon sugar. Chocolate. Powdered sugar. Sweet glaze. Maple syrup. Caramel dip. Mint chip. M&Ms. Cotton candy bits. Toffee nuts. Marshmallows. Chocolate-covered raisins. Nestle Quik. And chocolate sprinkles. Wow.',
        'Stanley waits all year for this.'
      ],
      'parkour': [
        'PARKOUR!',
        'Parkour! Parkour! PARKOUR!',
        'Get to the chopper!'
      ],
      'prison': [
        'Sup, gangstas. I\'m Prison Mike.',
        'The worst thing about prison was... the dementors.',
        'You don\'t want to go to prison.'
      ],
      'scarn': [
        'Threat Level: Midnight.',
        'I\'m gonna make this whole place... DISAPPEAR.',
        'Cherry. Cherry. Boom. Boom.'
      ]
    };

    const TRIGGERS = Object.keys(TRIGGER_MAP);
    const MAX_LEN = Math.max(...TRIGGERS.map(t => t.length)) + 1;
    let buf = '';
    let cooldownUntil = 0;

    function fireEgg(trigger) {
      const flash = document.createElement('div');
      flash.className = 'schrute-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 700);
      const pool = TRIGGER_MAP[trigger];
      const quip = pool[Math.floor(Math.random() * pool.length)];
      showToast(quip, 4000);
      cooldownUntil = Date.now() + 6000;
    }

    document.addEventListener('keydown', e => {
      const t = e.target;
      const tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (t && t.isContentEditable) return;
      if (e.key.length !== 1) { buf = ''; return; }
      if (Date.now() < cooldownUntil) return;
      buf = (buf + e.key.toLowerCase()).slice(-MAX_LEN);
      for (const trig of TRIGGERS) {
        if (buf.endsWith(trig)) {
          fireEgg(trig);
          buf = '';
          return;
        }
      }
    });
  })();

});
