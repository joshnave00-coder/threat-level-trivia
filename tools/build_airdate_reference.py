#!/usr/bin/env python3
"""
Build a human-readable, calendar-ordered reference of every episode air date.

Reads:  episode-airdates.csv   (the editable source of truth, in project root)
Writes: EPISODE-AIRDATES-BY-DATE.md  (sorted by month + day, ignoring year)

Run this after editing the CSV so the reference sheet stays in sync:

    python tools/build_airdate_reference.py

The reference is ordered by calendar date (Jan 1 -> Dec 31) so you can
scan to any day and instantly see whether the "On This Day" banner should
appear, and for which episode(s).
"""

import csv
import os
from datetime import date

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, 'episode-airdates.csv')
OUT_PATH = os.path.join(BASE_DIR, 'EPISODE-AIRDATES-BY-DATE.md')

MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']


def main():
    rows = []
    with open(CSV_PATH, newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            y, m, d = r['airdate'].split('-')
            rows.append({
                'season': int(r['season']),
                'episode': int(r['episode']),
                'title': r['title'],
                'year': int(y),
                'month': int(m),
                'day': int(d),
            })

    # Sort by calendar date (month, day), then year.
    rows.sort(key=lambda r: (r['month'], r['day'], r['year']))

    # Group by (month, day).
    groups = {}
    for r in rows:
        groups.setdefault((r['month'], r['day']), []).append(r)

    multi = sum(1 for eps in groups.values() if len(eps) > 1)

    lines = []
    lines.append('# The Office - Air Dates by Calendar Date')
    lines.append('')
    lines.append('> Auto-generated from `episode-airdates.csv` by '
                 '`tools/build_airdate_reference.py`. Do not edit by hand - '
                 'edit the CSV and re-run the script.')
    lines.append('')
    lines.append(f'Each date below triggers the "On This Day in Scranton" '
                 f'banner on the home page. **{len(rows)} episodes** across '
                 f'**{len(groups)} calendar days**; {multi} of those days have '
                 f'more than one episode (the banner shows all of them).')
    lines.append('')

    current_month = None
    for (m, d) in sorted(groups.keys()):
        if m != current_month:
            if current_month is not None:
                lines.append('')  # blank line before the next month heading
            lines.append(f'## {MONTHS[m - 1]}')
            lines.append('')
            current_month = m
        eps = groups[(m, d)]
        label = f'**{MONTHS[m - 1]} {d}**'
        parts = []
        for r in eps:
            parts.append(f'S{r["season"]}E{r["episode"]} "{r["title"]}" ({r["year"]})')
        lines.append(f'- {label}: ' + '; '.join(parts))
    lines.append('')

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))

    print(f'Wrote {OUT_PATH}')
    print(f'{len(rows)} episodes, {len(groups)} calendar days, {multi} multi-episode days')


if __name__ == '__main__':
    main()
