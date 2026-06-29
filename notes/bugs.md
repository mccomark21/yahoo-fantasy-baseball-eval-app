# 🐞 Bugs

Quick capture for things that are broken or behaving wrong. Jot it down now, write it up as a GitHub issue later.

**How to use:** Copy the template below to the top of the "Entries" list and fill in what you can. Don't sweat blank fields — capture the gist while it's fresh.

**Status convention (for agents & humans):**
- Every entry has a `**Status:**` field. A fresh entry stays `📥 open — not yet filed` until it becomes a GitHub issue.
- When you convert an entry to an issue, set it to `✅ converted to GitHub issue [#NN](<issue-url>)` — always use a real markdown link, never a bare `#NN`, so it's clickable in preview.
- Don't change the wording otherwise; `📥 open` is the signal for "still in the backlog," so anything still showing it is unfiled.
- Paste new entries **below** the `<!-- Add new ... -->` comment as plain markdown (no surrounding ``` code fence — the fence is only for the copy-paste template above, and it would stop links and formatting from rendering).

---

### Template (copy this)

```
## [short title]
- **Date:** YYYY-MM-DD
- **Where:** (view / screen / file / function)
- **What happened:**
- **Expected:**
- **Steps to reproduce:**
  1.
- **Severity:** low / medium / high / blocker
- **Status:** 📥 open — not yet filed
- **Notes:**
```

---

## Entries

<!-- Add new bugs below, newest first -->

## Multiple Max Muncy
- **Date:** 2026-06-28
- **Where:** hitters-statcast table
- **What happened:** There's a rostered Max Muncy and an unrostered one with the same name. I believe their stats are getting mixed up or duplicated together.
- **Expected:** We need to separate them. One plays for the dogers and the other plays for the athletics.
- **Steps to reproduce:** search max muncy in free agents on hitters-statcast tab
  1.
- **Severity:** low
- **Status:** ✅ converted to GitHub issue [#34](https://github.com/mccomark21/yahoo-fantasy-baseball-eval-app/issues/34)
- **Notes:**
