---
description: Generate or update a formatted HTML session log (session-log.html) in the project root. Appends every user message and a summary of changes made, with timestamps. Run anytime — safe to re-run, it always appends, never overwrites history.
---

Your job is to generate or update `session-log.html` in the project root.

## Step 1 — Collect the data

Go through the ENTIRE conversation history from the beginning (or from the last `/sessionlog` call if this is a re-run). For each user message, extract:

- `msg_index` — sequential message number (1, 2, 3 …)
- `timestamp` — use the closest available time reference; if unknown, write "~[relative time, e.g. ~5 min ago]"
- `user_input` — the exact user message, trimmed to 300 chars max (append "…" if truncated)
- `summary` — 1–4 bullet points describing what YOU (Claude) did or changed in response:
  - Files created / modified (with path)
  - Commands run and their outcome
  - Decisions made or clarifications given
  - Bugs found or fixed
- `category` — tag each entry as one of: `feat` · `fix` · `refactor` · `docs` · `config` · `question` · `other`

Only include entries since the LAST time this command was run (check the log for the last entry's `msg_index` to avoid duplicates). On first run, include all messages.

---

## Step 2 — Write or append to session-log.html

If `session-log.html` does NOT exist, create it with the full HTML template below, then inject the entries.

If it ALREADY exists, find the comment `<!-- LOG_ENTRIES_END -->` and insert new `<article>` blocks just before it. Do not touch anything else in the file.

---

## HTML Template (use on first run only)

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Session Log — [Project Name]</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Fraunces:ital,wght@0,300;0,600;1,300&display=swap');

  :root {
    --bg: #0d0f12;
    --surface: #13161b;
    --surface2: #1a1e25;
    --border: #252932;
    --text: #d4d8e0;
    --muted: #5a6070;
    --accent: #4fffb0;
    --accent2: #ff6b6b;
    --feat: #4fffb0;
    --fix: #ff6b6b;
    --refactor: #6eb3ff;
    --docs: #ffd166;
    --config: #c084fc;
    --question: #94a3b8;
    --other: #64748b;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Fraunces', Georgia, serif;
    font-weight: 300;
    min-height: 100vh;
    padding: 0 0 80px;
  }

  /* ── Header ── */
  header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(13,15,18,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--border);
    padding: 18px 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }

  .logo {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--accent);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .header-meta {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
  }

  /* ── Filter bar ── */
  .filters {
    display: flex;
    gap: 8px;
    padding: 20px 40px 0;
    flex-wrap: wrap;
  }

  .filter-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 4px 12px;
    border-radius: 20px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.15s ease;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .filter-btn:hover,
  .filter-btn.active {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(79,255,176,0.06);
  }

  /* ── Search ── */
  .search-wrap {
    padding: 16px 40px 0;
  }

  .search-wrap input {
    width: 100%;
    max-width: 480px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    color: var(--text);
    outline: none;
    transition: border-color 0.15s;
  }

  .search-wrap input:focus {
    border-color: var(--accent);
  }

  .search-wrap input::placeholder { color: var(--muted); }

  /* ── Timeline ── */
  .timeline {
    max-width: 860px;
    margin: 32px auto 0;
    padding: 0 40px;
    position: relative;
  }

  .timeline::before {
    content: '';
    position: absolute;
    left: 56px;
    top: 0;
    bottom: 0;
    width: 1px;
    background: linear-gradient(to bottom, transparent, var(--border) 5%, var(--border) 95%, transparent);
  }

  /* ── Entry card ── */
  article.log-entry {
    display: grid;
    grid-template-columns: 32px 1fr;
    gap: 0 20px;
    margin-bottom: 28px;
    position: relative;
    animation: fadeUp 0.3s ease both;
  }

  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* dot on timeline */
  .entry-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--accent);
    margin-top: 18px;
    margin-left: 12px;
    flex-shrink: 0;
    box-shadow: 0 0 0 3px rgba(79,255,176,0.15);
    position: relative;
    z-index: 1;
    transition: box-shadow 0.2s;
  }

  article.log-entry:hover .entry-dot {
    box-shadow: 0 0 0 6px rgba(79,255,176,0.2);
  }

  .entry-dot[data-cat="fix"]      { background: var(--fix);      box-shadow: 0 0 0 3px rgba(255,107,107,0.15); }
  .entry-dot[data-cat="refactor"] { background: var(--refactor); box-shadow: 0 0 0 3px rgba(110,179,255,0.15); }
  .entry-dot[data-cat="docs"]     { background: var(--docs);     box-shadow: 0 0 0 3px rgba(255,209,102,0.15); }
  .entry-dot[data-cat="config"]   { background: var(--config);   box-shadow: 0 0 0 3px rgba(192,132,252,0.15); }
  .entry-dot[data-cat="question"] { background: var(--question); box-shadow: 0 0 0 3px rgba(148,163,184,0.15); }
  .entry-dot[data-cat="other"]    { background: var(--other);    box-shadow: 0 0 0 3px rgba(100,116,139,0.15); }

  .entry-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px 24px;
    transition: border-color 0.2s, background 0.2s;
  }

  article.log-entry:hover .entry-card {
    border-color: #2e3440;
    background: var(--surface2);
  }

  /* card header row */
  .entry-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .msg-num {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    min-width: 28px;
  }

  .cat-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 9px;
    border-radius: 20px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
  }

  .cat-feat     { background: rgba(79,255,176,0.12);  color: var(--feat);     border: 1px solid rgba(79,255,176,0.25); }
  .cat-fix      { background: rgba(255,107,107,0.12); color: var(--fix);      border: 1px solid rgba(255,107,107,0.25); }
  .cat-refactor { background: rgba(110,179,255,0.12); color: var(--refactor); border: 1px solid rgba(110,179,255,0.25); }
  .cat-docs     { background: rgba(255,209,102,0.12); color: var(--docs);     border: 1px solid rgba(255,209,102,0.25); }
  .cat-config   { background: rgba(192,132,252,0.12); color: var(--config);   border: 1px solid rgba(192,132,252,0.25); }
  .cat-question { background: rgba(148,163,184,0.12); color: var(--question); border: 1px solid rgba(148,163,184,0.25); }
  .cat-other    { background: rgba(100,116,139,0.12); color: var(--other);    border: 1px solid rgba(100,116,139,0.25); }

  .entry-time {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    margin-left: auto;
  }

  /* user message bubble */
  .user-msg {
    font-size: 14px;
    line-height: 1.55;
    color: var(--text);
    background: rgba(255,255,255,0.03);
    border-left: 3px solid var(--accent);
    border-radius: 0 6px 6px 0;
    padding: 10px 14px;
    margin-bottom: 14px;
    font-style: italic;
  }

  .user-msg[data-cat="fix"]      { border-left-color: var(--fix); }
  .user-msg[data-cat="refactor"] { border-left-color: var(--refactor); }
  .user-msg[data-cat="docs"]     { border-left-color: var(--docs); }
  .user-msg[data-cat="config"]   { border-left-color: var(--config); }
  .user-msg[data-cat="question"] { border-left-color: var(--question); }
  .user-msg[data-cat="other"]    { border-left-color: var(--other); }

  /* summary bullets */
  .summary-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .summary-list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .summary-list li {
    font-size: 13.5px;
    line-height: 1.5;
    color: #a8b0be;
    padding-left: 18px;
    position: relative;
  }

  .summary-list li::before {
    content: '→';
    position: absolute;
    left: 0;
    color: var(--muted);
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
  }

  code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    background: rgba(255,255,255,0.06);
    padding: 1px 6px;
    border-radius: 4px;
    color: #c9d1e0;
  }

  /* ── Stats bar ── */
  .stats {
    max-width: 860px;
    margin: 0 auto 8px;
    padding: 0 40px;
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  .stat {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--muted);
  }

  .stat span { color: var(--text); font-weight: 600; }

  /* ── Hidden entries ── */
  article.log-entry.hidden { display: none; }

  /* ── Date range picker ── */
  .date-range-wrap {
    padding: 14px 40px 0;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .date-range-label {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.07em;
    white-space: nowrap;
  }

  .date-input-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .date-input-wrap input[type="date"] {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px 8px 34px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text);
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
    color-scheme: dark;
    min-width: 148px;
  }

  .date-input-wrap input[type="date"]:focus { border-color: var(--accent); }

  .date-input-wrap input[type="date"]::-webkit-calendar-picker-indicator {
    opacity: 0;
    position: absolute;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }

  .date-icon {
    position: absolute;
    left: 10px;
    font-size: 13px;
    pointer-events: none;
    z-index: 1;
  }

  .date-sep {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--muted);
  }

  .date-clear-btn {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    padding: 6px 12px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .date-clear-btn:hover {
    border-color: var(--fix);
    color: var(--fix);
    background: rgba(255,107,107,0.06);
  }

  .date-active-badge {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    padding: 3px 10px;
    border-radius: 20px;
    background: rgba(79,255,176,0.1);
    color: var(--accent);
    border: 1px solid rgba(79,255,176,0.25);
    display: none;
  }

  .date-active-badge.visible { display: inline-block; }

  /* ── Responsive ── */
  @media (max-width: 600px) {
    header, .filters, .search-wrap, .timeline, .stats, .date-range-wrap { padding-left: 20px; padding-right: 20px; }
    .timeline::before { left: 36px; }
  }
</style>
</head>
<body>

<header>
  <div class="logo">⬡ Session Log</div>
  <div class="header-meta" id="headerMeta">Loading…</div>
</header>

<div class="search-wrap" style="padding-top:24px">
  <input type="text" id="searchInput" placeholder="Search messages or summaries…" oninput="filterEntries()">
</div>

<div class="filters" id="filterBar">
  <button class="filter-btn active" onclick="setFilter('all', this)">All</button>
  <button class="filter-btn" onclick="setFilter('feat', this)">feat</button>
  <button class="filter-btn" onclick="setFilter('fix', this)">fix</button>
  <button class="filter-btn" onclick="setFilter('refactor', this)">refactor</button>
  <button class="filter-btn" onclick="setFilter('docs', this)">docs</button>
  <button class="filter-btn" onclick="setFilter('config', this)">config</button>
  <button class="filter-btn" onclick="setFilter('question', this)">question</button>
  <button class="filter-btn" onclick="setFilter('other', this)">other</button>
</div>

<div class="date-range-wrap">
  <span class="date-range-label">Date range</span>
  <div class="date-input-wrap">
    <span class="date-icon">📅</span>
    <input type="date" id="dateFrom" onchange="filterEntries()" title="From date">
  </div>
  <span class="date-sep">→</span>
  <div class="date-input-wrap">
    <span class="date-icon">📅</span>
    <input type="date" id="dateTo" onchange="filterEntries()" title="To date">
  </div>
  <button class="date-clear-btn" onclick="clearDates()">✕ Clear</button>
  <span class="date-active-badge" id="dateActiveBadge">filtered</span>
</div>

<div class="stats" style="margin-top:20px">
  <div class="stat">Messages: <span id="statTotal">0</span></div>
  <div class="stat">Showing: <span id="statVisible">0</span></div>
  <div class="stat">Session started: <span id="statStart">—</span></div>
</div>

<div class="timeline" id="timeline">
  <!-- LOG_ENTRIES_START -->

  <!-- LOG_ENTRIES_END -->
</div>

<script>
  let activeFilter = 'all';

  function setFilter(cat, btn) {
    activeFilter = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filterEntries();
  }

  function clearDates() {
    document.getElementById('dateFrom').value = '';
    document.getElementById('dateTo').value = '';
    document.getElementById('dateActiveBadge').classList.remove('visible');
    filterEntries();
  }

  function parseEntryDate(el) {
    const raw = el.querySelector('.entry-time')?.textContent?.trim() || '';
    const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  }

  function filterEntries() {
    const q = document.getElementById('searchInput').value.toLowerCase();
    const fromVal = document.getElementById('dateFrom').value;
    const toVal   = document.getElementById('dateTo').value;
    const entries = document.querySelectorAll('.log-entry');
    let visible = 0;

    const dateActive = fromVal || toVal;
    document.getElementById('dateActiveBadge').classList.toggle('visible', !!dateActive);

    entries.forEach(el => {
      const catMatch  = activeFilter === 'all' || el.dataset.cat === activeFilter;
      const textMatch = !q || el.innerText.toLowerCase().includes(q);

      let dateMatch = true;
      if (dateActive) {
        const entryDate = parseEntryDate(el);
        if (entryDate) {
          if (fromVal && entryDate < fromVal) dateMatch = false;
          if (toVal   && entryDate > toVal)   dateMatch = false;
        } else {
          dateMatch = false;
        }
      }

      const show = catMatch && textMatch && dateMatch;
      el.classList.toggle('hidden', !show);
      if (show) visible++;
    });

    document.getElementById('statVisible').textContent = visible;
  }

  function updateStats() {
    const entries = document.querySelectorAll('.log-entry');
    const total = entries.length;
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statVisible').textContent = total;

    const times = [...entries].map(e => e.querySelector('.entry-time')?.textContent?.trim() || '');
    document.getElementById('statStart').textContent = times[0] || '—';
    document.getElementById('headerMeta').textContent =
      total + ' entries · last updated ' + (times[times.length - 1] || '—');
  }

  updateStats();
</script>
</body>
</html>
```

---

## Step 3 — Entry block format

For each message, insert an `<article>` like this inside `<!-- LOG_ENTRIES_START -->` … `<!-- LOG_ENTRIES_END -->`:

```html
<article class="log-entry" data-cat="CATEGORY">
  <div class="entry-dot" data-cat="CATEGORY"></div>
  <div class="entry-card">
    <div class="entry-header">
      <span class="msg-num">#MSG_INDEX</span>
      <span class="cat-badge cat-CATEGORY">CATEGORY</span>
      <span class="entry-time">TIMESTAMP</span>
    </div>
    <div class="user-msg" data-cat="CATEGORY">USER_MESSAGE_TEXT</div>
    <div class="summary-label">Changes &amp; Actions</div>
    <ul class="summary-list">
      <li>BULLET_1</li>
      <li>BULLET_2</li>
      <!-- add more as needed -->
    </ul>
  </div>
</article>
```

Replace:
- `CATEGORY` → one of: `feat` `fix` `refactor` `docs` `config` `question` `other`
- `MSG_INDEX` → sequential number
- `TIMESTAMP` → e.g. `2026-06-02 14:35` or `~session start`
- `USER_MESSAGE_TEXT` → trimmed user input (escape HTML entities: `<` → `&lt;` etc.)
- `BULLET_1`, `BULLET_2` … → concise action summaries; wrap file paths in `<code>` tags

---

## Step 4 — Confirm

After writing the file, reply with:
```
✅ session-log.html updated
   Added: X new entries (#N to #M)
   Total entries: Y
   Open session-log.html in your browser to review.
