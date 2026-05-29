'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - Feedback / Suggestion Box
   Modal lifecycle, form validation, API submission
   ================================================================ */

const FB_RATE_MS = 60_000; // 1-minute cooldown between submissions

// ── MODAL LIFECYCLE ───────────────────────────────────────────────

function openFeedbackModal() {
  document.getElementById('feedback-modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  setTimeout(() => document.getElementById('fb-message').focus(), 50);
}

function closeFeedbackModal() {
  document.getElementById('feedback-modal').classList.add('hidden');
  document.body.classList.remove('modal-open');
  _resetFeedbackForm();
}

function _maybeCloseFeedbackModal() {
  const draft = document.getElementById('fb-message').value.trim();
  if (draft && !confirm('Close without sending? Your message will be lost.')) return;
  closeFeedbackModal();
}

function _resetFeedbackForm() {
  document.getElementById('feedback-form').reset();
  document.getElementById('fb-char-count').textContent = '0';
  const counter = document.getElementById('fb-char-counter');
  counter.classList.remove('char-warn', 'char-limit');
  document.getElementById('fb-error').classList.add('hidden');
  document.getElementById('fb-success').classList.add('hidden');
  const btn = document.getElementById('btn-feedback-submit');
  btn.disabled = false;
  btn.textContent = 'Send to Corporate';
}

// ── CHARACTER COUNTER ─────────────────────────────────────────────

function _onMessageInput() {
  const len     = document.getElementById('fb-message').value.length;
  const counter = document.getElementById('fb-char-counter');
  document.getElementById('fb-char-count').textContent = len.toLocaleString();
  counter.classList.toggle('char-warn',  len >= 800 && len < 1000);
  counter.classList.toggle('char-limit', len >= 1000);
}

// ── VALIDATION ────────────────────────────────────────────────────

function _validateFeedback() {
  // Honeypot - bots fill this, humans don't see it
  if (document.getElementById('fb-honeypot').value) return 'Submission rejected.';

  const name    = document.getElementById('fb-name').value.trim();
  const email   = document.getElementById('fb-email').value.trim();
  const message = document.getElementById('fb-message').value.trim();

  // Name
  if (name.length > 60) return 'Name must be 60 characters or fewer.';
  if (/[<>]|script/i.test(name)) return 'Name contains invalid characters.';
  if (/https?:\/\/|www\.|\.com\b|\.net\b|\.org\b/i.test(name)) return 'Name cannot contain web addresses.';

  // Email (only checked if provided)
  if (email) {
    if (email.length > 100) return 'Email must be 100 characters or fewer.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Please enter a valid email address.';
    if (/[<>]/.test(email)) return 'Email contains invalid characters.';
  }

  // Message
  if (!message) return 'Please write a message before sending.';
  if (message.length < 10) return 'Message must be at least 10 characters.';
  if (message.length > 1000) return 'Message must be 1,000 characters or fewer.';

  // Rate limit
  const lastSend = sessionStorage.getItem('tlt_last_feedback');
  if (lastSend && Date.now() - parseInt(lastSend, 10) < FB_RATE_MS) {
    return 'Please wait a moment before submitting again.';
  }

  return null;
}

// ── SUBMISSION ────────────────────────────────────────────────────

async function _submitFeedback(e) {
  e.preventDefault();

  const errEl     = document.getElementById('fb-error');
  const successEl = document.getElementById('fb-success');
  const submitBtn = document.getElementById('btn-feedback-submit');

  errEl.classList.add('hidden');
  successEl.classList.add('hidden');

  const error = _validateFeedback();
  if (error) {
    errEl.textContent = error;
    errEl.classList.remove('hidden');
    return;
  }

  const payload = {
    name:        document.getElementById('fb-name').value.trim()  || null,
    email:       document.getElementById('fb-email').value.trim() || null,
    type:        document.getElementById('fb-type').value,
    message:     document.getElementById('fb-message').value.trim(),
    submittedAt: new Date().toISOString(),
  };

  submitBtn.disabled    = true;
  submitBtn.textContent = 'Sending…';

  try {
    const res = await fetch('/api/feedback', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Server ${res.status}`);

    sessionStorage.setItem('tlt_last_feedback', String(Date.now()));
    successEl.classList.remove('hidden');
    submitBtn.textContent = 'Sent!';
    setTimeout(closeFeedbackModal, 2800);
  } catch {
    submitBtn.disabled    = false;
    submitBtn.textContent = 'Send to Corporate';
    errEl.textContent     = 'Something went wrong. Please try again.';
    errEl.classList.remove('hidden');
  }
}

// ── INIT ──────────────────────────────────────────────────────────

function initFeedback() {
  document.getElementById('btn-feedback').addEventListener('click', openFeedbackModal);
  document.getElementById('btn-feedback-close').addEventListener('click', _maybeCloseFeedbackModal);
  document.getElementById('btn-feedback-cancel').addEventListener('click', _maybeCloseFeedbackModal);
  document.getElementById('feedback-form').addEventListener('submit', _submitFeedback);
  document.getElementById('fb-message').addEventListener('input', _onMessageInput);

  // Close on backdrop click
  document.getElementById('feedback-modal').addEventListener('click', e => {
    if (e.target === document.getElementById('feedback-modal')) _maybeCloseFeedbackModal();
  });

  // Close on Escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.getElementById('feedback-modal').classList.contains('hidden')) {
      _maybeCloseFeedbackModal();
    }
  });
}
