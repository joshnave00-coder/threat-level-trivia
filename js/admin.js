'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Admin & Settings
   Password gate, question management, dispute/feedback review
   ================================================================ */

let _adminToken = sessionStorage.getItem('tlt_admin_token') || null;
let activeAdminTab = 'questions';
let adminQFilter = { search: '', category: 'all', difficulty: 'all' };
let editingTagsFor = [];

async function adminLogin() {
  const input   = document.getElementById('admin-password-input');
  const errorEl = document.getElementById('admin-login-error');
  const password = input.value;
  input.value = '';

  try {
    const res  = await fetch('/api/admin/login', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.ok && data.token) {
      _adminToken = data.token;
      sessionStorage.setItem('tlt_admin_token', data.token);
      errorEl.classList.add('hidden');
      try { renderAdminQuestions(); } catch (err) { console.error('renderAdminQuestions failed:', err); }
      try { renderAdminDisputes();  } catch (err) { console.error('renderAdminDisputes failed:', err);  }
      loadAndRenderAdminFeedback();
      loadAndRenderAdminLeaderboard();
      loadAndRenderAdminSuggestions();
      showScreen('screen-admin');
    } else {
      errorEl.classList.remove('hidden');
      document.getElementById('admin-password-input').focus();
    }
  } catch {
    errorEl.classList.remove('hidden');
    document.getElementById('admin-password-input').focus();
  }
}

// ── NAV PANELS ────────────────────────────────────────────────────
function switchAdminPanel(panel) {
  activeAdminTab = panel;
  document.querySelectorAll('.admin-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.panel === panel));
  ['questions', 'suggestions', 'disputes', 'feedback', 'community-ratings', 'answer-stats', 'leaderboard', 'export', 'site-settings', 'version-history', 'admin-help'].forEach(name => {
    const el = document.getElementById(`admin-panel-${name}`);
    if (el) el.classList.toggle('hidden', panel !== name);
  });
  if (panel === 'site-settings') applySiteSettings();
  if (panel === 'disputes') renderAdminDisputes();
  if (panel === 'feedback') loadAndRenderAdminFeedback();
  if (panel === 'questions') renderAdminQuestions();
  if (panel === 'suggestions') loadAndRenderAdminSuggestions();
  if (panel === 'community-ratings') renderAdminRatings();
  if (panel === 'answer-stats') loadAndRenderAnswerStats();
  if (panel === 'leaderboard') loadAndRenderAdminLeaderboard();
}

// ── QUESTION MANAGEMENT ──────────────────────────────────────────

function renderAdminQuestions() {
  const allQs = getAllManagedQuestions();
  const disabled = getDisabledQuestions();

  let filtered = allQs;
  if (adminQFilter.category !== 'all') {
    filtered = filtered.filter(q => q.category === adminQFilter.category);
  }
  if (adminQFilter.difficulty !== 'all') {
    filtered = filtered.filter(q => q.difficulty === adminQFilter.difficulty);
  }
  if (adminQFilter.search) {
    const s = adminQFilter.search.toLowerCase().trim();
    // If the search is a pure number, match by question ID exactly so admins
    // can jump straight to "question 225" from a dispute screenshot. Falls
    // back to substring match on the question/answer text otherwise.
    const idMatch = /^\d+$/.test(s) ? parseInt(s, 10) : null;
    filtered = filtered.filter(q => {
      if (idMatch !== null && q.id === idMatch) return true;
      return q.question.toLowerCase().includes(s) ||
             q.answer.toLowerCase().includes(s);
    });
  }

  const countEl = document.getElementById('admin-questions-count');
  const container = document.getElementById('admin-questions-list');
  if (!countEl || !container) return;

  countEl.textContent = `${filtered.length} of ${allQs.length} question${allQs.length !== 1 ? 's' : ''}`;

  if (!filtered.length) {
    container.innerHTML = '<p class="admin-empty">No questions match your filters.</p>';
    return;
  }

  const baseIds = new Set(QUESTIONS.map(q => q.id));
  const edits = getQuestionEdits();

  container.innerHTML = filtered.map(q => {
    const isDisabled = disabled.includes(q.id);
    const isCustom = !baseIds.has(q.id);
    const isEdited = !isCustom && !!edits[q.id];
    return `
      <div class="aq-card ${isDisabled ? 'aq-disabled' : ''}" data-qid="${q.id}">
        <div class="aq-main">
          <div class="aq-id">Question ID: ${q.id}</div>
          <div class="aq-text">${escHtml(q.question)}</div>
          <div class="aq-answer"><strong>A:</strong> ${escHtml(q.answer)}</div>
          <div class="aq-badges">
            <span class="badge badge-category">${escHtml(q.category)}</span>
            <span class="badge ${difficultyClass(q.difficulty)}">${escHtml(q.difficulty)}</span>
            ${isDisabled ? '<span class="badge aq-badge-disabled">DISABLED</span>' : ''}
            ${isCustom ? '<span class="badge aq-badge-custom">CUSTOM</span>' : ''}
            ${isEdited ? '<span class="badge aq-badge-edited">EDITED</span>' : ''}
          </div>
        </div>
        <div class="aq-actions">
          <button class="btn btn-secondary btn-sm" onclick="openQuestionEditor(${q.id})">Edit</button>
          <button class="btn btn-sm ${isDisabled ? 'btn-correct' : 'aq-btn-disable'}"
                  onclick="toggleQuestionDisabledAdmin(${q.id})">
            ${isDisabled ? 'Enable' : 'Disable'}
          </button>
          ${isEdited ? `<button class="btn btn-sm aq-btn-revert" onclick="revertAdminQuestionEdit(${q.id})">Revert</button>` : ''}
          <button class="btn btn-wrong btn-sm" onclick="deleteAdminQuestion(${q.id})">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function toggleQuestionDisabledAdmin(id) {
  const wasDisabled = isQuestionDisabled(id);
  setQuestionDisabled(id, !wasDisabled);
  renderAdminQuestions();
  showToast(wasDisabled ? 'Question enabled.' : 'Question disabled - hidden from gameplay.');
}

function deleteAdminQuestion(id) {
  if (!confirm('Permanently delete this question? This cannot be undone.')) return;
  markQuestionDeleted(id);
  renderAdminQuestions();
  showToast('Question deleted.');
}

function revertAdminQuestionEdit(id) {
  if (!confirm('Revert this question to its original text? Your edits will be lost.')) return;
  revertQuestionEdit(id);
  renderAdminQuestions();
  showToast('Question reverted to original.');
}

function populateCategoryDropdowns() {
  const filterSelect = document.getElementById('aq-filter-category');
  const modalSelect  = document.getElementById('qe-category');
  if (!filterSelect || !modalSelect) return;
  const statsSelect = document.getElementById('as-filter-category');
  CATEGORIES.forEach(cat => {
    filterSelect.appendChild(new Option(cat, cat));
    modalSelect.appendChild(new Option(cat, cat));
    if (statsSelect) statsSelect.appendChild(new Option(cat, cat));
  });
}

function populateCharacterDropdowns() {
  ['solo-character', 'party-character', 'challenge-character'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    // Clear existing options past the "Any Character" default
    while (sel.options.length > 1) sel.remove(1);
    CHARACTER_TAGS.forEach(({ tag, label }) => {
      sel.appendChild(new Option(label, tag));
    });
  });
}

function updateLobbyPoolCount(mode) {
  const countEl = document.getElementById(`${mode}-pool-count`);
  if (!countEl) return;
  const category  = document.getElementById(`${mode}-category`)?.value || 'all';
  const character = document.getElementById(`${mode}-character`)?.value || 'all';
  const diffInput = document.querySelector(`input[name="${mode}-diff"]:checked`);
  const difficulty = diffInput ? diffInput.value : 'Mixed';
  const excludeBts = !!document.getElementById(`${mode}-exclude-bts`)?.checked;
  const n = filterQuestions(category, difficulty, character, excludeBts).length;

  const countInput = document.querySelector(`input[name="${mode}-count"]:checked`);
  const requested = countInput ? parseInt(countInput.value, 10) : 10;
  const startBtn = document.getElementById(`btn-${mode}-start`);

  if (n < requested) {
    countEl.textContent = `Only ${n} question${n !== 1 ? 's' : ''} available (need ${requested})`;
    countEl.className = 'lobby-pool-count lobby-pool-count-low';
    if (startBtn) startBtn.disabled = true;
  } else if (category === 'all' && character === 'all' && difficulty === 'Mixed' && !excludeBts) {
    countEl.textContent = '';
    if (startBtn) startBtn.disabled = false;
  } else {
    countEl.textContent = `${n} question${n !== 1 ? 's' : ''} available`;
    countEl.className = `lobby-pool-count${n < 5 ? ' lobby-pool-count-low' : ''}`;
    if (startBtn) startBtn.disabled = false;
  }
}

function autoTagAllQuestions() {
  const allQs = getAllManagedQuestions();
  let tagged = 0;

  allQs.forEach(q => {
    const haystack = `${q.question} ${q.answer}`;
    const detected = [];

    CHARACTER_TAGS.forEach(({ tag, patterns }) => {
      const matches = patterns.some(p =>
        new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(haystack)
      );
      if (matches) detected.push(tag);
    });

    if (!detected.length) return;

    // Merge with existing tags (don't overwrite non-character tags)
    const existing = getEffectiveTags(q);
    const merged = [...new Set([...existing, ...detected])];
    saveTagsForQuestion(q.id, merged);
    tagged++;
  });

  // Persist merged tags to file
  syncTagsToFile();
  return tagged;
}

// ── QUESTION EDITOR MODAL ────────────────────────────────────────

function openQuestionEditor(id) {
  const modal = document.getElementById('question-modal');
  const title = document.getElementById('question-modal-title');
  const form = document.getElementById('question-form');
  const errorEl = document.getElementById('qe-error');
  errorEl.classList.add('hidden');
  form.reset();

  const idBadge = document.getElementById('qe-id-badge');
  if (id != null) {
    const allQs = getAllManagedQuestions();
    const q = allQs.find(x => x.id === id);
    if (!q) return;
    title.textContent = 'Edit Question';
    if (idBadge) idBadge.textContent = `Question ID: ${q.id}`;
    document.getElementById('qe-id').value = q.id;
    document.getElementById('qe-question').value = q.question;
    document.getElementById('qe-answer').value = q.answer;
    document.getElementById('qe-d1').value = q.distractors[0] || '';
    document.getElementById('qe-d2').value = q.distractors[1] || '';
    document.getElementById('qe-d3').value = q.distractors[2] || '';
    document.getElementById('qe-category').value = q.category;
    document.getElementById('qe-difficulty').value = q.difficulty;
    document.getElementById('qe-context').value = q.context || '';
    document.getElementById('qe-context-count').textContent = (q.context || '').length;
    editingTagsFor = [...getEffectiveTags(q)];
  } else {
    title.textContent = 'Add New Question';
    if (idBadge) idBadge.textContent = 'Question ID: New (assigned on save)';
    document.getElementById('qe-id').value = '';
    document.getElementById('qe-category').value = CATEGORIES[0];
    document.getElementById('qe-difficulty').value = 'Medium';
    document.getElementById('qe-context').value = '';
    document.getElementById('qe-context-count').textContent = '0';
    editingTagsFor = [];
  }

  renderModalTags();
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');

  // Reset scroll to top each time the modal opens. Without this, the
  // .modal-box scrollTop persists between opens, so reopening after a
  // long-form submission would land mid-form on a blank card.
  const box = modal.querySelector('.modal-box');
  if (box) box.scrollTop = 0;
}

function closeQuestionEditor() {
  document.getElementById('question-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  if (typeof _clearSuggestionReviewState === 'function') _clearSuggestionReviewState();
}

function renderModalTags() {
  const chips = document.getElementById('qe-tag-chips');
  chips.innerHTML = editingTagsFor.map((t, i) =>
    `<span class="tag-chip">${escHtml(t)}<button type="button" class="tag-remove" onclick="removeModalTag(${i})">×</button></span>`
  ).join('');
}

function addModalTag() {
  const input = document.getElementById('qe-tag-input');
  const tag = input.value.trim();
  if (!tag) return;
  if (editingTagsFor.includes(tag)) { showToast('Tag already exists.'); input.value = ''; return; }
  editingTagsFor.push(tag);
  input.value = '';
  renderModalTags();
}

function removeModalTag(idx) {
  editingTagsFor.splice(idx, 1);
  renderModalTags();
}

function saveQuestion(e) {
  e.preventDefault();
  const errorEl = document.getElementById('qe-error');
  const question = document.getElementById('qe-question').value.trim();
  const answer = document.getElementById('qe-answer').value.trim();
  const d1 = document.getElementById('qe-d1').value.trim();
  const d2 = document.getElementById('qe-d2').value.trim();
  const d3 = document.getElementById('qe-d3').value.trim();
  const category = document.getElementById('qe-category').value;
  const difficulty = document.getElementById('qe-difficulty').value;
  const idVal = document.getElementById('qe-id').value;

  if (!question || !answer || !d1 || !d2 || !d3) {
    errorEl.textContent = 'All fields are required. No empty questions or answers.';
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  const context = document.getElementById('qe-context').value.trim();
  const data = { question, answer, distractors: [d1, d2, d3], category, difficulty };
  if (context) data.context = context;
  const baseIds = new Set(QUESTIONS.map(q => q.id));

  if (idVal) {
    const id = parseInt(idVal, 10);
    if (baseIds.has(id)) {
      saveQuestionEdit(id, data);
    } else {
      updateCustomQuestion(id, data);
    }
    saveTagsForQuestion(id, editingTagsFor);
    showToast('Question updated.');
  } else {
    const newId = getNextQuestionId();
    const newQ = { id: newId, ...data, tags: editingTagsFor };
    addCustomQuestion(newQ);
    if (editingTagsFor.length) saveTagsForQuestion(newId, editingTagsFor);
    showToast('New question added!');
  }

  if (typeof _reviewingSuggestionIdx !== 'undefined' && _reviewingSuggestionIdx != null &&
      typeof _markSuggestionApprovedAfterSave === 'function') {
    _markSuggestionApprovedAfterSave();
  }

  closeQuestionEditor();
  renderAdminQuestions();
}

// ── QUESTION EXPORT ───────────────────────────────────────────────

const EXPORT_COL_MAP = {
  'id':              { header: 'ID',               get: (q)         => q.id },
  'question':        { header: 'Question',         get: (q)         => csvCell(q.question) },
  'answer':          { header: 'Answer',           get: (q)         => csvCell(q.answer) },
  'distractor1':     { header: 'Distractor 1',     get: (q)         => csvCell(q.distractors[0] || '') },
  'distractor2':     { header: 'Distractor 2',     get: (q)         => csvCell(q.distractors[1] || '') },
  'distractor3':     { header: 'Distractor 3',     get: (q)         => csvCell(q.distractors[2] || '') },
  'category':        { header: 'Category',         get: (q)         => csvCell(q.category) },
  'difficulty':      { header: 'Difficulty',       get: (q)         => q.difficulty },
  'context':         { header: 'Answer Context',    get: (q)         => csvCell(q.context || '') },
  'tags':            { header: 'Tags',             get: (q)         => csvCell(getEffectiveTags(q).join(', ')) },
  'type':            { header: 'Type',             get: (q, ctx)    => !ctx.baseIds.has(q.id) ? 'Custom' : ctx.edits[q.id] ? 'Edited' : 'Base' },
  'enabled':         { header: 'Enabled',          get: (q, ctx)    => ctx.disabled.includes(q.id) ? 'No' : 'Yes' },
  'community-avg':   { header: 'Community Avg',    get: (q)         => { const i = getCommunityDifficultyInfo(q.id); return i ? i.avg : ''; } },
  'community-count': { header: 'Community Count',  get: (q)         => { const i = getCommunityDifficultyInfo(q.id); return i ? i.count : '0'; } },
};

function csvCell(val) {
  return `"${String(val).replace(/"/g, '""')}"`;
}

function exportQuestions() {
  const allQs = getAllManagedQuestions();
  if (!allQs.length) { showToast('No questions to export.'); return; }

  const checked = [...document.querySelectorAll('input[name="export-col"]:checked')].map(c => c.value);
  if (!checked.length) { showToast('Select at least one column to export.'); return; }

  const ctx = {
    baseIds:  new Set(QUESTIONS.map(q => q.id)),
    edits:    getQuestionEdits(),
    disabled: getDisabledQuestions(),
  };

  const headers = checked.map(c => EXPORT_COL_MAP[c].header);
  const rows    = allQs.map(q => checked.map(c => EXPORT_COL_MAP[c].get(q, ctx)));
  const csv     = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob    = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const a       = document.createElement('a');
  a.href        = URL.createObjectURL(blob);
  a.download    = `tlt-questions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  showToast(`Exported ${allQs.length} questions.`);
}

// ── DISPUTES ──────────────────────────────────────────────────────
function renderAdminDisputes() {
  const disputes = getDisputes();
  const container = document.getElementById('admin-disputes-list');
  const empty     = document.getElementById('admin-no-disputes');

  const open = disputes.filter(d => d.status === 'open');
  const rest = disputes.filter(d => d.status !== 'open');
  const all  = [...open, ...rest];

  if (!all.length) {
    container.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  container.innerHTML = all.map(d => `
    <div class="dispute-card ${d.status !== 'open' ? 'dispute-resolved' : ''}" data-id="${d.id}">
      <div class="dispute-meta">
        <span class="dispute-status dispute-status-${d.status}">${d.status.toUpperCase()}</span>
        <span class="dispute-who">${escHtml(d.player)}</span>
        <span class="dispute-when">${escHtml(d.timestamp)}</span>
        ${d.difficultyRating != null ? `<span class="dispute-rating">Rated: ${d.difficultyRating}/10</span>` : ''}
      </div>
      ${d.questionId ? `<div class="aq-id">Question ID: ${d.questionId}</div>` : ''}
      <div class="dispute-q"><strong>Q:</strong> ${escHtml(d.question)}</div>
      <div class="dispute-a"><strong>A:</strong> ${escHtml(d.answer)}</div>
      <div class="dispute-text"><strong>Issue:</strong> ${escHtml(d.disputeText)}</div>
      <div class="dispute-actions">
        ${d.questionId ? `<button class="btn btn-secondary btn-sm" onclick="openQuestionEditor(${d.questionId})">Edit Question</button>` : ''}
        ${d.status === 'open' ? `
          <button class="btn btn-correct btn-sm" onclick="resolveDispute(${d.id},'approved')">Approve</button>
          <button class="btn btn-wrong btn-sm" onclick="resolveDispute(${d.id},'dismissed')">Dismiss</button>
        ` : `
          <button class="btn btn-wrong btn-sm" onclick="removeDispute(${d.id})">Remove</button>
        `}
      </div>
    </div>`).join('');
}

function resolveDispute(id, status) {
  updateDisputeStatus(id, status);
  renderAdminDisputes();
  showToast(status === 'approved' ? 'Question approved for review.' : 'Dispute dismissed. Moving on.');
}

// Permanently removes a resolved dispute card from the list and the server file.
function removeDispute(id) {
  if (!confirm('Permanently remove this dispute from the list? This cannot be undone.')) return;
  deleteDispute(id);
  renderAdminDisputes();
  showToast('Dispute removed from the list.');
}

function _adminHeaders() {
  return { 'Content-Type': 'application/json', 'X-Admin-Token': _adminToken || '' };
}


// ── SUBMITTED FEEDBACK (admin view) ──────────────────────────────
const _FB_TYPE_LABELS = {
  general: 'General', suggestion: 'Suggestion', bug: 'Bug Report',
  question: 'Question Idea', other: 'Other',
};

// ── LEADERBOARD MANAGEMENT ────────────────────────────────────────

function loadAndRenderAdminLeaderboard() {
  const list  = document.getElementById('admin-lb-list');
  const empty = document.getElementById('admin-lb-empty');
  if (!list) return;
  list.innerHTML = '<p class="admin-empty">' + escHtml(pickLoadingQuip()) + '</p>';

  fetch('/api/leaderboard')
    .then(r => r.json())
    .then(entries => {
      if (!Array.isArray(entries) || !entries.length) {
        list.innerHTML = '';
        empty.classList.remove('hidden');
        return;
      }
      empty.classList.add('hidden');
      list.innerHTML = entries.map((e, i) => `
        <div class="admin-lb-row">
          <span class="admin-lb-rank">${i + 1}</span>
          <div class="admin-lb-info">
            <span class="admin-lb-name">${escHtml(e.name)}</span>
            <span class="admin-lb-detail">${e.score}/${e.total} &middot; ${e.accuracy}% &middot; ${escHtml(e.difficulty)} &middot; ${escHtml(e.category)} &middot; ${escHtml(e.date)}</span>
          </div>
          <button class="btn btn-wrong btn-sm admin-lb-remove" onclick="removeLeaderboardEntry(${e.id ?? 'null'}, this)">Remove</button>
        </div>`).join('');
    })
    .catch(() => {
      if (list) list.innerHTML = '<p class="admin-empty">Could not load leaderboard.</p>';
    });
}

async function removeLeaderboardEntry(id, btn) {
  if (id === null || id === undefined) { showToast('Entry has no ID - cannot remove.'); return; }
  if (!confirm('Remove this leaderboard entry? This cannot be undone.')) return;
  btn.disabled = true;
  btn.textContent = 'Removing...';
  try {
    const res = await fetch('/api/admin/leaderboard/remove', {
      method: 'POST',
      headers: _adminHeaders(),
      body: JSON.stringify({ id }),
    });
    if (res.ok) {
      showToast('Entry removed.');
      loadAndRenderAdminLeaderboard();
    } else {
      btn.disabled = false;
      btn.textContent = 'Remove';
      showToast('Failed to remove entry.');
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Remove';
    showToast('Server error - could not remove entry.');
  }
}

function loadAndRenderAdminFeedback() {
  fetch('/api/feedback')
    .then(r => r.json())
    .then(entries => renderAdminFeedback(entries))
    .catch(() => showToast('Could not load feedback - is the server running?'));
}

// Cached full feedback array so the Remove action can splice by original
// index and post the whole array back (feedback entries have no IDs).
let _adminFeedbackCache = [];

function renderAdminFeedback(entries) {
  const list  = document.getElementById('admin-feedback-list');
  const empty = document.getElementById('admin-no-feedback');
  if (!entries || !entries.length) {
    _adminFeedbackCache = [];
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  _adminFeedbackCache = [...entries];
  empty.classList.add('hidden');
  // Render newest-first while keeping each card's original-array index on
  // its Remove button (build in array order, then reverse the HTML).
  const cards = _adminFeedbackCache.map((fb, idx) => `
    <div class="feedback-card">
      <div class="feedback-card-meta">
        <span class="feedback-type-badge">${escHtml(_FB_TYPE_LABELS[fb.type] || fb.type)}</span>
        <span class="feedback-who">${fb.name ? escHtml(fb.name) : '<em style="font-weight:400;color:var(--gray-light)">Anonymous</em>'}</span>
        ${fb.email ? `<span class="feedback-email">${escHtml(fb.email)}</span>` : ''}
        <span class="feedback-when">${fb.submittedAt ? escHtml(new Date(fb.submittedAt).toLocaleString()) : ''}</span>
      </div>
      <div class="feedback-msg">${escHtml(fb.message)}</div>
      <div class="feedback-actions">
        <button class="btn btn-wrong btn-sm" onclick="removeFeedbackEntry(${idx})">Remove</button>
      </div>
    </div>`);
  list.innerHTML = cards.reverse().join('');
}

// Permanently removes a feedback entry. Splices the cached array by index,
// posts the full array back with the admin token, and re-renders.
async function removeFeedbackEntry(idx) {
  if (idx < 0 || idx >= _adminFeedbackCache.length) return;
  if (!confirm('Permanently remove this feedback entry? This cannot be undone.')) return;
  const updated = _adminFeedbackCache.filter((_, i) => i !== idx);
  try {
    const res = await fetch('/api/feedback', {
      method:  'POST',
      headers: _adminHeaders(),
      body:    JSON.stringify(updated),
    });
    if (!res.ok) throw new Error(`Server ${res.status}`);
    renderAdminFeedback(updated);
    showToast('Feedback removed.');
  } catch {
    showToast('Could not remove feedback - is the server running?');
  }
}

// ── COMMUNITY DIFFICULTY RATINGS ─────────────────────────────────
let adminRatingsFilter = { search: '', status: 'all' };

function renderAdminRatings() {
  const allQs = getAllManagedQuestions();
  const disabled = getDisabledQuestions();

  // Build per-question community info
  const withInfo = allQs.map(q => ({
    q,
    isDisabled: disabled.includes(q.id),
    info: getCommunityDifficultyInfo(q.id),
    votes: getVoteSummary(q.id),
  }));

  // Apply filters
  let filtered = withInfo;
  if (adminRatingsFilter.search) {
    const s = adminRatingsFilter.search.toLowerCase();
    filtered = filtered.filter(({ q }) =>
      q.question.toLowerCase().includes(s) || q.answer.toLowerCase().includes(s));
  }
  if (adminRatingsFilter.status === 'has-ratings') {
    filtered = filtered.filter(({ info }) => info !== null);
  } else if (adminRatingsFilter.status === 'overriding') {
    filtered = filtered.filter(({ info }) => info && info.count >= COMMUNITY_THRESHOLD);
  } else if (adminRatingsFilter.status === 'no-ratings') {
    filtered = filtered.filter(({ info }) => info === null);
  } else if (adminRatingsFilter.status === 'has-votes') {
    filtered = filtered.filter(({ votes }) => votes.total > 0);
  } else if (adminRatingsFilter.status === 'more-downvotes') {
    filtered = filtered.filter(({ votes }) => votes.total > 0 && votes.down > votes.up);
  }

  // Sort: questions with ratings first (most ratings first), then unrated
  filtered.sort((a, b) => {
    const ac = a.info ? a.info.count : -1;
    const bc = b.info ? b.info.count : -1;
    return bc - ac;
  });

  const container = document.getElementById('admin-ratings-list');
  const countEl   = document.getElementById('admin-ratings-count');
  if (!container || !countEl) return;

  const totalRated    = withInfo.filter(({ info }) => info !== null).length;
  const totalOverride = withInfo.filter(({ info }) => info && info.count >= COMMUNITY_THRESHOLD).length;
  const totalVoted    = withInfo.filter(({ votes }) => votes.total > 0).length;
  const totalUpvotes  = withInfo.reduce((sum, { votes }) => sum + votes.up, 0);
  const totalDownvotes = withInfo.reduce((sum, { votes }) => sum + votes.down, 0);
  countEl.innerHTML =
    `${filtered.length} of ${allQs.length} questions shown  |  ` +
    `${totalRated} have community ratings  |  ` +
    `${totalOverride} currently overriding<br>` +
    `${totalVoted} have votes  |  ` +
    `<span class="cr-summary-up">&#x25B2; ${totalUpvotes}</span> upvotes  |  ` +
    `<span class="cr-summary-down">&#x25BC; ${totalDownvotes}</span> downvotes`;

  if (!filtered.length) {
    container.innerHTML = '<p class="admin-empty">No questions match your filters.</p>';
    return;
  }

  container.innerHTML = filtered.map(({ q, isDisabled, info, votes }) => {
    const hasRatings  = info !== null;
    const isOverride  = hasRatings && info.count >= COMMUNITY_THRESHOLD;
    const needsMore   = hasRatings && !isOverride ? COMMUNITY_THRESHOLD - info.count : 0;
    const hasVotes    = votes.total > 0;

    let statusBadge;
    if (isOverride) {
      statusBadge = `<span class="badge cr-badge-overriding">Overriding</span>`;
    } else if (hasRatings) {
      statusBadge = `<span class="badge cr-badge-pending">Need ${needsMore} more</span>`;
    } else {
      statusBadge = `<span class="cr-no-data">No ratings yet</span>`;
    }

    const communitySection = hasRatings ? `
      <span class="cr-divider">|</span>
      <span class="cr-label">Community:</span>
      <span class="badge ${difficultyClass(info.label)}">${escHtml(info.label)}</span>
      <span class="cr-score">avg ${info.avg}</span>
      <span class="cr-count-text">(${info.count} rating${info.count !== 1 ? 's' : ''})</span>
      ${statusBadge}` : statusBadge;

    const voteSection = hasVotes ? `
      <div class="cr-vote-row">
        <span class="cr-label">Votes:</span>
        <span class="cr-vote-up" title="${votes.up} player${votes.up !== 1 ? 's' : ''} upvoted this question">&#x25B2; ${votes.up}</span>
        <span class="cr-vote-down" title="${votes.down} player${votes.down !== 1 ? 's' : ''} downvoted this question">&#x25BC; ${votes.down}</span>
        <span class="cr-vote-total">(${votes.total} vote${votes.total !== 1 ? 's' : ''})</span>
        ${votes.total >= 5 && votes.down > votes.up ? '<span class="badge cr-badge-flagged">Needs Review</span>' : ''}
      </div>` : `<div class="cr-vote-row"><span class="cr-no-data">No votes yet</span></div>`;

    return `
      <div class="cr-card ${!hasRatings && !hasVotes ? 'cr-no-ratings' : ''} ${isDisabled ? 'aq-disabled' : ''}" data-qid="${q.id}">
        <div class="cr-main">
          <div class="aq-id">Question ID: ${q.id}</div>
          <div class="cr-question-text">${escHtml(q.question)}</div>
          <div class="cr-answer"><strong>A:</strong> ${escHtml(q.answer)}</div>
          <div class="cr-data-row">
            <span class="cr-label">Original:</span>
            <span class="badge ${difficultyClass(q.difficulty)}">${escHtml(q.difficulty)}</span>
            ${communitySection}
          </div>
          ${voteSection}
        </div>
        ${hasRatings || hasVotes ? `
        <div class="cr-actions">
          ${hasRatings ? `<button class="btn btn-sm aq-btn-disable" onclick="resetQuestionRatingsAdmin(${q.id})">Reset Ratings</button>` : ''}
          ${hasVotes ? `<button class="btn btn-sm aq-btn-disable" onclick="resetQuestionVotesAdmin(${q.id})">Reset Votes</button>` : ''}
        </div>` : ''}
      </div>`;
  }).join('');
}

function resetQuestionRatingsAdmin(questionId) {
  const allQs = getAllManagedQuestions();
  const q = allQs.find(x => x.id === questionId);
  const info = getCommunityDifficultyInfo(questionId);
  if (!info) return;
  const label = q ? `"${q.question.slice(0, 40)}${q.question.length > 40 ? '...' : ''}"` : `Question ID: ${questionId}`;
  if (!confirm(`Reset all ${info.count} community rating(s) for ${label}?\n\nThis cannot be undone.`)) return;
  resetQuestionRatings(questionId);
  renderAdminRatings();
  showToast(`Community ratings cleared for Question ID: ${questionId}.`);
}

function resetQuestionVotesAdmin(questionId) {
  const allQs = getAllManagedQuestions();
  const q = allQs.find(x => x.id === questionId);
  const votes = getVoteSummary(questionId);
  if (!votes.total) return;
  const label = q ? `"${q.question.slice(0, 40)}${q.question.length > 40 ? '...' : ''}"` : `Question ID: ${questionId}`;
  if (!confirm(`Reset all ${votes.total} vote(s) for ${label}?\n\nThis cannot be undone.`)) return;
  resetQuestionVotes(questionId);
  renderAdminRatings();
  showToast(`Votes cleared for Question ID: ${questionId}.`);
}

// ── ANSWER STATS ─────────────────────────────────────────────────
// Per-question correct/wrong tallies aggregated server-side. The admin
// panel reads them from /api/answer-stats and renders a sortable list.
let adminAnswerStatsFilter = { search: '', category: 'all', difficulty: 'all', sort: 'most-answered' };
let _answerStatsCache = {};   // { "<id>": { correct, wrong } }

function loadAndRenderAnswerStats() {
  const listEl = document.getElementById('admin-as-list');
  if (listEl) listEl.innerHTML = '<p class="admin-empty">Loading answer stats...</p>';
  fetch('/api/answer-stats', { cache: 'no-store' })
    .then(r => r.json())
    .then(stats => {
      _answerStatsCache = (stats && typeof stats === 'object' && !Array.isArray(stats)) ? stats : {};
      renderAnswerStats();
    })
    .catch(() => {
      _answerStatsCache = {};
      if (listEl) listEl.innerHTML = '<p class="admin-empty">Could not load answer stats. Is the server running?</p>';
    });
}

function _statsForQuestion(qid) {
  const e = _answerStatsCache[String(qid)];
  const correct = e && Number.isFinite(e.correct) ? e.correct : 0;
  const wrong   = e && Number.isFinite(e.wrong)   ? e.wrong   : 0;
  const total   = correct + wrong;
  const pct     = total > 0 ? Math.round((correct / total) * 100) : null;
  return { correct, wrong, total, pct };
}

function renderAnswerStats() {
  const container = document.getElementById('admin-as-list');
  const countEl   = document.getElementById('admin-as-count');
  if (!container || !countEl) return;

  const allQs = getAllManagedQuestions();
  const disabled = getDisabledQuestions();
  const f = adminAnswerStatsFilter;

  let rows = allQs.map(q => ({ q, isDisabled: disabled.includes(q.id), stats: _statsForQuestion(q.id) }));

  if (f.category !== 'all')   rows = rows.filter(r => r.q.category === f.category);
  if (f.difficulty !== 'all') rows = rows.filter(r => r.q.difficulty === f.difficulty);
  if (f.search) {
    const s = f.search.toLowerCase().trim();
    const idMatch = /^\d+$/.test(s) ? parseInt(s, 10) : null;
    rows = rows.filter(r =>
      (idMatch !== null && r.q.id === idMatch) ||
      r.q.question.toLowerCase().includes(s) ||
      r.q.answer.toLowerCase().includes(s));
  }

  // Sorting. For "% correct" sorts, questions with zero answers sink to the
  // bottom so the meaningful data stays at the top.
  const NEG = -1;
  rows.sort((a, b) => {
    switch (f.sort) {
      case 'least-answered': return a.stats.total - b.stats.total;
      case 'lowest-pct':
        return (a.stats.pct === null ? 101 : a.stats.pct) - (b.stats.pct === null ? 101 : b.stats.pct)
            || b.stats.total - a.stats.total;
      case 'highest-pct':
        return (b.stats.pct === null ? NEG : b.stats.pct) - (a.stats.pct === null ? NEG : a.stats.pct)
            || b.stats.total - a.stats.total;
      case 'id': return a.q.id - b.q.id;
      case 'most-answered':
      default: return b.stats.total - a.stats.total || a.q.id - b.q.id;
    }
  });

  // Headline totals across the whole bank (not just the filtered view).
  const grandCorrect = allQs.reduce((s, q) => s + _statsForQuestion(q.id).correct, 0);
  const grandWrong   = allQs.reduce((s, q) => s + _statsForQuestion(q.id).wrong, 0);
  const grandTotal   = grandCorrect + grandWrong;
  const grandPct     = grandTotal > 0 ? Math.round((grandCorrect / grandTotal) * 100) : 0;
  const answeredQs   = allQs.filter(q => _statsForQuestion(q.id).total > 0).length;

  countEl.innerHTML =
    `${rows.length} of ${allQs.length} questions shown  |  ` +
    `${answeredQs} answered at least once<br>` +
    `${grandTotal.toLocaleString()} total answers logged  |  ` +
    `<span class="as-summary-correct">${grandCorrect.toLocaleString()} correct</span>  |  ` +
    `<span class="as-summary-wrong">${grandWrong.toLocaleString()} wrong</span>  |  ` +
    `${grandPct}% overall correct`;

  if (!rows.length) {
    container.innerHTML = '<p class="admin-empty">No questions match your filters.</p>';
    return;
  }

  container.innerHTML = rows.map(({ q, isDisabled, stats }) => {
    const { correct, wrong, total, pct } = stats;
    const pctClass = pct === null ? '' : pct >= 70 ? 'as-pct-high' : pct >= 40 ? 'as-pct-mid' : 'as-pct-low';
    const barHtml = total > 0
      ? `<div class="as-bar" title="${pct}% correct (${correct} of ${total})">
           <div class="as-bar-correct" style="width:${pct}%"></div>
         </div>`
      : '<div class="as-bar as-bar-empty" title="Not answered yet"></div>';
    return `
      <div class="as-card ${isDisabled ? 'aq-disabled' : ''}" data-qid="${q.id}">
        <div class="as-main">
          <div class="aq-id">Question ID: ${q.id}</div>
          <div class="aq-text">${escHtml(q.question)}</div>
          <div class="aq-answer"><strong>A:</strong> ${escHtml(q.answer)}</div>
          <div class="aq-badges">
            <span class="badge badge-category">${escHtml(q.category)}</span>
            <span class="badge ${difficultyClass(q.difficulty)}">${escHtml(q.difficulty)}</span>
            ${isDisabled ? '<span class="badge aq-badge-disabled">DISABLED</span>' : ''}
          </div>
        </div>
        <div class="as-stats">
          <div class="as-stat-numbers">
            <span class="as-stat as-stat-correct" title="Answered correctly">&#10003; ${correct.toLocaleString()}</span>
            <span class="as-stat as-stat-wrong" title="Answered incorrectly">&#10007; ${wrong.toLocaleString()}</span>
            <span class="as-stat as-stat-total" title="Total times answered">${total.toLocaleString()} total</span>
          </div>
          <div class="as-pct-row">
            ${barHtml}
            <span class="as-pct ${pctClass}">${pct === null ? '--' : pct + '%'}</span>
          </div>
          ${total > 0 ? `<button class="btn btn-sm aq-btn-disable as-reset-btn" onclick="resetAnswerStatsAdmin(${q.id})">Reset</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

function resetAnswerStatsAdmin(questionId) {
  const stats = _statsForQuestion(questionId);
  if (!stats.total) return;
  const allQs = getAllManagedQuestions();
  const q = allQs.find(x => x.id === questionId);
  const label = q ? `"${q.question.slice(0, 40)}${q.question.length > 40 ? '...' : ''}"` : `Question ID: ${questionId}`;
  if (!confirm(`Reset the answer counters for ${label}?\n\n${stats.correct} correct + ${stats.wrong} wrong will be cleared. This cannot be undone.`)) return;
  fetch('/api/admin/answer-stats/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': _adminToken || '' },
    body: JSON.stringify({ questionId }),
  })
    .then(r => { if (!r.ok) throw new Error('reset failed'); return r.json(); })
    .then(() => { delete _answerStatsCache[String(questionId)]; renderAnswerStats(); showToast(`Answer stats cleared for Question ID: ${questionId}.`); })
    .catch(() => showToast('Could not reset answer stats. Try again.'));
}

function resetAllAnswerStatsAdmin() {
  if (!confirm('Reset answer counters for EVERY question to zero?\n\nThis wipes all correct/wrong tallies across the whole bank. This cannot be undone.')) return;
  fetch('/api/admin/answer-stats/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': _adminToken || '' },
    body: JSON.stringify({ all: true }),
  })
    .then(r => { if (!r.ok) throw new Error('reset failed'); return r.json(); })
    .then(() => { _answerStatsCache = {}; renderAnswerStats(); showToast('All answer stats reset to zero.'); })
    .catch(() => showToast('Could not reset answer stats. Try again.'));
}

// ── SITE SETTINGS ────────────────────────────────────────────────

// ── SITE SETTINGS ────────────────────────────────────────────────

const _SITE_TOGGLES = [
  { key: 'showDonateLink', toggleId: 'ss-donate-link', elementId: 'btn-donate',       label: 'Donate link' },
  { key: 'showYouTube',    toggleId: 'ss-youtube',     elementId: 'social-youtube',    label: 'YouTube icon' },
  { key: 'showX',          toggleId: 'ss-x',           elementId: 'social-x',          label: 'X / Twitter icon' },
  { key: 'showInstagram',  toggleId: 'ss-instagram',   elementId: 'social-instagram',  label: 'Instagram icon' },
  { key: 'showEmail',      toggleId: 'ss-email',       elementId: 'social-email',      label: 'Email icon' },
];

async function loadSiteSettings() {
  try {
    const res = await fetch('/api/site-settings');
    const settings = await res.json();
    return settings && typeof settings === 'object' ? settings : {};
  } catch {
    return {};
  }
}

async function applySiteSettings() {
  const settings = await loadSiteSettings();
  _SITE_TOGGLES.forEach(({ key, toggleId, elementId }) => {
    const el = document.getElementById(elementId);
    if (el) el.style.display = settings[key] === false ? 'none' : '';
    const toggle = document.getElementById(toggleId);
    if (toggle) toggle.checked = settings[key] !== false;
  });
}

async function saveSiteSettings(settings) {
  try {
    await fetch('/api/site-settings', {
      method: 'POST',
      headers: _adminHeaders(),
      body: JSON.stringify(settings),
    });
  } catch {
    showToast('Failed to save site settings.');
  }
}

async function handleSiteToggle(key) {
  const entry = _SITE_TOGGLES.find(t => t.key === key);
  if (!entry) return;
  const toggle = document.getElementById(entry.toggleId);
  const show = toggle.checked;
  const settings = await loadSiteSettings();
  settings[key] = show;
  await saveSiteSettings(settings);
  const el = document.getElementById(entry.elementId);
  if (el) el.style.display = show ? '' : 'none';
  showToast(show ? `${entry.label} is now visible.` : `${entry.label} is now hidden.`);
}
