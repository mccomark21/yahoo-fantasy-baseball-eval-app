# ADR-0002: Hard age cutoff for Prospect Consensus Rank

- Status: Accepted
- Date: 2026-05-19

## Context

The **Prospect Consensus Rank** calculation previously used exponential decay with a 25% weight floor to handle sources of varying freshness. This approach caused outdated sources (e.g., from February/March) to still meaningfully influence consensus ranks for trending prospects, preventing accurate ranking movement tracking.

The problem was acute when two stale sources existed: the worst-rank exclusion logic removes only one outlier per prospect, leaving one outdated source to pull the consensus artificially low.

## Decision

Replace exponential weight decay with a hard age cutoff. Sources older than 60 days are excluded entirely from consensus calculations.

### Scope

This change applies only to **Prospect Consensus Rank** (`avg` field in `ProspectRow`). Source-specific rank fields (e.g., `mlb_rank`, `fangraphs_rank`) remain unchanged.

### Implementation

1. Remove the `PROSPECT_SOURCE_WEIGHT_FLOOR` (0.25) and `PROSPECT_SOURCE_HALF_LIFE_DAYS` constants.
2. Add `PROSPECT_SOURCE_MAX_AGE_DAYS = 60` constant.
3. Filter `activeSourceStatuses` by age before consensus calculation:
   - A source is considered "active" if it is both healthy (`status === 'ok' && row_count > 0`) AND updated within the last 60 days.
4. Worst-rank exclusion logic applies only to age-filtered sources (i.e., sources that remain after the age cutoff).
5. If no sources remain after age filtering, fall back to the original behavior (use all available sources with worst-rank exclusion).

## Rationale

### Why hard cutoff over weight decay?

**Hard cutoff:**
- Simpler mental model: "Only recent sources participate in consensus."
- Deterministic: A source either participates or doesn't; no ambiguity about partial influence.
- Easier to document and reason about in future code reviews.

**Weight decay (previous approach):**
- Gradual influence as sources age.
- More forgiving but harder to explain and debug.
- Two stale sources still partially influence consensus, defeating the intent to exclude them.

### Why 60 days?

- Covers the original problem case: February sources are ~80 days old on May 19, so they are reliably excluded.
- Allows ~2-month grace period for publication delays or edge cases.
- Aligns with Q-to-Q transitions (roughly one quarter).
- Simpler than calculating half-lives or percentile-based decay.

### Why exclude worst-rank only from active sources?

- Once a source is deemed too old to use, it should not influence any downstream logic, including the selection of which source gets excluded.
- Keeps the consensus calculation logic clean: "Evaluate only active sources, then exclude the worst among them."

## Consequences

### Positive

- Outdated sources no longer drag down trending prospects.
- Cleaner, more predictable behavior for users and maintainers.
- Fewer edge cases in the worst-rank exclusion logic.

### Negative (trade-offs)

- If all sources become stale (e.g., system outage), consensus falls back to all available sources. This is a rare edge case but should be documented in UX.
- Hard cutoff at 60 days means a source can abruptly become inactive on day 61 (though in practice, sources are scraped frequently enough that this is unlikely).

## Acceptance criteria

1. A prospect with a Feb/March source and several May sources now excludes the Feb/March source from consensus.
2. Test validates that sources > 60 days old are excluded before consensus is calculated.
3. Worst-rank exclusion applies only to non-excluded (age-filtered) sources.
4. Prospect table displays correctly; no regressions in filtering or sorting.
5. Documentation (CONTEXT.md) updated to clarify the 60-day freshness requirement.
