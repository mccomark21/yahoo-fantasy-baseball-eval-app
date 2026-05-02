/**
 * Standalone backfill script — no build required.
 * Scrapes the Pitcher List category page, discovers up to 8 weekly articles,
 * parses each one, and writes dist/api/pitcher-list/history.json.
 *
 * Usage:  node scripts/backfill-pitcher-history.mjs
 */

import { load } from 'cheerio';
import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PITCHER_LIST_CATEGORY_URL =
  'https://pitcherlist.com/category/fantasy/starting-pitchers/the-list/';
const ARTICLE_PATTERN = /\/top-100-starting-pitchers-for-[^/]+\/?$/i;
const MAX_BACKFILL = 8;
const OUTPUT_DIR = path.join(ROOT, 'dist', 'api', 'pitcher-list');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'history.json');

// ── helpers ─────────────────────────────────────────────────────────────────

function normalizeWhitespace(v) {
  return v.replace(/\s+/g, ' ').trim();
}

function cleanPlayerName(v) {
  return normalizeWhitespace(v).replace(/\s*T\d+$/, '');
}

function parseMovement(rawValue) {
  const movement = normalizeWhitespace(rawValue || '-');
  const normalized = movement.replace('−', '-');

  if (normalized === '-' || normalized === '0') {
    return { movement_raw: movement, movement_value: 0, trend_direction: 'flat' };
  }
  if (/^\+?UR$/i.test(normalized)) {
    return { movement_raw: movement, movement_value: null, trend_direction: 'new' };
  }
  const match = normalized.match(/^([+-])\s*(\d+)$/);
  if (!match) {
    return { movement_raw: movement, movement_value: null, trend_direction: 'unknown' };
  }
  const sign = match[1] === '+' ? 1 : -1;
  const magnitude = Number(match[2]);
  return {
    movement_raw: `${sign > 0 ? '+' : '-'}${magnitude}`,
    movement_value: sign * magnitude,
    trend_direction: sign > 0 ? 'up' : 'down',
  };
}

function toAbsoluteUrl(href) {
  if (/^https?:\/\//i.test(href)) return href;
  return new URL(href, 'https://pitcherlist.com').toString();
}

function getPathname(href) {
  try { return new URL(href, 'https://pitcherlist.com').pathname; }
  catch { return null; }
}

function parseWeeklyArticleDate(pathname) {
  const lower = pathname.toLowerCase();
  const m = lower.match(/-(\d{1,2})-(\d{1,2})-(?:week-\d+-rankings|update)\/?$/);
  if (!m) return null;
  const month = parseInt(m[1], 10), day = parseInt(m[2], 10);
  if (!isFinite(month) || !isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}

function rankCandidate(pathname) {
  const lower = pathname.toLowerCase();
  const yearMatch = lower.match(/top-100-starting-pitchers-for-(\d{4})-fantasy-baseball/);
  const weekMatch = lower.match(/-week-(\d+)-rankings\/?$/);
  const weekNumber = weekMatch ? parseInt(weekMatch[1], 10) : 0;
  const articleDate = parseWeeklyArticleDate(lower);
  const seasonYear = yearMatch ? parseInt(yearMatch[1], 10) : 0;
  return {
    seasonYear: isFinite(seasonYear) ? seasonYear : 0,
    hasWeekRanking: Boolean(weekMatch),
    weekNumber: isFinite(weekNumber) ? weekNumber : 0,
    month: articleDate?.month ?? 0,
    day: articleDate?.day ?? 0,
  };
}

function compareArticles(a, b) {
  const ar = rankCandidate(a), br = rankCandidate(b);
  if (ar.seasonYear !== br.seasonYear) return br.seasonYear - ar.seasonYear;
  if (ar.hasWeekRanking !== br.hasWeekRanking) return ar.hasWeekRanking ? -1 : 1;
  if (ar.weekNumber !== br.weekNumber) return br.weekNumber - ar.weekNumber;
  if (ar.month !== br.month) return br.month - ar.month;
  if (ar.day !== br.day) return br.day - ar.day;
  return 0;
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; yahoo-fantasy-eval-app/1.0)' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder('utf-8').decode(buffer);
}

function discoverArticleUrls(categoryHtml, maxUrls) {
  const $ = load(categoryHtml);
  const seen = new Set();
  const candidates = [];

  $('a[href]').each((i, el) => {
    const href = $(el).attr('href') ?? '';
    const pathname = getPathname(href);
    if (!pathname) return;
    if (!ARTICLE_PATTERN.test(pathname)) return;
    if (seen.has(pathname)) return;
    seen.add(pathname);
    candidates.push({ url: toAbsoluteUrl(href), pathname, index: i });
  });

  candidates.sort((a, b) => {
    const c = compareArticles(a.pathname, b.pathname);
    return c !== 0 ? c : a.index - b.index;
  });

  return candidates.slice(0, maxUrls).map((c) => c.url);
}

function parseArticle(articleUrl, articleHtml) {
  const $ = load(articleHtml);
  const rankByNumber = new Map();
  const notesByRank = new Map();
  const notesByName = new Map();

  $('table').find('tr').each((_i, tr) => {
    const cells = $(tr).find('td').map((_j, td) => normalizeWhitespace($(td).text())).get();
    if (cells.length < 2) return;
    const rank = parseInt(cells[0], 10);
    if (!isFinite(rank) || rank < 1 || rank > 100) return;
    const playerName = cleanPlayerName(cells[1]);
    if (!playerName) return;
    const teamCell = cells[2] ?? '';
    const movementCell = cells[4] ?? cells[cells.length - 1] ?? '-';
    const movement = parseMovement(movementCell);
    if (!rankByNumber.has(rank)) {
      rankByNumber.set(rank, {
        latest_rank: rank,
        player_name: playerName,
        mlb_team: teamCell || null,
        ...movement,
        notes: null,
      });
    }
  });

  $('p').each((_i, p) => {
    const paragraph = $(p);
    const strongText = normalizeWhitespace(paragraph.find('strong').first().text());
    if (!/^\d+\./.test(strongText)) return;
    const rankMatch = strongText.match(/^(\d+)\./);
    if (!rankMatch) return;
    const rank = parseInt(rankMatch[1], 10);
    if (!isFinite(rank) || rank < 1 || rank > 100) return;
    const noteText = normalizeWhitespace(paragraph.clone().find('strong').remove().end().text());
    if (noteText) {
      notesByRank.set(rank, noteText);
      const playerLink = normalizeWhitespace(paragraph.find('a.player-tag').first().text());
      const playerName = cleanPlayerName(playerLink);
      if (playerName) notesByName.set(playerName.toLowerCase(), noteText);
    }
  });

  $('li').each((_i, li) => {
    const item = $(li);
    const playerLink = item.find('a.player-tag').first();
    const playerName = cleanPlayerName(normalizeWhitespace(playerLink.text()));
    if (!playerName) return;
    const noteText = normalizeWhitespace(item.text());
    if (noteText) notesByName.set(playerName.toLowerCase(), noteText);
  });

  for (const row of rankByNumber.values()) {
    row.notes = notesByRank.get(row.latest_rank) ?? notesByName.get(row.player_name.toLowerCase()) ?? null;
  }

  const rows = [...rankByNumber.values()].sort((a, b) => a.latest_rank - b.latest_rank);
  if (rows.length < 90) throw new Error(`Only ${rows.length} rows parsed from ${articleUrl}`);

  const title = normalizeWhitespace($('h1').first().text()) || 'Pitcher List Top 100';
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content') ??
    $('time[datetime]').first().attr('datetime') ??
    null;

  return { title, source_url: articleUrl, published_at: publishedAt, scraped_at: new Date().toISOString(), rows };
}

function resolveSnapshotDate(publishedAt, scrapedAt) {
  const candidates = [publishedAt, scrapedAt].filter(Boolean);
  for (const c of candidates) {
    const d = new Date(c);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

function upsertSnapshots(existing, incoming, max = 12) {
  const byDate = new Map();
  byDate.set(incoming.snapshot_date, incoming);
  for (const s of existing ?? []) {
    if (!byDate.has(s.snapshot_date)) byDate.set(s.snapshot_date, s);
  }
  return [...byDate.values()]
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
    .slice(0, max);
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[backfill] Fetching Pitcher List category page…');
  const categoryHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL);
  const articleUrls = discoverArticleUrls(categoryHtml, MAX_BACKFILL);
  console.log(`[backfill] Found ${articleUrls.length} article URL(s):`);
  articleUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

  // Load any existing local history first
  let existingSnapshots = [];
  try {
    const raw = await readFile(OUTPUT_FILE, 'utf8');
    existingSnapshots = JSON.parse(raw).snapshots ?? [];
    console.log(`[backfill] Loaded ${existingSnapshots.length} existing snapshot(s) from disk.`);
  } catch {
    console.log('[backfill] No existing local history found — starting fresh.');
  }

  const existingDates = new Set(existingSnapshots.map((s) => s.snapshot_date));
  let snapshots = [...existingSnapshots];

  for (const url of articleUrls) {
    console.log(`\n[backfill] Scraping: ${url}`);
    try {
      const html = await fetchHtml(url);
      const parsed = parseArticle(url, html);
      const snapshot_date = resolveSnapshotDate(parsed.published_at, parsed.scraped_at);

      if (existingDates.has(snapshot_date)) {
        console.log(`  → Already have snapshot for ${snapshot_date}, skipping.`);
        continue;
      }

      const snapshot = { ...parsed, snapshot_date };
      snapshots = upsertSnapshots(snapshots, snapshot);
      console.log(`  → Parsed ${parsed.rows.length} rows, snapshot_date: ${snapshot_date}`);

      const detmers = parsed.rows.find((r) => r.player_name.toLowerCase().includes('detmers'));
      if (detmers) {
        console.log(`  → Reid Detmers: rank #${detmers.latest_rank}, movement: ${detmers.movement_raw}`);
      } else {
        console.log(`  → Reid Detmers: not ranked this week`);
      }
    } catch (err) {
      console.warn(`  → FAILED: ${err.message}`);
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_FILE, JSON.stringify({ snapshots }, null, 2), 'utf8');
  console.log(`\n[backfill] Wrote ${snapshots.length} snapshot(s) to ${OUTPUT_FILE}`);

  console.log('\n━━━ Reid Detmers across all snapshots ━━━');
  const results = snapshots
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    .map((s) => {
      const row = s.rows.find((r) => r.player_name.toLowerCase().includes('detmers'));
      return { date: s.snapshot_date, title: s.title, rank: row?.latest_rank ?? '—', movement: row?.movement_raw ?? '—' };
    });

  console.table(results);
}

main().catch((err) => { console.error(err); process.exit(1); });
