---
description: Checkpoint the current session into CONTEXT.md to preserve progress before /compact or /clear. Run every 10–15 messages to avoid losing context.
---

Read `CONTEXT.md` in the project root (create it if it doesn't exist using the template below).

Then update **every section** of `CONTEXT.md` based on our conversation so far:

1. **Current Goal** — rewrite to reflect what we are actively working on right now.
2. **Completed This Session** — append anything finished since the last checkpoint with a ✅.
3. **In Progress** — update the table with current status, files touched, and short notes.
4. **Key Files Modified** — append any new files changed with a one-line description of what changed.
5. **Open Issues / Blockers** — add any new bugs, errors, or blockers discovered.
6. **Decisions Made** — record any architectural choices, tradeoffs, or approaches we committed to.
7. **Next Steps** — rewrite as an ordered list of what comes next, most immediate first.
8. **Last updated** — set to today's date and current time.

Do NOT remove previous completed items — keep a full running history.
Be concise: each entry should be one line wherever possible.
After writing the file, print a short 3-bullet summary of what changed so I can confirm.

---

## Template (use this if CONTEXT.md does not exist)

```markdown
# 🧠 Session Context — [Project Name]

> **How to use:** Ask Claude Code to update this file every 10–15 messages.
> Start a new session with: "Read CONTEXT.md and continue from where we left off."

---

## 📌 Project Overview
- **Project:** 
- **Stack:** 
- **Root directory:** 
- **Last updated:** 

---

## 🎯 Current Goal


---

## ✅ Completed This Session


---

## 🔧 In Progress

| Task | Status | File(s) Touched | Notes |
|------|--------|-----------------|-------|

---

## 📂 Key Files Modified

\`\`\`
\`\`\`

---

## 🐛 Open Issues / Blockers


---

## 💡 Decisions Made

| Decision | Rationale |
|----------|-----------|

---

## 🔜 Next Steps (Queued)


---

## 📎 Important Context / Constraints


```
