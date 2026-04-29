---
description: Launch the Vite dev server and open the app for review after completing changes that affect UI layout, component rendering, filter behavior, analytics calculations, or data display. Apply when editing src/**/*.{ts,tsx} files that touch tables, filters, scoring logic, emojis, columns, or queries.
applyTo: "src/**/*.{ts,tsx}"
---

# Preview After Changes

After completing changes to source files, launch the app so the user can review the result.

## When to Apply

Changes that require a preview:
- Filter bar additions or changes (new filter controls, new options)
- Table column additions, removals, or reformatting
- Scoring or analytics logic changes (composite scores, z-scores, thresholds)
- Emoji indicators or visual badges added or changed
- New query parameters or data fields surfaced in the UI
- Sort behavior changes

Do **not** trigger for: pure refactors with no behavioral change, test-only edits, README/doc edits, type-only changes with no runtime effect.

## Procedure

1. **Check for a running dev server** — scan open terminals for one already running `vite` or listening on port 5173. If found, skip to step 3.

2. **Start the dev server** in an async terminal:
   ```
   npm run dev
   ```
   Wait for `Local: http://localhost:5173/` in the output before proceeding.

3. **Tell the user the app is ready** at `http://localhost:5173/yahoo-fantasy-baseball-eval-app/`

4. **Summarize what to look for** in 2–4 bullet points:
   - Which tab or component changed
   - What the new behavior or display looks like
   - Any edge cases worth checking (e.g., "prospects with no level data won't appear when a level filter is active")

5. **Invite feedback** — ask the user to call out any visual errors, wrong values, or layout issues.

## Notes

- HMR is active — edits after launch reflect instantly without restarting the server
- If port 5173 is taken, Vite auto-increments; check terminal output for the actual URL
