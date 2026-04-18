# Fantasy Baseball Eval

**[Live App](https://mccomark21.github.io/yahoo-fantasy-baseball-eval-app/)**

A browser-based tool for evaluating **hitters, starting pitchers, and relievers** across Yahoo Fantasy Baseball leagues. It blends Yahoo roster data, StatCast-derived batter metrics from [PyBaseball](https://github.com/jldbc/pybaseball), and [Pitcher List](https://pitcherlist.com/) rankings, all processed client-side with [DuckDB WASM](https://duckdb.org/docs/api/wasm/overview) and static assets.

![App Screenshot](docs/screenshot.png)

## App Views

### Hitters

- League, fantasy team, and position filters
- Time windows: Season-to-Date, Last 30 Days, Last 14 Days, Last 7 Days
- Volume threshold filter: minimum PA and BBE set to 50% of the filtered-group medians
- Z-score normalization for xwOBA, BB:K, Pull Air%, and SB
- Composite score sorting (default):
	- xwOBA: 40%
	- BB:K: 30%
	- Pull Air%: 20%
	- SB: 10%
- Z-scores are clamped to +/-2.5 to reduce outlier impact

### Pitchers

- Uses latest Pitcher List Top 100 starting pitcher rankings
- Displays rank movement and notes alongside Yahoo fantasy-team context
- Supports league/team filtering to focus available or rostered arms

### Relievers

- Uses Pitcher List reliever rankings in two scoring modes:
	- `svhld` (saves + holds)
	- `saves`
- Scoring mode is inferred from league name (with `svhld` fallback when unmatched)
- Displays rank movement and notes with league/team context

## Data Pipeline

The app joins Yahoo and PyBaseball data in-browser and enriches pitcher views with Pitcher List ranking snapshots.

| Source | Format | Repository |
|--------|--------|------------|
| **Yahoo Fantasy Rosters** — league name, fantasy team, player name, MLB team, eligible positions | CSV | [mccomark21/yahoo-fantasy-data-hub](https://github.com/mccomark21/yahoo-fantasy-data-hub) |
| **PyBaseball Batter Game Logs** — per-game StatCast metrics (xwOBA, batted-ball data, plate discipline, etc.) | Parquet | [mccomark21/pybaseball-data-hub](https://github.com/mccomark21/pybaseball-data-hub) |
| **Pitcher List Rankings** — latest starting pitcher and reliever ranking articles | HTML -> JSON | [pitcherlist.com](https://pitcherlist.com/) |

The Yahoo and PyBaseball source files are fetched at startup and cached in **IndexedDB** with a 4-hour TTL to avoid redundant downloads on page reload.

## Build and Runtime API Behavior

The app uses different ranking data behavior in local development versus production hosting:

- **Local development (`npm run dev`)**
	- Vite middleware serves live scrape endpoints:
		- `/api/pitcher-list/latest`
		- `/api/relief-list/latest?scoring=svhld|saves`

- **Production build (`npm run build`)**
	- A Vite build plugin scrapes and writes static snapshots to:
		- `dist/api/pitcher-list/latest.json`
		- `dist/api/relief-list/latest.svhld.json`
		- `dist/api/relief-list/latest.saves.json`
	- The client reads these static JSON assets in production (GitHub Pages compatible)

## Key Features

- **Three-mode workflow** — evaluate Hitters, Pitchers, and Relievers in one app
- **Multi-league support** — switch between Yahoo leagues to evaluate different player pools
- **Default roster focus** — defaults to Free Agent and Waiver teams when available
- **Sortable data tables** — sort by any visible column
- **Theme toggle** — light/dark theme persisted via local storage
- **Responsive UI** — optimized for desktop and mobile usage
- **Accuracy cohort tooling** — optional panel to build reproducible xwOBA validation cohorts

### Hitter Metrics

| Stat | Description |
|------|-------------|
| **PA** | Plate Appearances |
| **BBE** | Batted Ball Events (balls put in play) |
| **xwOBA** | Expected Weighted On-Base Average (StatCast) |
| **Pull Air%** | Percentage of batted balls pulled or hit in the air |
| **BB:K** | Walk-to-Strikeout ratio |
| **SB** | Stolen Bases |

Each metric has a z-score column that normalizes values within the current filtered group. Composite score is a weighted blend of available z-scores.

| Metric | Weight |
|--------|--------|
| xwOBA | 40% |
| BB:K | 30% |
| Pull Air% | 20% |
| SB | 10% |

Z-scores are clamped to ±2.5 to prevent outliers from dominating the composite. The table sorts by composite score (descending) by default.

## Tech Stack

- **React 19** + **TypeScript** — UI framework
- **Vite 8** — build and dev tooling
- **DuckDB WASM** — in-browser SQL engine for joining and aggregating data
- **TanStack Table v8** — headless table with sorting
- **Tailwind CSS** + **shadcn/ui** — styling and component library
- **Cheerio** — HTML parsing for ranking snapshot generation

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Build for production
npm run build

# Preview the production build locally
npm run preview
```

## Available Scripts

- `npm run dev` - start local dev server with live ranking middleware endpoints
- `npm run build` - create production build and generate static ranking snapshots in `dist/api`
- `npm run lint` - run ESLint
- `npm run preview` - preview the production build locally

## Deployment

The app is configured for **GitHub Pages**. The base path is set in `vite.config.ts`:

```ts
base: '/yahoo-fantasy-baseball-eval-app/'
```

Because GitHub Pages is static hosting, ranking data is generated at build time into static JSON under `dist/api/*`. In local development, Vite middleware routes still provide live scraping.

Push the built output (from `npm run build`) to the `gh-pages` branch or configure GitHub Actions to deploy automatically.

## License

This project is licensed under the [MIT License](LICENSE).
