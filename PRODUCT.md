# Product

## Register

product

## Users

Fantasy baseball managers — typically experienced players who run one or more Yahoo leagues simultaneously. They use this tool during the season to make roster decisions: streaming pitchers, trading hitters, monitoring prospects, and tracking injured players to add back. Context is usually a desktop browser mid-week or on waiver day, moving fast, wanting signal not noise.

## Product Purpose

A client-side analytical workbench for evaluating Yahoo Fantasy Baseball player pools across five views: Hitters (StatCast z-score composite), SP Rankings (Pitcher List), RP Rankings (Pitcher List), Injured Pitchers, and Prospects (multi-source consensus). It replaces manual cross-referencing of external sites by bringing structured data into one fast, filterable interface. Success is a manager who can open the app, find who to stream or add, and close it in under two minutes.

## Brand Personality

Analytical, sharp, precise. Data is the hero; the interface earns trust by getting out of the way. Not intimidating — fluent managers should feel at home immediately. Think scouting room tool, not consumer sports app.

## Anti-references

- Generic shadcn/Vercel SaaS defaults: white-card grids, gray sidebar chrome, navy accent buttons. The out-of-the-box palette is a tell.
- ESPN/Yahoo portal UIs: banner-heavy, ad-compromised, visually noisy, slow-feeling.
- Bloomberg Terminal aesthetics: numbers-as-wallpaper, no hierarchy. Data density without clarity is not a goal.

## Design Principles

1. **Signal over chrome.** Every UI element competes with the data for attention. Only include visual weight that earns its keep.
2. **State has a voice.** Loading, empty, error, selected, filtered — each state should look meaningfully different. No ambiguous UI.
3. **Density is a feature.** Managers want multiple data points at once. Readable density is the goal, not whitespace for its own sake.
4. **Familiar vocabulary, not default styling.** Use standard affordances (tabs, selects, toggles, tables) but apply them with intention — not straight out of the component library box.
5. **Teal is the voice.** The existing teal nav strip is the one committed brand color. All other color decisions radiate from it.

## Accessibility & Inclusion

WCAG AA minimum. Body text ≥ 4.5:1 contrast against backgrounds in both light and dark modes. Keyboard navigable for all interactive controls. Reduced motion alternative for any transitions. No color-only state encoding (pair with shape or label for colorblind users).
