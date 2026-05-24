'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — Admin & Settings
   Password gate, dispute management, tag editing
   ================================================================ */

const ADMIN_PASSWORD = 'dundermifflin';
let activeAdminTab = 'disputes';
let adminTagFilter = '';

function adminLogin() {
  const input = document.getElementById('admin-password-input');
  if (input.value === ADMIN_PASSWORD) {
    input.value = '';
    document.getElementById('admin-login-error').classList.add('hidden');
    renderAdminDisputes();
    renderAdminTags();
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
  document.getElementById('admin-tab-disputes').classList.toggle('hidden', tab !== 'disputes');
  document.getElementById('admin-tab-tags').classList.toggle('hidden', tab !== 'tags');
  document.getElementById('admin-tab-feedback').classList.toggle('hidden', tab !== 'feedback');
  if (tab === 'feedback') loadAndRenderAdminFeedback();
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
    .then(() => showToast(`${disputes.length} dispute(s) synced to disputes.json ✓`))
    .catch(() => showToast('Sync failed — make sure the server is running via python server.py'));
}

function syncRatingsToFile() {
  const ratings = getRatings();
  fetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ratings),
  })
    .then(r => r.json())
    .then(() => showToast(`${ratings.length} rating(s) synced to ratings.json ✓`))
    .catch(() => showToast('Sync failed — make sure the server is running via python server.py'));
}

function syncTagsToFile() {
  const tags = getAllTags();
  fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tags),
  })
    .then(r => r.json())
    .then(() => showToast(`Tags synced to tags.json ✓`))
    .catch(() => showToast('Sync failed — make sure the server is running via python server.py'));
}

function syncLeaderboardToFile() {
  const entries = getLeaderboard();
  fetch('/api/leaderboard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entries),
  })
    .then(r => r.json())
    .then(() => showToast(`${entries.length} leaderboard entry/entries synced to leaderboard.json ✓`))
    .catch(() => showToast('Sync failed — make sure the server is running via python server.py'));
}

// ── TAGS ──────────────────────────────────────────────────────────
function renderAdminTags(filter) {
  if (filter !== undefined) adminTagFilter = filter.toLowerCase();
  const container = document.getElementById('admin-tags-list');
  const qs = adminTagFilter
    ? QUESTIONS.filter(q =>
        q.question.toLowerCase().includes(adminTagFilter) ||
        q.answer.toLowerCase().includes(adminTagFilter) ||
        q.category.toLowerCase().includes(adminTagFilter))
    : QUESTIONS;

  container.innerHTML = qs.map(q => {
    const tags = getEffectiveTags(q);
    return `
      <div class="tag-row" data-qid="${q.id}">
        <div class="tag-question-text">${escHtml(q.question)}</div>
        <div class="tag-question-meta">${escHtml(q.category)} · ${escHtml(q.difficulty)}</div>
        <div class="tag-chips" id="tag-chips-${q.id}">
          ${tags.map(t => `<span class="tag-chip">${escHtml(t)}<button class="tag-remove" onclick="removeTag(${q.id}, '${escHtml(t)}')">×</button></span>`).join('')}
        </div>
        <div class="tag-input-row">
          <input type="text" class="input-field tag-add-input" id="tag-input-${q.id}"
            placeholder="Add tag..." list="tag-suggestions-list" maxlength="30">
          <button class="btn btn-secondary btn-sm" onclick="addTagToQuestion(${q.id})">Add</button>
        </div>
      </div>`;
  }).join('');

  // Bind enter key on each tag input
  container.querySelectorAll('.tag-add-input').forEach(inp => {
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const qid = parseInt(inp.id.replace('tag-input-', ''), 10);
        addTagToQuestion(qid, inp.value);
      }
    });
  });
}

function addTagToQuestion(questionId, value) {
  const input = document.getElementById(`tag-input-${questionId}`);
  const tag   = (value !== undefined ? value : input.value).trim();
  if (!tag) return;

  const current = getTagsForQuestion(questionId);
  if (current.includes(tag)) { showToast('Tag already exists.'); input.value = ''; return; }
  current.push(tag);
  saveTagsForQuestion(questionId, current);
  input.value = '';

  // Re-render just this question's chips
  const chips = document.getElementById(`tag-chips-${questionId}`);
  if (chips) {
    chips.innerHTML = current.map(t =>
      `<span class="tag-chip">${escHtml(t)}<button class="tag-remove" onclick="removeTag(${questionId}, '${escHtml(t)}')">×</button></span>`
    ).join('');
  }
}

function removeTag(questionId, tag) {
  const current = getTagsForQuestion(questionId);
  const updated = current.filter(t => t !== tag);
  saveTagsForQuestion(questionId, updated);
  const chips = document.getElementById(`tag-chips-${questionId}`);
  if (chips) {
    chips.innerHTML = updated.map(t =>
      `<span class="tag-chip">${escHtml(t)}<button class="tag-remove" onclick="removeTag(${questionId}, '${escHtml(t)}')">×</button></span>`
    ).join('');
  }
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
    .catch(() => showToast('Could not load feedback — is the server running?'));
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
  const sorted = [...entries].reverse(); // newest first
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
