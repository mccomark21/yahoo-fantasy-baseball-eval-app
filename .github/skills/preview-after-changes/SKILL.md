---
name: preview-after-changes
description: "Use when: significant changes have been made to the app that affect UI layout, component rendering, analytics calculations, or data display. Launches the Vite dev server locally so the user can review the changes live in a browser. Triggers on: prospect table changes, player table changes, filter bar changes, scoring/trend logic changes, new columns or emojis added, query changes affecting displayed data."
---

# Preview After Changes

## When to Use

After completing any change that affects:
- Visual layout or component rendering (tables, badges, emojis, columns)
- Analytics or scoring logic (trend scores, composite scores, z-scores)
- Data displayed in the UI (new fields, reformatted values, filtered rows)
- Filter or sort behavior

Do **not** trigger for: pure refactors with no behavioral change, test-only edits, README/doc edits, type-only changes with no runtime effect.

## Procedure

1. **Check for a running dev server** — look for an existing terminal already running `vite` or listening on port 5173. If one is already running, skip to step 3.

2. **Start the dev server** — run the following in an async terminal:
   ```
   npm run dev
   ```
   Wait for the output line `Local: http://localhost:5173/` before proceeding.

3. **Open the app in the browser** — open `http://localhost:5173` so the user can immediately see the result.

4. **Summarize what changed visually** — in 2–4 bullet points, tell the user exactly what to look for in the UI:
   - Which tab or component was modified
   - What the new behavior or display looks like
   - Any edge cases or data-dependent states worth checking (e.g., "players with < 10 AB in L7 will show ➖")

5. **Invite feedback** — ask the user to call out any visual errors, wrong values, or layout issues they observe.

## Notes

- Dev server command: `npm run dev` (Vite, default port 5173)
- The app is a React + Vite SPA; hot module reload is active, so edits made after launch are reflected instantly without restarting
- If the port is already in use, Vite will auto-increment to 5174, 5175, etc. — check terminal output for the actual URL
