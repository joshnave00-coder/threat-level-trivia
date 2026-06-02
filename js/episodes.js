'use strict';
/* ================================================================
   THREAT LEVEL TRIVIA - "On This Day" home banner
   ----------------------------------------------------------------
   The episode air dates are NOT stored in this file. They live in
   an editable spreadsheet:

       episode-airdates.csv   (project root; columns: season,episode,title,airdate)

   To fix or add a date, edit that CSV - no code changes needed.
   After editing, regenerate the human-readable, date-ordered
   reference sheet by running:

       python tools/build_airdate_reference.py

   ...which rewrites EPISODE-AIRDATES-BY-DATE.md so you can see at a
   glance which calendar days should trigger a banner.
   ================================================================ */

/* Minimal CSV row parser: handles quoted fields and "" escapes. */
function parseCsvLine(line) {
  const out = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      out.push(field); field = '';
    } else {
      field += c;
    }
  }
  out.push(field);
  return out;
}

/* Fetch + parse the air-dates CSV into [{ s, e, title, air }]. */
async function loadEpisodes() {
  const res = await fetch('/episode-airdates.csv', { cache: 'no-store' });
  if (!res.ok) throw new Error('episode-airdates.csv HTTP ' + res.status);
  const text = await res.text();
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  const episodes = [];
  for (let i = 1; i < lines.length; i++) { // skip header row
    const [season, episode, title, airdate] = parseCsvLine(lines[i]);
    if (!airdate || !/^\d{4}-\d{2}-\d{2}$/.test(airdate.trim())) continue;
    episodes.push({
      s: parseInt(season, 10),
      e: parseInt(episode, 10),
      title: (title || '').trim(),
      air: airdate.trim()
    });
  }
  return episodes;
}

/* Every episode whose air date matches the given month + day. */
function getOnThisDayEpisodes(episodes, month, day) {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return episodes
    .filter(ep => {
      const parts = ep.air.split('-'); // [YYYY, MM, DD]
      return parts[1] === mm && parts[2] === dd;
    })
    .sort((a, b) => a.air.localeCompare(b.air)); // oldest first
}

/* Build the banner. Hidden when no episode aired on the date.
   Testing: append ?onthisday=MM-DD to the URL, e.g. ?onthisday=03-24 */
async function initOnThisDay() {
  const banner = document.getElementById('on-this-day');
  if (!banner) return;

  const now = new Date();
  let month = now.getMonth() + 1;
  let day = now.getDate();

  const params = new URLSearchParams(window.location.search);
  const override = params.get('onthisday');
  if (override && /^\d{2}-\d{2}$/.test(override)) {
    const [m, d] = override.split('-');
    month = parseInt(m, 10);
    day = parseInt(d, 10);
  }

  let episodes;
  try {
    episodes = await loadEpisodes();
  } catch (err) {
    console.warn('On This Day: could not load episode-airdates.csv', err);
    banner.classList.add('hidden');
    return;
  }

  const matches = getOnThisDayEpisodes(episodes, month, day);
  if (!matches.length) {
    banner.classList.add('hidden');
    return;
  }

  const currentYear = now.getFullYear();
  const items = matches.map(ep => {
    const airYear = parseInt(ep.air.split('-')[0], 10);
    const yearsAgo = currentYear - airYear;
    const agoText = yearsAgo <= 0
      ? 'today'
      : `${yearsAgo} year${yearsAgo === 1 ? '' : 's'} ago today`;
    return `<span class="otd-ep">&ldquo;${ep.title}&rdquo; <span class="otd-sxe">(S${ep.s}E${ep.e})</span> premiered in ${airYear}, ${agoText}.</span>`;
  }).join('');

  banner.innerHTML = `<span class="otd-label">&#128250; On This Day in Scranton</span>${items}`;
  banner.classList.remove('hidden');
}
