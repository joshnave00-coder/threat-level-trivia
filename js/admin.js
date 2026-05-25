'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — Admin & Settings
   Password gate, question management, dispute/feedback review
   ================================================================ */

const ADMIN_PASSWORD = 'dundermifflin';
let activeAdminTab = 'questions';
let adminQFilter = { search: '', category: 'all', difficulty: 'all' };
let editingTagsFor = [];

function adminLogin() {
  const input = document.getElementById('admin-password-input');
  if (input.value === ADMIN_PASSWORD) {
    input.value = '';
    document.getElementById('admin-login-error').classList.add('hidden');
    try {
      renderAdminQuestions();
    } catch (err) {
      console.error('renderAdminQuestions failed:', err);
    }
    try {
      renderAdminDisputes();
    } catch (err) {
      console.error('renderAdminDisputes failed:', err);
    }
    loadAndRenderAdminFeedback();
    showScreen('screen-admin');
  } else {
    document.getElementById('admin-login-error').classList.remove('hidden');
    input.value = '';
    input.focus();
  }
}

// ── TABS ──────────────────────────────────────────────────────────
function switchAdminTab(tab) {
  activeAdminTab = tab;
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  const qPanel = document.getElementById('admin-tab-questions');
  const rPanel = document.getElementById('admin-tab-review');
  if (qPanel) qPanel.classList.toggle('hidden', tab !== 'questions');
  if (rPanel) rPanel.classList.toggle('hidden', tab !== 'review');
  if (tab === 'review') loadAndRenderAdminFeedback();
  if (tab === 'questions') renderAdminQuestions();
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
    const s = adminQFilter.search.toLowerCase();
    filtered = filtered.filter(q =>
      q.question.toLowerCase().includes(s) ||
      q.answer.toLowerCase().includes(s));
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

function populateCategoryDropdowns() {
  const filterSelect = document.getElementById('aq-filter-category');
  const modalSelect  = document.getElementById('qe-category');
  if (!filterSelect || !modalSelect) return;
  CATEGORIES.forEach(cat => {
    filterSelect.appendChild(new Option(cat, cat));
    modalSelect.appendChild(new Option(cat, cat));
  });
}

// ── QUESTION EDITOR MODAL ────────────────────────────────────────

function openQuestionEditor(id) {
  const modal = document.getElementById('question-modal');
  const title = document.getElementById('question-modal-title');
  const form = document.getElementById('question-form');
  const errorEl = document.getElementById('qe-error');
  errorEl.classList.add('hidden');
  form.reset();

  if (id != null) {
    const allQs = getAllManagedQuestions();
    const q = allQs.find(x => x.id === id);
    if (!q) return;
    title.textContent = 'Edit Question';
    document.getElementById('qe-id').value = q.id;
    document.getElementById('qe-question').value = q.question;
    document.getElementById('qe-answer').value = q.answer;
    document.getElementById('qe-d1').value = q.distractors[0] || '';
    document.getElementById('qe-d2').value = q.distractors[1] || '';
    document.getElementById('qe-d3').value = q.distractors[2] || '';
    document.getElementById('qe-category').value = q.category;
    document.getElementById('qe-difficulty').value = q.difficulty;
    editingTagsFor = [...getEffectiveTags(q)];
  } else {
    title.textContent = 'Add New Question';
    document.getElementById('qe-id').value = '';
    document.getElementById('qe-category').value = CATEGORIES[0];
    document.getElementById('qe-difficulty').value = 'Medium';
    editingTagsFor = [];
  }

  renderModalTags();
  modal.classList.remove('hidden');
  document.body.classList.add('modal-open');
}

function closeQuestionEditor() {
  document.getElementById('question-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
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

  const data = { question, answer, distractors: [d1, d2, d3], category, difficulty };
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

  closeQuestionEditor();
  renderAdminQuestions();
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
      <div class="dispute-q"><strong>Q:</strong> ${escHtml(d.question)}</div>
      <div class="dispute-a"><strong>A:</strong> ${escHtml(d.answer)}</div>
      <div class="dispute-text"><strong>Issue:</strong> ${escHtml(d.disputeText)}</div>
      ${d.status === 'open' ? `
        <div class="dispute-actions">
          <button class="btn btn-correct btn-sm" onclick="resolveDispute(${d.id},'approved')">Approve</button>
          <button class="btn btn-wrong btn-sm" onclick="resolveDispute(${d.id},'dismissed')">Dismiss</button>
        </div>` : ''}
    </div>`).join('');
}

function resolveDispute(id, status) {
  updateDisputeStatus(id, status);
  renderAdminDisputes();
  showToast(status === 'approved' ? 'Question approved for review.' : 'Dispute dismissed. Moving on.');
}

function syncDisputesToFile() {
  const disputes = getDisputes();
  fetch('/api/disputes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(disputes),
  })
    .then(r => r.json())
    .then(() => showToast(`${disputes.length} dispute(s) synced.`))
    .catch(() => showToast('Sync failed - is the server running?'));
}

function syncRatingsToFile() {
  const ratings = getRatings();
  fetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ratings),
  })
    .then(r => r.json())
    .then(() => showToast(`${ratings.length} rating(s) synced.`))
    .catch(() => showToast('Sync failed - is the server running?'));
}

function syncTagsToFile() {
  const tags = getAllTags();
  fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tags),
  })
    .then(r => r.json())
    .then(() => showToast('Tags synced.'))
    .catch(() => showToast('Sync failed - is the server running?'));
}

function syncLeaderboardToFile() {
  const entries = getLeaderboard();
  fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  })
    .then(r => r.json())
    .then(() => showToast(`${entries.length} leaderboard entry/entries synced.`))
    .catch(() => showToast('Sync failed - is the server running?'));
}

// ── SUBMITTED FEEDBACK (admin view) ──────────────────────────────
const _FB_TYPE_LABELS = {
  general: 'General', suggestion: 'Suggestion', bug: 'Bug Report',
  question: 'Question Idea', other: 'Other',
};

function loadAndRenderAdminFeedback() {
  fetch('/api/feedback')
    .then(r => r.json())
    .then(entries => renderAdminFeedback(entries))
    .catch(() => showToast('Could not load feedback - is the server running?'));
}

function renderAdminFeedback(entries) {
  const list  = document.getElementById('admin-feedback-list');
  const empty = document.getElementById('admin-no-feedback');
  if (!entries || !entries.length) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const sorted = [...entries].reverse();
  list.innerHTML = sorted.map(fb => `
    <div class="feedback-card">
      <div class="feedback-card-meta">
        <span class="feedback-type-badge">${escHtml(_FB_TYPE_LABELS[fb.type] || fb.type)}</span>
        <span class="feedback-who">${fb.name ? escHtml(fb.name) : '<em style="font-weight:400;color:var(--gray-light)">Anonymous</em>'}</span>
        ${fb.email ? `<span class="feedback-email">${escHtml(fb.email)}</span>` : ''}
        <span class="feedback-when">${fb.submittedAt ? escHtml(new Date(fb.submittedAt).toLocaleString()) : ''}</span>
      </div>
      <div class="feedback-msg">${escHtml(fb.message)}</div>
    </div>`).join('');
}
