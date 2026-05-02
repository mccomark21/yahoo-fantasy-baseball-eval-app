/**
 * Standalone backfill script for relief pitcher rankings.
 * Usage:  node scripts/backfill-relief-history.mjs
 */

import { load } from 'cheerio';
import { mkdir, writeFile, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RELIEF_CATEGORY_URL =
  'https://pitcherlist.com/category/fantasy/relief-pitchers/reliever-ranks/';
const ARTICLE_PATTERN = /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i;
const MAX_BACKFILL = 8;
const OUTPUT_DIR = path.join(ROOT, 'dist', 'api', 'relief-list');

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
  if (normalized === '-' || normalized === '0')
    return { movement_raw: movement, movement_value: 0, trend_direction: 'flat' };
  if (/^\+?UR$/i.test(normalized))
    return { movement_raw: movement, movement_value: null, trend_direction: 'new' };
  const match = normalized.match(/^([+-])\s*(\d+)$/);
  if (!match)
    return { movement_raw: movement, movement_value: null, trend_direction: 'unknown' };
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
  try { return new URL(href, 'https://pitcherlist.com').pathname; } catch { return null; }
}

function slugDate(pathname) {
  const lower = pathname.toLowerCase();
  const m = lower.match(/-(\d{1,2})-(\d{1,2})-week-\d+\/?$/);
  if (!m) return null;
  const month = parseInt(m[1], 10), day = parseInt(m[2], 10);
  if (!isFinite(month) || !isFinite(day)) return null;
  return { month, day };
}

function rankCandidate(pathname) {
  const lower = pathname.toLowerCase();
  const weekMatch = lower.match(/-week-(\d+)\/?$/);
  const d = slugDate(lower);
  return {
    weekNumber: weekMatch ? parseInt(weekMatch[1], 10) : 0,
    month: d?.month ?? 0,
    day: d?.day ?? 0,
  };
}

function compareArticles(a, b) {
  const ar = rankCandidate(a), br = rankCandidate(b);
  if (ar.weekNumber !== br.weekNumber) return br.weekNumber - ar.weekNumber;
  if (ar.month !== br.month) return br.month - ar.month;
  return br.day - ar.day;
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
    if (!pathname || !ARTICLE_PATTERN.test(pathname) || seen.has(pathname)) return;
    seen.add(pathname);
    candidates.push({ url: toAbsoluteUrl(href), pathname, index: i });
  });
  candidates.sort((a, b) => {
    const c = compareArticles(a.pathname, b.pathname);
    return c !== 0 ? c : a.index - b.index;
  });
  return candidates.slice(0, maxUrls).map((c) => c.url);
}

function parseArticle(articleUrl, articleHtml, mode) {
  const $ = load(articleHtml);
  const rankByNumber = new Map();
  const notesByRank = new Map();
  const notesByName = new Map();

  // For saves mode find the "Top 50 Closers" table; for svhld find "Top 100 Relievers"
  const tableHeadingPattern = mode === 'saves'
    ? /top\s*50\s*closers\s*for\s*fantasy\s*baseball/i
    : /top\s*100\s*relievers\s*for\s*sv\+hld\s*leagues/i;
  const minRows = mode === 'saves' ? 20 : 90;

  const tables = $('table').filter((_i, table) => {
    const siblingText = normalizeWhitespace($(table).prevAll('h1,h2,h3,h4,p,strong').first().text());
    return tableHeadingPattern.test(siblingText);
  });
  const targetTables = tables.length > 0 ? tables : $('table');

  targetTables.find('tr').each((_i, tr) => {
    const cells = $(tr).find('td').map((_j, td) => normalizeWhitespace($(td).text())).get();
    if (cells.length < 2) return;
    const rank = parseInt(cells[0], 10);
    if (!isFinite(rank) || rank < 1 || rank > 150) return;
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
    if (!isFinite(rank) || rank < 1 || rank > 150) return;
    const noteText = normalizeWhitespace(paragraph.clone().find('strong').remove().end().text());
    if (noteText) {
      notesByRank.set(rank, noteText);
      const playerName = cleanPlayerName(normalizeWhitespace(paragraph.find('a.player-tag').first().text()));
      if (playerName) notesByName.set(playerName.toLowerCase(), noteText);
    }
  });

  $('li').each((_i, li) => {
    const item = $(li);
    const playerName = cleanPlayerName(normalizeWhitespace(item.find('a.player-tag').first().text()));
    if (!playerName) return;
    const noteText = normalizeWhitespace(item.text());
    if (noteText) notesByName.set(playerName.toLowerCase(), noteText);
  });

  for (const row of rankByNumber.values()) {
    row.notes = notesByRank.get(row.latest_rank) ?? notesByName.get(row.player_name.toLowerCase()) ?? null;
  }

  const rows = [...rankByNumber.values()].sort((a, b) => a.latest_rank - b.latest_rank);
  if (rows.length < minRows) throw new Error(`Only ${rows.length} rows (mode=${mode}) from ${articleUrl}`);

  const title = normalizeWhitespace($('h1').first().text()) || 'Pitcher List Reliever Rankings';
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content') ??
    $('time[datetime]').first().attr('datetime') ??
    null;

  return { title, source_url: articleUrl, published_at: publishedAt, scraped_at: new Date().toISOString(), scoring_mode: mode, rows };
}

function resolveSnapshotDate(publishedAt, scrapedAt) {
  for (const c of [publishedAt, scrapedAt].filter(Boolean)) {
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
  console.log('[backfill] Fetching relief category page…');
  const categoryHtml = await fetchHtml(RELIEF_CATEGORY_URL);
  const articleUrls = discoverArticleUrls(categoryHtml, MAX_BACKFILL);
  console.log(`[backfill] Found ${articleUrls.length} article URL(s):`);
  articleUrls.forEach((u, i) => console.log(`  ${i + 1}. ${u}`));

  let existingSvhld = [], existingSaves = [];
  for (const [file, arr] of [['history.svhld.json', existingSvhld], ['history.saves.json', existingSaves]]) {
    try {
      const raw = await readFile(path.join(OUTPUT_DIR, file), 'utf8');
      arr.push(...(JSON.parse(raw).snapshots ?? []));
      console.log(`[backfill] Loaded ${arr.length} existing ${file} snapshot(s).`);
    } catch {
      console.log(`[backfill] No existing ${file} — starting fresh.`);
    }
  }

  const existingSvhldDates = new Set(existingSvhld.map((s) => s.snapshot_date));
  const existingSavesDates = new Set(existingSaves.map((s) => s.snapshot_date));
  let svhldSnapshots = [...existingSvhld];
  let savesSnapshots = [...existingSaves];

  for (const url of articleUrls) {
    console.log(`\n[backfill] Scraping: ${url}`);
    let html;
    try { html = await fetchHtml(url); }
    catch (err) { console.warn(`  → FAILED fetch: ${err.message}`); continue; }

    for (const mode of ['svhld', 'saves']) {
      const existingDates = mode === 'svhld' ? existingSvhldDates : existingSavesDates;
      try {
        const parsed = parseArticle(url, html, mode);
        const snapshot_date = resolveSnapshotDate(parsed.published_at, parsed.scraped_at);
        if (existingDates.has(snapshot_date)) {
          console.log(`  [${mode}] Already have ${snapshot_date}, skipping.`);
          continue;
        }
        const snapshot = { ...parsed, snapshot_date };
        if (mode === 'svhld') svhldSnapshots = upsertSnapshots(svhldSnapshots, snapshot);
        else savesSnapshots = upsertSnapshots(savesSnapshots, snapshot);
        console.log(`  [${mode}] ${snapshot_date}: ${parsed.rows.length} rows`);
      } catch (err) {
        console.warn(`  [${mode}] FAILED parse: ${err.message}`);
      }
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(path.join(OUTPUT_DIR, 'history.svhld.json'), JSON.stringify({ snapshots: svhldSnapshots }, null, 2), 'utf8');
  await writeFile(path.join(OUTPUT_DIR, 'history.saves.json'), JSON.stringify({ snapshots: savesSnapshots }, null, 2), 'utf8');
  console.log(`\n[backfill] Wrote ${svhldSnapshots.length} svhld + ${savesSnapshots.length} saves snapshot(s).`);
}

main().catch((err) => { console.error(err); process.exit(1); });
