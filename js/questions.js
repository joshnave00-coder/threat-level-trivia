'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA — Question Logic
   Filtering, shuffling, multiple-choice generation
   ================================================================ */

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function filterQuestions(category, difficulty) {
  let pool = QUESTIONS;
  if (category && category !== 'all') pool = pool.filter(q => q.category === category);
  if (difficulty && difficulty !== 'Mixed') pool = pool.filter(q => q.difficulty === difficulty);
  return pool;
}

function selectQuestions(category, difficulty, count) {
  const pool = filterQuestions(category, difficulty);
  if (!pool.length) return [];
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

// Returns merged tags (data default + localStorage overrides)
function getEffectiveTags(question) {
  const stored = getTagsForQuestion(question.id);
  if (stored.length) return stored;
  return question.tags || [];
}

// Generate 4 MC options: 1 correct + 3 preset distractors (randomized order).
// Every question has hand-picked distractors in data.js for maximum plausibility.
function generateMCOptions(question) {
  return shuffle([question.answer, ...question.distractors]);
}

// Compute category-level breakdown for results screen
function computeBreakdown(answers) {
  const map = {};
  for (const a of answers) {
    if (!map[a.category]) map[a.category] = { correct: 0, total: 0 };
    map[a.category].total++;
    if (a.wasCorrect) map[a.category].correct++;
  }
  return map;
}

// Result grade based on accuracy
function getGrade(accuracy) {
  if (accuracy >= 95) return { label: 'Threat Level: Midnight', emoji: '🌙' };
  if (accuracy >= 80) return { label: "Assistant Regional Manager", emoji: '⭐' };
  if (accuracy >= 60) return { label: "Assistant TO the Regional Manager", emoji: '📋' };
  if (accuracy >= 40) return { label: "Party Planning Committee", emoji: '🎉' };
  if (accuracy >= 20) return { label: "Ryan Howard Temp Status", emoji: '📦' };
  return { label: "Toby. Just... Toby.", emoji: '😔' };
}
