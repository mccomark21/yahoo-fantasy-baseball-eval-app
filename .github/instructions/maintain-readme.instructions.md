---
description: Keep README.md synchronized with code changes. Apply when editing source files that affect user-visible features, UI, analytics logic, data pipeline, tech stack, or build configuration.
applyTo: "src/**/*.{ts,tsx},package.json,vite.config.ts"
---

# Update README on Code Change

When changes are made to files matching this instruction's scope, check whether README.md needs updating before considering the task complete.

## Trigger → README Section Mapping

| What changed | README section to update |
|---|---|
| New tab, view, or component | `## App Views` — add or update subsection |
| New metric, column, or scoring formula | Relevant view subsection + metrics table |
| Emoji/indicator thresholds or logic | The view subsection describing that feature |
| New or changed data source / cache policy | `## Data Pipeline` |
| New build output, static asset, or API route | `## Build and Runtime API Behavior` |
| New or changed npm script | `## Available Scripts` |
| Dependency version bump or new library | `## Tech Stack` |

## Rules

- Edit only the affected sections — do not rewrite unrelated content.
- Update README in the same response as the code change, not as a follow-up.
- For emoji indicators, document: thresholds, window labels, volume minimums, and what the neutral state looks like.
- Keep metric tables aligned; add a row for every new user-visible stat.
- Do NOT trigger for: pure refactors, test-only edits, type-only changes with no runtime effect.

## README Structure (reference)

```
# Fantasy Baseball Eval
## App Views
  ### Hitters
  ### Pitchers
  ### Relievers
  ### Prospects         <- add new views here
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

## End-of-Session Audit

When asked to review README drift across a session:

1. Read the full `README.md`
2. Read current state of: `src/App.tsx` (tabs), `src/components/*.tsx` (columns/logic), `src/lib/queries.ts` (interfaces), `package.json` (scripts/deps)
3. List all discrepancies, then apply all fixes in a single pass

## Quality Checklist

- Every tab visible in the app has a subsection under `## App Views`
- Every user-facing metric has a row in the appropriate table
- Scoring formulas in prose match the actual implementation
- No stale version numbers, script names, or data sources
