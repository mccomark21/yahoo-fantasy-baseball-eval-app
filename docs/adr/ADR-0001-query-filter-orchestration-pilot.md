# ADR-0001: Pilot query and filter orchestration deepening

- Status: Accepted
- Date: 2026-05-04

## Context

Current query and filter orchestration is distributed across App, FilterBar, and a large queries module. This increases change cost, duplicates async lifecycle handling across views, and weakens locality for filter-related bugs.

## Decision

Run a pilot architecture refactor focused on a deeper orchestration seam between UI components and analytics/query internals.

Pilot intent:

1. Introduce reusable orchestration abstractions for loading, error, and metadata lifecycle handling.
2. Reduce prop-surface and view-coupling pressure between App and FilterBar.
3. Move toward clearer responsibility separation in query internals (query construction, transformation, analytics).

## Scope

In scope:

- Pilot design and implementation slices for query/filter orchestration around hitters, pitchers, relievers, injured pitchers, and prospects.
- Regression guardrails for false no-results states across views.
- Tests that validate behavior through module interfaces, not only internal helper functions.

Out of scope:

- Full rewrite of all query logic.
- Ranking model changes unrelated to orchestration seams.
- Visual redesign.

## Consequences

Positive:

- Better locality for lifecycle and filtering behavior.
- Smaller interfaces for view wiring and easier incremental extension.
- More testable behavior at stable module seams.

Trade-offs:

- Additional abstraction layers may temporarily increase navigation overhead during migration.
- Requires disciplined incremental rollout to avoid behavior drift.

## Acceptance criteria

1. At least one shared orchestration abstraction is used by more than one view.
2. Filter wiring complexity is reduced without changing user-visible filter behavior.
3. No false no-results regressions across hitter, pitcher, reliever, or injured views.
4. New or updated tests verify behavior at the chosen seam.
