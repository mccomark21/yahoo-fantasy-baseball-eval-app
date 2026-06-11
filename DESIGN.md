---
name: Fantasy Baseball Research
description: MLB-flavored analytical workbench for evaluating fantasy baseball player pools
colors:
  navy-deep: "#002D62"
  navy-ink: "#0C1829"
  navy-mid: "#1A3D75"
  red: "#BF0D3E"
  white: "#FFFFFF"
  surface: "#EFF3FA"
  surface-header: "#E2E8F3"
  muted: "#677286"
  border: "#CDD4E2"
  destructive: "#BF0D3E"
typography:
  headline:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.01em"
  title:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Geist Variable', sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.06em"
  mono:
    fontFamily: "'Geist Mono Variable', monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.navy-deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.navy-mid}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.navy-deep}"
    rounded: "{rounded.sm}"
    padding: "8px 16px"
  chip-default:
    backgroundColor: "{colors.white}"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  chip-selected:
    backgroundColor: "{colors.navy-deep}"
    textColor: "{colors.white}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  input:
    backgroundColor: "{colors.white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.sm}"
    padding: "6px 10px"
---

# Design System: Fantasy Baseball Research

## 1. Overview

**Creative North Star: "The Analyst's Dugout"**

A purpose-built analytical workbench for fantasy baseball managers who think like scouts. Every decision on the screen — color, weight, density — comes from one question: does this help the manager make a call faster? The interface brings MLB's own visual language (Navy authority, Red urgency) into a product context where data is the protagonist and chrome is the support staff.

The palette is overtly sport-native. MLB Navy (#002D62) anchors structure and hierarchy; MLB Red (#BF0D3E) appears only where the data demands attention — active states, live trend signals, high-rank indicators. The surface is white and near-white with a cool navy tint, never warm, never cream. Depth comes from tonal layering, not shadows. The single typeface (Geist Variable) covers every role from column headers to stat values; no display face, no serif callout, no second family.

This system explicitly rejects: the generic shadcn/Vercel defaults (white-card grids, pure-achromatic token palette, navy-accent-by-habit) that the previous version shipped with; the ESPN/Yahoo portal aesthetic (banner-heavy, visually noisy, ad-compromised); and the teal palette that existed before this system, which carried no baseball identity. Those paths produce a tool that looks like every other SaaS dashboard or like a consumer sports app — neither fits a serious manager's workflow.

**Key Characteristics:**
- MLB Navy (#002D62) header band gives the tool an unmistakable sport-native identity from first load
- MLB Red (#BF0D3E) appears on ≤5% of any screen — its scarcity is what makes it readable as a signal
- Tables are the primary surface: strong column headers, clear hover and selection states, monospace data values
- Single typeface (Geist Variable + Geist Mono Variable) with no secondary faces
- Cool navy direction on all neutral surfaces — no warm tints, no cream, no beige

## 2. Colors

A sport-native two-accent palette (Navy + Red) over a cool white ground. Navy carries structure; Red carries urgency and active state.

### Primary
- **MLB Navy** (#002D62): The identity anchor. Header band, nav tab container, primary button fills, focus rings, selected filter chips. The darkest surface in the system. Never used below 60% opacity.
- **MLB Red** (#BF0D3E): Urgency and active state signal. Active tab indicator (bottom border), trend-hot badge accent, primary CTA color. Used on ≤5% of screen area per view.

### Secondary
- **Navy Mid** (#1A3D75): Interactive hover accents, selected rank badges, secondary emphasis where Navy Deep would be too heavy. Lightened navy — same hue family, more approachable weight.

### Neutral
- **White** (#FFFFFF): Primary content surface. Table rows, page background, input fill, card backgrounds.
- **Surface** (#EFF3FA): Slightly navy-tinted near-white. Filter bar background, alternating row tint, panel containers. Not cream — the tint is cool and directional.
- **Surface Header** (#E2E8F3): Table column header background. Stronger navy tint than Surface; visually separates the header row from data rows without needing a dark fill.
- **Navy Ink** (#0C1829): Primary text. Near-black with a navy undertone — replaces pure #000000 throughout. Softer than pure black while maintaining full contrast against white.
- **Muted** (#677286): Secondary text, metadata labels, placeholder text, inactive filter values. Must clear 4.5:1 against white (#FFFFFF) — at this value it does: contrast ≈ 4.7:1.
- **Border** (#CDD4E2): Hairline separators, input strokes, table row dividers, card borders. Navy-tinted so it reads as part of the same palette family, not a warm or neutral gray.

### Named Rules

**The Red Scarcity Rule.** MLB Red (#BF0D3E) is reserved for: the active nav tab indicator, trend-hot signals (🔥), and primary CTA fills. It is never used for decoration, section dividers, or emphasis that isn't genuinely active or urgent. If an element "just needs some color," reach for Navy Mid (#1A3D75) first. The red's signal value depends entirely on its rarity.

**The Navy-Tint Discipline Rule.** Every neutral surface — white excepted — uses the same cool navy hue direction. Surface (#EFF3FA), Surface Header (#E2E8F3), Border (#CDD4E2), Navy Ink (#0C1829), and Muted (#677286) all share the navy hue angle (approximately 254°). Warm tints (cream, beige, warm gray) are prohibited; mixing hue families destroys the sport-native coherence.

## 3. Typography

**Primary Font:** Geist Variable (with `sans-serif` fallback)
**Data/Mono Font:** Geist Mono Variable (with `monospace` fallback)

**Character:** One family, two axes. The variable weight axis carries everything from column header labels (500) to section headings (600) without needing a second face. Geist reads cleanly at high density, remains legible at 11px column headers, and has the technical precision that fits a scouting-room tool without the sterility of a pure system font.

### Hierarchy

- **Headline** (600, 1.125rem / line-height 1.4, letter-spacing -0.01em): The app title "Fantasy Baseball Research" in the header. Rare — only one element on the page.
- **Title** (600, 1rem / 1.4): Section headings, view name labels, filter panel section titles.
- **Body** (400, 0.875rem / 1.5): Table cell values, filter descriptions, inline copy, tooltip text. Max line length 65ch for any prose context.
- **Label** (500, 0.6875rem / 1, letter-spacing 0.06em, UPPERCASE): Column headers exclusively. The uppercase + tracking pair is the signal that distinguishes a header from a data value without any fill or color change.
- **Mono** (Geist Mono Variable, 400, 0.8125rem / 1.4): All numeric stat values — xwOBA, ERA, WHIP, z-scores, rank numbers, composite scores, PA, AB, IP. Monospace rendering aligns decimal points in data columns without HTML column alignment tricks.

### Named Rules

**The Single-Family Rule.** Geist Variable and Geist Mono Variable are the only typefaces on this surface. No display font for the app title. No serif callout for a section header. No second sans. The variable axis provides sufficient weight contrast; a second family adds noise, not voice.

**The Mono-Data Rule.** Every numeric stat cell renders in Geist Mono Variable. If the cell shows a number — z-score, rank, rate stat, count, decimal — it uses `font-family: 'Geist Mono Variable', monospace`. Mixed proportional/monospace rendering in stat tables is prohibited; it breaks column scannability.

## 4. Elevation

Flat by default. Surfaces are differentiated through tonal layering (white → #EFF3FA → #E2E8F3 → #002D62), not box shadows. The navy header band's contrast against white IS its elevation signal — no shadow beneath it. Shadow appears only on floating layers separated from the document flow.

### Shadow Vocabulary

- **Popover / Floating** (`box-shadow: 0 4px 20px rgba(0, 45, 98, 0.12)`): Command palettes, dropdowns, tooltips, modals. Navy-tinted shadow so the floating layer reads as part of the same palette rather than a gray film lifted off the page.

### Named Rules

**The Flat-By-Default Rule.** Table rows have no shadow. Cards have no shadow. The header has no shadow. The filter bar has no shadow. Shadow is for floating layers only — if it's not floating (modal, popover, tooltip), it doesn't get a shadow. Tonal layering handles all depth otherwise.

## 5. Components

### Buttons

Minimal and purposeful. Solid fill on primary; the navy color does the communicative work, no oversizing needed.

- **Shape:** 4px radius (`rounded.sm`). Not pill-shaped, not square. Functionally rounded.
- **Primary:** Navy-deep fill (#002D62), white text, 8px vertical / 16px horizontal padding. Font: 0.875rem body size, weight 500. Transition: background-color 150ms ease-out.
- **Hover:** Navy Mid fill (#1A3D75). No transform, no shadow — color shift is the sole feedback.
- **Ghost:** Transparent fill, 1px border (#CDD4E2), Navy Ink text (#0C1829). Matches primary in size. Hover: border shifts to Navy Deep (#002D62), text same.
- **Disabled:** 40% opacity, no pointer events.

### Navigation Tabs (View Mode)

The identity anchor of the interface. The navy band is visible on every view.

- **Container:** Navy Deep background (#002D62), `px-3 py-2` outer padding, 0.5px gap between tabs.
- **Tab (default):** White text at 70% opacity. 0.875rem, weight 600. No fill.
- **Tab (active):** White text at 100% + 2px MLB Red (#BF0D3E) bottom border as the active indicator. No background fill change on the active tab — the red indicator carries the signal.
- **Hover (inactive):** White text at 90% opacity. Transition 100ms.
- **Mobile:** Horizontally scrollable row, same styling.

### Data Tables

The primary UI surface. Density is a feature; legibility is the constraint.

- **Column Headers:** Surface Header background (#E2E8F3), Navy Ink text (#0C1829) in uppercase label style (0.6875rem, 500, 0.06em tracking). Sticky top in scrollable tables. 1px bottom border in Border (#CDD4E2).
- **Data Rows:** White background, Navy Ink body text. 1px Border (#CDD4E2) bottom divider.
- **Hover:** Row background shifts to Surface (#EFF3FA). Cursor default unless the row is explicitly clickable.
- **Selected Row:** Surface (#EFF3FA) with a 2px left border in Navy Mid (#1A3D75).
- **Numeric Cells:** Geist Mono Variable, right-aligned.
- **Sort Active Column:** Header text shifts to Navy Mid (#1A3D75) + ▲/▼ icon beside the label.

### Filter Chips / Toggle Groups

Quiet at rest; unambiguous when active.

- **Default:** White fill, 1px Border (#CDD4E2), Muted text (#677286). 4px radius. Uppercase label text (0.6875rem, 500, 0.06em tracking).
- **Selected:** Navy Deep fill (#002D62), white text, no border.
- **Hover (default):** Surface fill (#EFF3FA), border same. Transition 100ms.
- **Size:** 4px vertical / 10px horizontal padding.

### Select / Input Fields

- **Style:** White fill, 1px border (#CDD4E2), 4px radius. Body size (0.875rem), Navy Ink text.
- **Placeholder:** Muted color (#677286) at full opacity. Never reduced-opacity default gray — it must clear 4.5:1 against white.
- **Focus:** Border shifts to Navy Deep (#002D62) with a 2px ring at `rgba(0, 45, 98, 0.2)`. No glow. Transition 100ms.
- **Error:** Border shifts to Red (#BF0D3E). Error message in Red below the field, label weight.
- **Disabled:** 40% opacity background tint of Surface (#EFF3FA).

### Trend / Rank Badges (Signature)

The prospect and pitcher views use these as primary data signals.

- **Hot badge (🔥):** Surface Header background (#E2E8F3) pill, Red text (#BF0D3E). Compact 0.6875rem label. Never a full red fill — the Red Scarcity Rule applies.
- **Cold badge (🧊):** Surface background (#EFF3FA) pill, Muted text (#677286).
- **Rostered badge:** Navy Mid fill (#1A3D75), white text, 4px radius, uppercase label.
- **Free Agent badge:** Border (#CDD4E2) stroke, Muted text, 4px radius, uppercase label.
- **Rank numbers (top 10):** Navy Deep (#002D62), weight 600, Geist Mono.

## 6. Do's and Don'ts

### Do:
- **Do** use MLB Navy (#002D62) as the header band fill. It is the identity anchor; diluting it with lighter navys or gradients removes the one sport-native signal in the interface.
- **Do** render every numeric stat column in Geist Mono Variable. Decimal alignment in data tables is a legibility requirement, not an aesthetic choice.
- **Do** apply uppercase + 0.06em letter-spacing to every column header. This is the semantic signal that separates headers from data values without relying on color alone.
- **Do** keep MLB Red (#BF0D3E) to ≤5% of screen area per view. An active nav tab indicator, a hot badge, a CTA button — that's the budget. The Red Scarcity Rule is the one thing that makes red readable as a signal rather than decoration.
- **Do** use the cool navy direction on all neutral surfaces. Surface (#EFF3FA), Border (#CDD4E2), Surface Header (#E2E8F3) all share the same hue angle (~254°). Warm tints and the neutrals must remain in the same hue family.
- **Do** target WCAG AA on all text combinations: ≥4.5:1 for body and label text, ≥3:1 for large text. Muted text (#677286) on white (#FFFFFF) clears 4.7:1 — do not lighten it further.
- **Do** use `box-shadow: 0 4px 20px rgba(0, 45, 98, 0.12)` on floating layers (dropdowns, tooltips, modals). The navy tint ties the shadow to the palette.

### Don't:
- **Don't** use the shadcn default achromatic palette: `oklch(0.97 0 0)` secondary fills, pure `oklch(0.145 0 0)` foreground, chroma-0 borders. That's the template this revamp replaces.
- **Don't** use the old teal palette (teal-950, teal-700, any `oklch(... ... 180-210)` hue-range value). Teal is retired from this system; it carries no baseball identity.
- **Don't** use warm neutrals — cream (#FAF7F2 and family), beige, sand, warm gray, any neutral with C > 0.01 toward the yellow hue range. The palette has a cool navy direction; mixing warm tints destroys it.
- **Don't** use MLB Red (#BF0D3E) as a fill on non-active, non-destructive, non-urgent elements. The Red Scarcity Rule: if it's not an active indicator or a genuine urgency signal, it doesn't get red.
- **Don't** use `border-left` or `border-right` wider than 1px as a colored accent stripe on cards or list items. This is a universal prohibition.
- **Don't** introduce a second typeface. The Single-Family Rule is firm — no serif callout, no display face for the app title, no additional sans.
- **Don't** add shadow to flat content surfaces (table rows, cards, header). Shadows belong to floating layers only. The Flat-By-Default Rule is absolute.
- **Don't** produce ESPN/Yahoo portal visual patterns: colored section dividers, header rows per category, ad-style banner regions, multi-level nav hierarchies. The tool is a focused single-screen workbench, not a portal.
- **Don't** use gradient text (`background-clip: text`). Never. Not for the app title, not for rank numbers, not for anything.
