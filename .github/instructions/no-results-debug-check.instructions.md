---
description: Guard against false "No results." states caused by hidden hitter-query failures. Apply when editing hitter analytics/query/filter code.
applyTo: "src/App.tsx,src/lib/queries.ts,src/components/PlayerTable.tsx"
---

# No Results Debug Check

When working on hitter query, filtering, or composite logic, always verify that an empty hitter table is not the result of a runtime query failure.

## Required Verification

1. Open the app and go to **Hitters** with default filters.
2. Confirm the table does not show only `No results.` unexpectedly.
3. Inspect browser console output for query failures, especially messages like:
   - `Query failed:`
   - `Binder Error:`
   - DuckDB interval/date arithmetic errors
4. If `No results.` is present and a query error exists, treat it as a bug (not a valid empty filter result).
5. Fix the underlying query/filter issue and re-check the same flow.

## Common Failure Pattern

Rolling-window SQL date filters can fail silently with a `Binder Error` in DuckDB WASM, collapsing the entire result set to empty.

### DuckDB WASM — Unsupported Date Syntax (DO NOT USE)

These expressions all cause binder errors in the DuckDB WASM build used here:

```sql
CURRENT_DATE - INTERVAL 'N' DAY
CURRENT_DATE - N                   -- integer subtraction on DATE
date_diff('day', game_date, CURRENT_DATE)
epoch(CAST(game_date AS TIMESTAMP))
```

### Required Alternative — Ranked-Date Window

Use a ranked distinct-date CTE and filter by rank instead of date arithmetic:

```sql
WITH ranked_dates AS (
  SELECT DISTINCT game_date,
         ROW_NUMBER() OVER (ORDER BY game_date DESC) AS day_rank
  FROM game_logs
)
-- then JOIN or IN-filter on ranked_dates where day_rank <= 7 / 14 / 30
```

For an inline subquery variant:
```sql
AND g.game_date IN (
  SELECT game_date
  FROM (
    SELECT DISTINCT game_date,
           ROW_NUMBER() OVER (ORDER BY game_date DESC) AS day_rank
    FROM game_logs
  )
  WHERE day_rank <= N
)
```

## Completion Requirement

Before completing a task that touched hitter query/filter/scoring logic:

- Report whether Hitters renders data with defaults.
- Report whether console has any `Query failed`/DuckDB errors.
- If either check fails, do not mark the task complete.
