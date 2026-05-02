---
description: Guard against false "No results." states caused by hidden query or filter failures across all views. Apply when editing hitter, pitcher, reliever, or injured analytics/query/filter code.
applyTo: "src/App.tsx,src/lib/queries.ts,src/components/PlayerTable.tsx,src/components/PitcherTable.tsx,src/components/ReliefPitcherTable.tsx,src/components/InjuredPitcherTable.tsx"
---

# No Results Debug Check

When working on query, filtering, or composite logic for any view, always verify that an empty table is not the result of a runtime error or misconfigured default filter.

## Required Verification

1. Open the app and visit each affected view with default filters.
2. Confirm no view shows only `No results.` unexpectedly.
3. Inspect browser console output for query failures, especially messages like:
   - `Query failed:`
   - `Binder Error:`
   - DuckDB interval/date arithmetic errors
   - `[injured] No table found for...` (scraper heading mismatch)
   - Injured tab showing wrong data in columns (column header mismatch — e.g. player names show injury types)
4. If `No results.` is present and a query error or scraper warning exists, treat it as a bug.
5. Fix the underlying query/filter/scraper issue and re-check the same flow.

## Common Failure Patterns

### 1. Hitter / Pitcher / Reliever — DuckDB Date Filter Failures

Rolling-window SQL date filters can fail silently with a `Binder Error` in DuckDB WASM, collapsing the entire result set to empty.

#### DuckDB WASM — Unsupported Date Syntax (DO NOT USE)

```sql
CURRENT_DATE - INTERVAL 'N' DAY
CURRENT_DATE - N                   -- integer subtraction on DATE
date_diff('day', game_date, CURRENT_DATE)
epoch(CAST(game_date AS TIMESTAMP))
```

#### Required Alternative — Ranked-Date Window

Use a ranked distinct-date CTE and filter by rank instead of date arithmetic:

```sql
WITH ranked_dates AS (
  SELECT DISTINCT game_date,
         ROW_NUMBER() OVER (ORDER BY game_date DESC) AS day_rank
  FROM game_logs
)
-- then JOIN or IN-filter on ranked_dates where day_rank <= 7 / 14 / 30
```

### 2. Injured Pitchers — Default Team Filter Hides All Results

`queryInjuredPitchers` filters by `selectedFantasyTeams` when it is non-empty. If `selectedInjuredTeams` is incorrectly initialized to a roster-focused default (e.g. "Free Agent"), all results will be hidden because injured pitchers are typically **rostered** on someone's team.

**Rule:** `selectedInjuredTeams` must default to `[]` (empty = no filter). Do not copy the Free Agent default from other tabs when setting the Injured tab's initial team state.

In `applyDefaultTeamSelections` (App.tsx) this is expressed as:
```ts
setSelectedInjuredTeams([]); // always show all — injured pitchers are usually rostered
```

### 3. Injured Pitchers — Scraper Heading Pattern Mismatch

`parseInjuredPitchersFromArticle` (vite.config.ts) searches for a table preceded by a heading matching:
```
/injured pitchers who will be considered when healthy/i
```
It checks two strategies in order:
1. Direct previous sibling: `$(table).prevAll('h1, h2, h3, h4, p, strong').first()`
2. Wrapper container title: `$(table).closest('div.table').find('.table-branding .title').first()`

The PitcherList article currently uses the `div.table-branding > div.title` structure (Strategy 2). Both strategies are checked.

If the Pitcher List article structure changes and neither strategy matches:
1. Open the Vite dev server console (not the browser console — the scraper runs in Vite middleware).
2. Check for `[injured] No table found for...` warnings with "Nearby headings" output.
3. Update `parseInjuredPitchersFromArticle` in `vite.config.ts` to add a new detection strategy.

**Column header names may also change.** The scraper uses these regexes to locate columns:
- Player name: `/player|pitcher|name/`
- Rank: `/rank/`
- Team: `/team/`
- Injury note: `/injur|note|status/`

If a column header changes (e.g. "Pitcher" → "SP"), update the corresponding regex in `findHeaderIndex`. When `teamIndex` is -1 (no team column found), `mlb_team` is set to `null` — this is correct for articles that omit the team column.

## Completion Requirement

Before completing a task that touched query/filter/scoring logic in any view:

- Report whether each affected view renders data with defaults.
- Report whether console has any `Query failed`/DuckDB errors or `[injured]` scraper warnings.
- If either check fails, do not mark the task complete.
