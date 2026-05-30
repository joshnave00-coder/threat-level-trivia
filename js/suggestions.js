'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Question Suggestions
   Public submission form + admin review queue
   ================================================================ */

const SQ_RATE_MS = 60_000;

// ── PUBLIC SUGGESTION MODAL ──────────────────────────────────────

function openSuggestQuestionModal() {
  closeFeedbackModal();
  const modal = document.getElementById('suggest-question-modal');
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
  _populateSuggestCategoryDropdown();
  setTimeout(() => document.getElementById('sq-question').focus(), 50);
}

function closeSuggestQuestionModal() {
  document.getElementById('suggest-question-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  _resetSuggestForm();
}

function _maybeCloseSuggestModal() {
  const draft = document.getElementById('sq-question').value.trim() ||
                document.getElementById('sq-answer').value.trim();
  if (draft && !confirm('Close without submitting? Your question will be lost.')) return;
  closeSuggestQuestionModal();
}

function _resetSuggestForm() {
  document.getElementById('suggest-question-form').reset();
  document.getElementById('sq-context-count').textContent = '0';
  document.getElementById('sq-error').classList.add('hidden');
  document.getElementById('sq-success').classList.add('hidden');
  const btn = document.getElementById('btn-sq-submit');
  btn.disabled = false;
  btn.textContent = 'Submit Question';
}

function _populateSuggestCategoryDropdown() {
  const sel = document.getElementById('sq-category');
  if (sel.options.length > 0) return;
  CATEGORIES.forEach(cat => sel.appendChild(new Option(cat, cat)));
}

// ── VALIDATION ───────────────────────────────────────────────────

function _validateSuggestion() {
  if (document.getElementById('sq-honeypot').value) return 'Submission rejected.';

  const submitter = document.getElementById('sq-submitter').value.trim();
  if (submitter.length > 60) return 'Name must be 60 characters or fewer.';
  if (/[<>]|script/i.test(submitter)) return 'Name contains invalid characters.';

  const question = document.getElementById('sq-question').value.trim();
  const answer   = document.getElementById('sq-answer').value.trim();
  const d1       = document.getElementById('sq-d1').value.trim();
  const d2       = document.getElementById('sq-d2').value.trim();
  const d3       = document.getElementById('sq-d3').value.trim();

  if (!question) return 'Please enter a question.';
  if (question.length < 10) return 'Question must be at least 10 characters.';
  if (question.length > 500) return 'Question must be 500 characters or fewer.';
  if (!answer)  return 'Please enter the correct answer.';
  if (answer.length > 200) return 'Answer must be 200 characters or fewer.';
  if (!d1 || !d2 || !d3) return 'All three wrong answers are required.';
  if (d1.length > 200 || d2.length > 200 || d3.length > 200) return 'Wrong answers must be 200 characters or fewer.';

  const context = document.getElementById('sq-context').value.trim();
  if (context.length > 1000) return 'Answer context must be 1,000 characters or fewer.';

  const lastSend = sessionStorage.getItem('tlt_last_suggestion');
  if (lastSend && Date.now() - parseInt(lastSend, 10) < SQ_RATE_MS) {
    return 'Please wait a moment before submitting again.';
  }

  return null;
}

// ── SUBMISSION ───────────────────────────────────────────────────

async function _submitSuggestion(e) {
  e.preventDefault();

  const errEl     = document.getElementById('sq-error');
  const successEl = document.getElementById('sq-success');
  const submitBtn = document.getElementById('btn-sq-submit');

  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  const error = _validateSuggestion();
  if (error) {
    errEl.textContent = error;
    errEl.classList.remove('hidden');
    return;
  }

  const payload = {
    submitter:   document.getElementById('sq-submitter').value.trim() || null,
    question:    document.getElementById('sq-question').value.trim(),
    answer:      document.getElementById('sq-answer').value.trim(),
    distractors: [
      document.getElementById('sq-d1').value.trim(),
      document.getElementById('sq-d2').value.trim(),
      document.getElementById('sq-d3').value.trim(),
    ],
    category:    document.getElementById('sq-category').value,
    difficulty:  document.getElementById('sq-difficulty').value,
    context:     document.getElementById('sq-context').value.trim() || null,
    status:      'pending',
    submittedAt: new Date().toISOString(),
  };

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Submitting...';

  try {
    const res = await fetch('/api/question-suggestions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const serverMsg = res.statusText || `Server returned ${res.status}`;
      throw new Error(serverMsg);
    }

    sessionStorage.setItem('tlt_last_suggestion', String(Date.now()));
    successEl.classList.remove('hidden');
    submitBtn.textContent = 'Submitted!';
    setTimeout(closeSuggestQuestionModal, 2800);
  } catch (err) {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Submit Question';
    errEl.textContent     = err && err.message ? err.message : 'Something went wrong. Please try again.';
    errEl.classList.remove('hidden');
  }
}

// ── ADMIN: LOAD & RENDER SUGGESTIONS ─────────────────────────────

async function loadAndRenderAdminSuggestions() {
  const list  = document.getElementById('admin-suggestions-list');
  const empty = document.getElementById('admin-no-suggestions');
  if (!list) return;
  list.innerHTML = '<p class="admin-empty">' + escHtml(pickLoadingQuip()) + '</p>';

  try {
    const res = await fetch('/api/question-suggestions');
    const entries = await res.json();
    if (!Array.isArray(entries) || !entries.length) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    _renderSuggestionCards(entries, list);
  } catch {
    list.innerHTML = '<p class="admin-empty">Could not load suggestions.</p>';
  }
}

function _renderSuggestionCards(entries, container) {
  // Sort a copy that carries original indices so action buttons target the right entry
  const sorted = entries
    .map((s, origIdx) => ({ ...s, _origIdx: origIdx }))
    .sort((a, b) => {
      const order = { pending: 0, deferred: 1, approved: 2, rejected: 3 };
      return (order[a.status] ?? 4) - (order[b.status] ?? 4);
    });

  container.innerHTML = sorted.map(s => {
    const i = s._origIdx;
    const resolved = s.status === 'approved' || s.status === 'rejected';
    const deferred = s.status === 'deferred';
    const statusClass = `sq-status-${s.status}`;
    return `
    <div class="suggestion-card ${resolved ? 'suggestion-resolved' : ''} ${deferred ? 'suggestion-deferred' : ''}" data-idx="${i}">
      <div class="suggestion-header">
        <span class="suggestion-status ${statusClass}">${s.status.toUpperCase()}</span>
        <span class="suggestion-who">${s.submitter ? escHtml(s.submitter) : '<em style="font-weight:400;color:var(--gray-light)">Anonymous</em>'}</span>
        <span class="suggestion-when">${s.submittedAt ? escHtml(new Date(s.submittedAt).toLocaleString()) : ''}</span>
      </div>
      <div class="suggestion-body">
        <div class="suggestion-field"><strong>Q:</strong> ${escHtml(s.question)}</div>
        <div class="suggestion-field"><strong>Correct:</strong> ${escHtml(s.answer)}</div>
        <div class="suggestion-field"><strong>Wrong:</strong> ${escHtml((s.distractors || []).join(' / '))}</div>
        <div class="suggestion-field"><strong>Category:</strong> ${escHtml(s.category)} &middot; <strong>Difficulty:</strong> ${escHtml(s.difficulty)}</div>
        ${s.context ? `<div class="suggestion-field"><strong>Context:</strong> ${escHtml(s.context)}</div>` : ''}
      </div>
      ${!resolved ? `
      <div class="suggestion-actions">
        <button class="btn btn-primary btn-sm" onclick="reviewAndReviseSuggestion(${i})">Review &amp; Revise</button>
        <button class="btn btn-secondary btn-sm" onclick="deferSuggestion(${i})">Review Later</button>
        <button class="btn btn-wrong btn-sm" onclick="rejectSuggestion(${i})">Delete</button>
      </div>` : `
      <div class="suggestion-actions">
        <button class="btn btn-wrong btn-sm" onclick="removeSuggestion(${i})">Remove</button>
      </div>`}
    </div>`;
  }).join('');
}

// ── ADMIN: ACTIONS ───────────────────────────────────────────────

let _suggestionsCache = null;

async function _loadSuggestionsCache() {
  const res = await fetch('/api/question-suggestions');
  _suggestionsCache = await res.json();
  return _suggestionsCache;
}

async function _saveSuggestions(entries) {
  const token = sessionStorage.getItem('tlt_admin_token') || '';
  await fetch('/api/question-suggestions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body:    JSON.stringify(entries),
  });
  _suggestionsCache = entries;
}

// Tracks which suggestion is being reviewed in the editor (null = normal add/edit)
let _reviewingSuggestionIdx = null;

async function reviewAndReviseSuggestion(idx) {
  const entries = await _loadSuggestionsCache();
  const s = entries[idx];
  if (!s) return;

  _reviewingSuggestionIdx = idx;
  openQuestionEditor(null);

  document.getElementById('question-modal-title').textContent = 'Review Suggested Question';
  document.getElementById('qe-question').value = s.question;
  document.getElementById('qe-answer').value = s.answer;
  document.getElementById('qe-d1').value = (s.distractors || [])[0] || '';
  document.getElementById('qe-d2').value = (s.distractors || [])[1] || '';
  document.getElementById('qe-d3').value = (s.distractors || [])[2] || '';
  document.getElementById('qe-category').value = s.category;
  document.getElementById('qe-difficulty').value = s.difficulty;
  document.getElementById('qe-context').value = s.context || '';
  document.getElementById('qe-context-count').textContent = (s.context || '').length;

  const saveBtn = document.getElementById('btn-qe-save');
  saveBtn.textContent = 'Add to Question Bank';
  saveBtn.dataset.suggestionReview = '1';
}

// Called by saveQuestion in admin.js after a successful save when reviewing a suggestion.
// Marks the suggestion as approved.
async function _markSuggestionApprovedAfterSave() {
  if (_reviewingSuggestionIdx == null) return;
  const idx = _reviewingSuggestionIdx;
  _reviewingSuggestionIdx = null;
  try {
    const entries = await _loadSuggestionsCache();
    if (entries[idx]) {
      entries[idx].status = 'approved';
      await _saveSuggestions(entries);
    }
  } catch (e) {
    console.error('Failed to update suggestion status:', e);
  }
  loadAndRenderAdminSuggestions();
}

// Called by closeQuestionEditor when the modal closes without saving.
function _clearSuggestionReviewState() {
  _reviewingSuggestionIdx = null;
  const saveBtn = document.getElementById('btn-qe-save');
  if (saveBtn) {
    saveBtn.textContent = 'Save Question';
    delete saveBtn.dataset.suggestionReview;
  }
}

async function deferSuggestion(idx) {
  const entries = await _loadSuggestionsCache();
  if (!entries[idx]) return;
  entries[idx].status = 'deferred';
  await _saveSuggestions(entries);
  showToast('Marked for later review.');
  loadAndRenderAdminSuggestions();
}

async function rejectSuggestion(idx) {
  if (!confirm('Reject this suggestion? It will be grayed out but kept in the list.')) return;
  const entries = await _loadSuggestionsCache();
  if (!entries[idx]) return;
  entries[idx].status = 'rejected';
  await _saveSuggestions(entries);
  showToast('Suggestion rejected.');
  loadAndRenderAdminSuggestions();
}

// Permanently deletes a resolved (approved/rejected) suggestion from the
// list entirely - not a status change. This is the "make it disappear" action.
async function removeSuggestion(idx) {
  if (!confirm('Permanently remove this suggestion from the list? This cannot be undone.')) return;
  const entries = await _loadSuggestionsCache();
  if (!entries[idx]) return;
  entries.splice(idx, 1);
  await _saveSuggestions(entries);
  showToast('Suggestion removed from the list.');
  loadAndRenderAdminSuggestions();
}

// ── INIT ─────────────────────────────────────────────────────────

function initSuggestions() {
  document.getElementById('btn-suggest-question').addEventListener('click', openSuggestQuestionModal);

  // If a user selects "New Question Idea" in the feedback type dropdown,
  // redirect them to the dedicated question submission form.
  document.getElementById('fb-type').addEventListener('change', e => {
    if (e.target.value === 'question') {
      e.target.value = 'general';  // reset so it's not stuck on "question" if they come back
      openSuggestQuestionModal();
    }
  });
  document.getElementById('btn-suggest-close').addEventListener('click', _maybeCloseSuggestModal);
  document.getElementById('btn-sq-cancel').addEventListener('click', _maybeCloseSuggestModal);
  document.getElementById('suggest-question-form').addEventListener('submit', _submitSuggestion);
  document.getElementById('sq-context').addEventListener('input', e => {
    document.getElementById('sq-context-count').textContent = e.target.value.length;
  });

  document.getElementById('suggest-question-modal').addEventListener('click', e => {
    if (e.target.id === 'suggest-question-modal') _maybeCloseSuggestModal();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('suggest-question-modal').classList.contains('hidden')) {
      _maybeCloseSuggestModal();
    }
  });
}
