---
name: maintain-readme
description: "Use when: changes are made to the app that affect features, UI, analytics logic, data pipeline, tech stack, or configuration. Keep README.md up to date. Triggers on: new tabs/views added, new columns or metrics, scoring logic changes, trend/emoji indicators added or changed, data source changes, new scripts or build behavior, dependency upgrades, deployment config changes. Also use at end-of-session to catch drift across multiple changes."
---

# Maintain README

## When to Use

Trigger this skill when:
- A new tab, view, or component is added to the app
- A metric, column, or scoring formula is added, changed, or removed
- A data source, scraper, or cache policy changes
- Build/deployment behavior changes (new static assets, new workflows)
- Tech stack changes (dependency version bumps, new libraries)
- At the **end of a working session** to check for accumulated drift

Do **not** trigger for: internal refactors with no user-visible effect, test-only changes, style/formatting-only changes.

## Procedure

### During a Change (Inline Update)

1. **Identify the affected README sections** — map the change to one or more sections:
   - New view/tab → `## App Views`
   - New metric or scoring logic → the relevant view subsection + `### Hitter/Pitcher Metrics` tables
   - New data source → `## Data Pipeline` table
   - New build output or API behavior → `## Build and Runtime API Behavior`
   - New script → `## Available Scripts`
   - Dependency change → `## Tech Stack`

2. **Edit only the affected sections** — make targeted edits; do not rewrite unrelated content.

3. **Keep tables aligned** — for metric tables, maintain consistent column widths and formatting.

4. **For emoji or visual indicators** — document the logic concisely: thresholds, window labels, what neutral looks like.

### End-of-Session Audit

When asked to do an end-of-session review, or when significant drift is suspected:

1. Read the full current `README.md`
2. Read the current state of key source files:
   - `src/App.tsx` — tab names and views
   - `src/components/ProspectTable.tsx`, `PlayerTable.tsx`, `PitcherTable.tsx`, `ReliefPitcherTable.tsx` — columns, logic
   - `src/lib/queries.ts` — interfaces, metrics
   - `package.json` — scripts, dependencies
3. Compare README claims against actual code
4. List all discrepancies found, then apply all updates in a single pass

## README Structure (Reference)

```
# Fantasy Baseball Eval
## App Views
  ### Hitters
  ### Pitchers
  ### Relievers
  ### Prospects         ← add new views here
## Data Pipeline
## Build and Runtime API Behavior
  ### Scheduled Refresh Cadence
## Key Features
  ### Hitter Metrics
## Tech Stack
## Getting Started
## Available Scripts
## Deployment
## License
```

## Quality Criteria

- Every tab visible in the app has a subsection under `## App Views`
- Every user-facing metric has a row in the appropriate metrics table
- Scoring formulas described in prose match the actual implementation
- Threshold values (e.g., OPS ≥ .900, min 10 AB) are documented if user-visible
- No version numbers, script names, or data sources that are stale
