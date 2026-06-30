import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { load } from 'cheerio'
import { mkdir, writeFile, readFile } from 'fs/promises'
import path from 'path'

const PITCHER_LIST_CATEGORY_URL =
  'https://pitcherlist.com/category/fantasy/starting-pitchers/the-list/'
const RELIEF_LIST_CATEGORY_URL_SVHLD =
  'https://pitcherlist.com/category/fantasy/relief-pitchers/reliever-ranks/'
const HITTER_LIST_CATEGORY_URL =
  'https://pitcherlist.com/category/fantasy/hitters-fantasy/hitter-list/'
// Pitcher List publishes a weekly "Top 150 Hitters" board; the season's seed
// article carries no week suffix, weekly updates append "-week-N".
const HITTER_LIST_ARTICLE_PATTERN = /\/top-150-hitters-for-fantasy-baseball-[^/]+\/?$/i
const HITTER_LIST_MAX_RANK = 150
const MLB_PROSPECTS_URL = 'https://www.mlb.com/milb/prospects/top100/'
const FANGRAPHS_PROSPECTS_URL = 'https://www.fangraphs.com/prospects/the-board'
const PROSPECTS_LIVE_URL = 'https://www.prospectslive.com/2026-top-100-prospects/'
const FANTRAX_PROSPECTS_URL = 'https://fantraxhq.com/top-400-fantasy-baseball-prospects-dynasty/'
const PITCHERLIST_PROSPECTS_URL = 'https://pitcherlist.com/category/dynasty/prospect-rankings/'
const TJSTATS_PROSPECTS_URL = 'https://tjstats.ca/top-100-prospects/'
const TJSTATS_PROSPECTS_API_URL = 'https://tjstats.ca/wp-json/tjstats/v1/rankings'
const PRODUCTION_API_BASE_URL =
  process.env.PRODUCTION_API_BASE_URL ??
  'https://mccomark21.github.io/yahoo-fantasy-baseball-eval-app/api'
const MAX_HISTORY_SNAPSHOTS = 12
const HISTORY_BACKFILL_TARGET = 8

type ReliefScoringMode = 'svhld' | 'saves'
type ProspectSourceName = 'mlb' | 'fangraphs' | 'prospects_live' | 'fantrax' | 'pitcherlist' | 'tjstats'
type SnapshotRefreshTarget = 'all' | 'pitcher' | 'hitter' | 'relief' | 'cbs'
type PitcherSourceList = 'SP' | 'RP'

type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'unknown'

interface PitcherListRankRow {
  latest_rank: number
  player_name: string
  mlb_team: string | null
  movement_raw: string
  movement_value: number | null
  trend_direction: TrendDirection
  notes: string | null
}

interface PitcherListLatestResponse {
  title: string
  source_url: string
  published_at: string | null
  scraped_at: string
  rows: PitcherListRankRow[]
}

interface ReliefListLatestResponse {
  title: string
  source_url: string
  published_at: string | null
  scraped_at: string
  scoring_mode: ReliefScoringMode
  rows: PitcherListRankRow[]
}

interface PitcherListHistorySnapshot extends PitcherListLatestResponse {
  snapshot_date: string
}

interface PitcherListHistoryResponse {
  snapshots: PitcherListHistorySnapshot[]
}

interface ReliefListHistorySnapshot extends ReliefListLatestResponse {
  snapshot_date: string
}

interface ReliefListHistoryResponse {
  snapshots: ReliefListHistorySnapshot[]
}

interface InjuredPitcherRow {
  rank_when_healthy: number | null
  player_name: string
  mlb_team: string | null
  injury_note: string | null
  source_list: PitcherSourceList
}

interface InjuredPitchersLatestResponse {
  title: string
  source_urls: {
    sp: string
    rp: string
  }
  scraped_at: string
  rows: InjuredPitcherRow[]
}

interface ProspectSourceRow {
  source: ProspectSourceName
  rank: number
  player_name: string
  org: string | null
  positions: string[]
  age: number | null
  eta: string | null
  level: string | null
  height: string | null
  weight: string | null
  bats: string | null
  throws: string | null
  fv: string | null
  ofp: string | null
  stats_summary: string | null
  scouting_report: string | null
  notes: string | null
}

interface ProspectSourceStatus {
  source: ProspectSourceName
  title: string
  source_url: string
  published_at: string | null
  scraped_at: string
  status: 'ok' | 'error'
  row_count: number
  error: string | null
}

interface ProspectsLatestResponse {
  title: string
  scraped_at: string
  sources: ProspectSourceStatus[]
  rows: ProspectSourceRow[]
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function repairMojibake(value: string): string {
  if (!/[ÃÂ]/.test(value)) {
    return value
  }
  try {
    return Buffer.from(value, 'latin1').toString('utf8')
  } catch {
    return value
  }
}

function normalizeEtaValue(value: unknown): string | null {
  const normalized = normalizeWhitespace(String(value ?? ''))
  if (!normalized) return null

  const yearMatch = normalized.match(/\b(19|20)\d{2}\b/)
  if (yearMatch) {
    return yearMatch[0]
  }

  if (/^mlb$/i.test(normalized)) {
    return 'MLB'
  }

  return normalized
}

function normalizeLevelValue(value: unknown): string | null {
  const normalized = normalizeWhitespace(String(value ?? ''))
  if (!normalized) return null

  const upper = normalized.toUpperCase()
  if (upper === 'AAA' || upper === 'AA' || upper === 'A+' || upper === 'A' || upper === 'MLB') {
    return upper
  }

  if (/TRIPLE\s*-?\s*A/i.test(normalized)) return 'AAA'
  if (/DOUBLE\s*-?\s*A/i.test(normalized)) return 'AA'
  if (/HIGH\s*-?\s*A/i.test(normalized)) return 'A+'
  if (/LOW\s*-?\s*A|SINGLE\s*-?\s*A/i.test(normalized)) return 'A'
  if (/ROOKIE|COMPLEX|FCL|ACL|DSL/i.test(normalized)) return 'ROK'

  return normalized
}

function extractLevelFromText(value: string | null): string | null {
  if (!value) return null
  const match = value.match(/(Triple-A|Double-A|High-A|Low-A|Single-A|AAA|AA|A\+|MLB|Rookie|FCL|ACL|DSL)/i)
  if (!match) return null
  return normalizeLevelValue(match[1])
}

function normalizeHeightValue(value: unknown): string | null {
  const normalized = normalizeWhitespace(String(value ?? ''))
  if (!normalized) return null

  const feetInches = normalized.match(/(\d+)\s*['’]\s*(\d{1,2})\s*(?:"|”|in)?/)
  if (feetInches) {
    return `${feetInches[1]}'${feetInches[2]}"`
  }

  const dashed = normalized.match(/^(\d)\s*[- ]\s*(\d{1,2})$/)
  if (dashed) {
    return `${dashed[1]}'${dashed[2]}"`
  }

  return normalized
}

function normalizeWeightValue(value: unknown): string | null {
  const normalized = normalizeWhitespace(String(value ?? ''))
  if (!normalized) return null
  const numberMatch = normalized.match(/\d{2,3}/)
  if (!numberMatch) return normalized
  return `${numberMatch[0]} lb`
}

function normalizeScoutingText(value: unknown, maxLen = 1200): string | null {
  const normalized = repairMojibake(normalizeWhitespace(String(value ?? '')))
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
  if (!normalized) return null
  if (normalized.length <= maxLen) return normalized
  return `${normalized.slice(0, maxLen).trimEnd()}...`
}

function extractJsonLdDates(html: string): { datePublished: string | null; dateModified: string | null } {
  const $ = load(html)
  const scripts = $('script[type="application/ld+json"]')
    .map((_i, script) => normalizeWhitespace($(script).text()))
    .get()

  for (const script of scripts) {
    if (!script) continue

    try {
      const parsed = JSON.parse(script) as unknown
      const nodes = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === 'object' && Array.isArray((parsed as { '@graph'?: unknown[] })['@graph'])
          ? ((parsed as { '@graph': unknown[] })['@graph'] as unknown[])
          : [parsed]

      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        const record = node as { datePublished?: unknown; dateModified?: unknown }
        const datePublished = typeof record.datePublished === 'string' ? record.datePublished : null
        const dateModified = typeof record.dateModified === 'string' ? record.dateModified : null
        if (datePublished || dateModified) {
          return { datePublished, dateModified }
        }
      }
    } catch {
      continue
    }
  }

  return { datePublished: null, dateModified: null }
}

function extractGenericPublishedAt(html: string): string | null {
  const $ = load(html)
  const metaCandidates = [
    $('meta[property="article:modified_time"]').attr('content'),
    $('meta[property="article:published_time"]').attr('content'),
    $('meta[property="og:updated_time"]').attr('content'),
    $('time[datetime]').first().attr('datetime'),
  ]

  for (const candidate of metaCandidates) {
    if (candidate) return candidate
  }

  const jsonLd = extractJsonLdDates(html)
  return jsonLd.dateModified ?? jsonLd.datePublished ?? null
}

function parseEasternUpdatedTimestamp(value: string): string | null {
  const normalized = normalizeWhitespace(value).replace(/^Updated:\s*/i, '')
  const match = normalized.match(
    /^(?:[A-Za-z]+,\s*)?([A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M)\s+ET$/i
  )
  if (!match) return null

  const parsed = new Date(`${match[1]} GMT-0400`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function extractScoutingGradesSummary(report: string | null): string | null {
  if (!report) return null
  const tightMatch = report.match(
    /Scouting grades?:\s*(Hit:\s*[^|]+\|\s*Power:\s*[^|]+\|\s*Run:\s*[^|]+\|\s*Arm:\s*[^|]+\|\s*Field:\s*[^|]+\|\s*Overall:\s*\d+)/i
  )
  if (tightMatch) {
    return normalizeWhitespace(tightMatch[1])
  }

  const looseMatch = report.match(/Scouting grades?:\s*([^.]{1,220})/i)
  if (looseMatch) {
    return normalizeWhitespace(looseMatch[1])
  }

  return null
}

function normalizeBatThrowValue(value: unknown): string | null {
  const normalized = normalizeWhitespace(String(value ?? '')).toUpperCase()
  if (!normalized) return null
  if (normalized === 'RIGHT' || normalized === 'R') return 'R'
  if (normalized === 'LEFT' || normalized === 'L') return 'L'
  if (normalized === 'SWITCH' || normalized === 'S') return 'S'
  return null
}

function cleanPlayerName(value: string): string {
  return normalizeWhitespace(value).replace(/\s*T\d+$/, '')
}

function parseMovement(rawValue: string): {
  movement_raw: string
  movement_value: number | null
  trend_direction: TrendDirection
} {
  const movement = normalizeWhitespace(rawValue || '-')
  const normalized = movement.replace('−', '-')

  if (normalized === '-' || normalized === '0') {
    return {
      movement_raw: movement,
      movement_value: 0,
      trend_direction: 'flat',
    }
  }

  if (/^\+?UR$/i.test(normalized)) {
    return {
      movement_raw: movement,
      movement_value: null,
      trend_direction: 'new',
    }
  }

  const match = normalized.match(/^([+-])\s*(\d+)$/)
  if (!match) {
    return {
      movement_raw: movement,
      movement_value: null,
      trend_direction: 'unknown',
    }
  }

  const sign = match[1] === '+' ? 1 : -1
  const magnitude = Number(match[2])
  const movementValue = sign * magnitude

  return {
    movement_raw: `${sign > 0 ? '+' : '-'}${magnitude}`,
    movement_value: movementValue,
    trend_direction: sign > 0 ? 'up' : 'down',
  }
}

function toAbsoluteUrl(href: string): string {
  if (/^https?:\/\//i.test(href)) {
    return href
  }
  return new URL(href, 'https://pitcherlist.com').toString()
}

function getPathnameFromHref(href: string): string | null {
  try {
    return new URL(href, 'https://pitcherlist.com').pathname
  } catch {
    return null
  }
}

function parseWeeklyArticleDate(pathname: string): { month: number; day: number } | null {
  const lower = pathname.toLowerCase()
  const dateMatch = lower.match(/-(\d{1,2})-(\d{1,2})-(?:week-\d+-rankings|update)\/?$/)
  if (!dateMatch) {
    return null
  }

  const month = Number.parseInt(dateMatch[1], 10)
  const day = Number.parseInt(dateMatch[2], 10)
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    return null
  }

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  return { month, day }
}

function rankArticleCandidate(pathname: string): {
  seasonYear: number
  hasWeekRanking: boolean
  weekNumber: number
  month: number
  day: number
} {
  const lower = pathname.toLowerCase()
  const seasonYearMatch = lower.match(/top-100-starting-pitchers-for-(\d{4})-fantasy-baseball/)
  const weekMatch = lower.match(/-week-(\d+)-rankings\/?$/)
  const weekNumber = weekMatch ? Number.parseInt(weekMatch[1], 10) : 0
  const articleDate = parseWeeklyArticleDate(lower)
  const seasonYear = seasonYearMatch ? Number.parseInt(seasonYearMatch[1], 10) : 0

  return {
    seasonYear: Number.isFinite(seasonYear) ? seasonYear : 0,
    hasWeekRanking: Boolean(weekMatch),
    weekNumber: Number.isFinite(weekNumber) ? weekNumber : 0,
    month: articleDate?.month ?? 0,
    day: articleDate?.day ?? 0,
  }
}

function compareArticleCandidates(a: string, b: string): number {
  const aRank = rankArticleCandidate(a)
  const bRank = rankArticleCandidate(b)

  if (aRank.seasonYear !== bRank.seasonYear) {
    return bRank.seasonYear - aRank.seasonYear
  }

  if (aRank.hasWeekRanking !== bRank.hasWeekRanking) {
    return aRank.hasWeekRanking ? -1 : 1
  }

  if (aRank.weekNumber !== bRank.weekNumber) {
    return bRank.weekNumber - aRank.weekNumber
  }

  if (aRank.month !== bRank.month) {
    return bRank.month - aRank.month
  }

  if (aRank.day !== bRank.day) {
    return bRank.day - aRank.day
  }

  return 0
}

function matchesArticlePattern(pathname: string, articlePattern: RegExp): boolean {
  const flags = articlePattern.flags.replace(/g|y/g, '')
  const safePattern = new RegExp(articlePattern.source, flags)
  return safePattern.test(pathname)
}

function extractMultipleArticleUrls(
  categoryHtml: string,
  articlePattern: RegExp,
  errorMessage: string,
  maxArticles = 1
): string[] {
  const $ = load(categoryHtml)
  const links = $('a[href]')
    .map((_i, el) => $(el).attr('href') ?? '')
    .get()

  const rankedCandidates: Array<{ url: string; pathname: string; index: number }> = []
  const seenPathnames = new Set<string>()

  links.forEach((href, index) => {
    const pathname = getPathnameFromHref(href)
    if (!pathname) {
      return
    }

    if (!matchesArticlePattern(pathname, articlePattern)) {
      return
    }

    if (seenPathnames.has(pathname)) {
      return
    }
    seenPathnames.add(pathname)

    rankedCandidates.push({
      url: toAbsoluteUrl(href),
      pathname,
      index,
    })
  })

  rankedCandidates.sort((a, b) => {
    const rankComparison = compareArticleCandidates(a.pathname, b.pathname)
    if (rankComparison !== 0) {
      return rankComparison
    }
    return a.index - b.index
  })

  if (rankedCandidates.length === 0) {
    throw new Error(errorMessage)
  }

  return rankedCandidates.slice(0, maxArticles).map((c) => c.url)
}

function extractLatestArticleUrl(
  categoryHtml: string,
  articlePattern: RegExp,
  errorMessage: string
): string {
  return extractMultipleArticleUrls(categoryHtml, articlePattern, errorMessage, 1)[0]
}

function parseRankingArticle(
  articleUrl: string,
  articleHtml: string,
  fallbackTitle: string,
  minExpectedRows = 90,
  tableHeadingPattern?: RegExp,
  maxRank = 100
): PitcherListLatestResponse {
  const $ = load(articleHtml)
  const rankByNumber = new Map<number, PitcherListRankRow>()
  const notesByRank = new Map<number, string>()
  const notesByName = new Map<string, string>()

  const tables = tableHeadingPattern
    ? $('table').filter((_i, table) => {
        const headingText = normalizeWhitespace(
          $(table).prevAll('h1, h2, h3, h4, p, strong').first().text()
        )
        return tableHeadingPattern.test(headingText)
      })
    : $('table')

  if (tableHeadingPattern && tables.length === 0) {
    throw new Error(`Unable to locate ranking table matching ${tableHeadingPattern}`)
  }

  tables.find('tr').each((_i, tr) => {
    const cells = $(tr)
      .find('td')
      .map((_j, td) => normalizeWhitespace($(td).text()))
      .get()

    if (cells.length < 2) return

    const rank = Number.parseInt(cells[0], 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > maxRank) return

    const playerName = cleanPlayerName(cells[1])
    if (!playerName) return

    const teamCell = cells[2] ?? ''
    const movementCell = cells[4] ?? cells[cells.length - 1] ?? '-'
    const movement = parseMovement(movementCell)

    if (!rankByNumber.has(rank)) {
      rankByNumber.set(rank, {
        latest_rank: rank,
        player_name: playerName,
        mlb_team: teamCell || null,
        movement_raw: movement.movement_raw,
        movement_value: movement.movement_value,
        trend_direction: movement.trend_direction,
        notes: null,
      })
    }
  })

  $('p').each((_i, p) => {
    const paragraph = $(p)
    const strongText = normalizeWhitespace(paragraph.find('strong').first().text())

    if (!/^\d+\./.test(strongText)) {
      return
    }

    const rankMatch = strongText.match(/^(\d+)\./)
    if (!rankMatch) {
      return
    }

    const rank = Number.parseInt(rankMatch[1], 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > maxRank) {
      return
    }

    const noteText = normalizeWhitespace(paragraph.clone().find('strong').remove().end().text())
    if (!noteText) {
      return
    }

    notesByRank.set(rank, noteText)

    const playerLinkText = normalizeWhitespace(paragraph.find('a.player-tag').first().text())
    const playerName = cleanPlayerName(playerLinkText)
    if (playerName) {
      notesByName.set(playerName.toLowerCase(), noteText)
    }
  })

  $('li').each((_i, li) => {
    const item = $(li)
    const playerLink = item.find('a.player-tag').first()
    const playerName = cleanPlayerName(normalizeWhitespace(playerLink.text()))
    if (!playerName) {
      return
    }

    const noteText = normalizeWhitespace(item.text())
    if (!noteText) {
      return
    }

    notesByName.set(playerName.toLowerCase(), noteText)
  })

  for (const row of rankByNumber.values()) {
    row.notes = notesByRank.get(row.latest_rank) ?? notesByName.get(row.player_name.toLowerCase()) ?? null
  }

  const rows = [...rankByNumber.values()].sort((a, b) => a.latest_rank - b.latest_rank)
  if (rows.length < minExpectedRows) {
    throw new Error(`Unexpected parse result: extracted ${rows.length} ranking rows`)
  }

  const title = normalizeWhitespace($('h1').first().text()) || fallbackTitle
  const publishedAt =
    $('meta[property="article:published_time"]').attr('content') ??
    $('time[datetime]').first().attr('datetime') ??
    null

  return {
    title,
    source_url: articleUrl,
    published_at: publishedAt,
    scraped_at: new Date().toISOString(),
    rows,
  }
}

function parsePitcherListArticle(articleUrl: string, articleHtml: string): PitcherListLatestResponse {
  return parseRankingArticle(articleUrl, articleHtml, 'Pitcher List Top 100')
}

function parseHitterListArticle(articleUrl: string, articleHtml: string): PitcherListLatestResponse {
  // The hitter board runs 150 deep with a Position column the pitcher tables
  // lack; columns are Rank | Hitter | Team | Position | Change, so the shared
  // parser's rank/team/movement cell offsets still line up.
  return parseRankingArticle(
    articleUrl,
    articleHtml,
    'Pitcher List Top 150 Hitters',
    120,
    undefined,
    HITTER_LIST_MAX_RANK
  )
}

function parseReliefListArticle(
  articleUrl: string,
  articleHtml: string,
  mode: ReliefScoringMode
): ReliefListLatestResponse {
  if (mode === 'saves') {
    return {
      ...parseRankingArticle(
      articleUrl,
      articleHtml,
      'Pitcher List Reliever Rankings',
      40,
      /top\s*50\s*closers\s*for\s*fantasy\s*baseball/i
      ),
      scoring_mode: 'saves',
    }
  }
  return {
    ...parseRankingArticle(
      articleUrl,
      articleHtml,
      'Pitcher List Reliever Rankings',
      90,
      /top\s*100\s*relievers\s*for\s*sv\+hld\s*leagues/i
    ),
    scoring_mode: 'svhld',
  }
}

function parseInjuredPitchersFromArticle(
  articleHtml: string,
  sourceList: PitcherSourceList
): InjuredPitcherRow[] {
  const $ = load(articleHtml)
  const headingPattern = /injured pitchers who will be considered when healthy/i

  const tables = $('table').filter((_i, table) => {
    // Strategy 1: direct previous sibling heading (h1–h4, p, strong)
    const siblingHeadingText = normalizeWhitespace(
      $(table).prevAll('h1, h2, h3, h4, p, strong').first().text()
    )
    if (headingPattern.test(siblingHeadingText)) return true

    // Strategy 2: div.table-branding .title inside the outer div.table wrapper
    // Article structure: div.table > [div.table-branding > div.title] + [div.dt-container > ... > table]
    const wrapperTitle = normalizeWhitespace(
      $(table).closest('div.table').find('.table-branding .title').first().text()
    )
    if (headingPattern.test(wrapperTitle)) return true

    return false
  })

  const targetTable = tables.first()
  if (!targetTable.length) {
    // Log all table headings to help diagnose when the section heading pattern
    // doesn't match the article's actual HTML structure.
    const allHeadings: string[] = []
    $('table').each((_i, table) => {
      const siblingText = normalizeWhitespace(
        $(table).prevAll('h1, h2, h3, h4, p, strong').first().text()
      )
      const wrapperText = normalizeWhitespace(
        $(table).closest('div.table').find('.table-branding .title').first().text()
      )
      const heading = siblingText || wrapperText
      if (heading) allHeadings.push(heading)
    })
    console.warn(
      `[injured] No table found for "${headingPattern}" in ${sourceList} article. ` +
        `Nearby headings: ${allHeadings.slice(0, 6).join(' | ') || '(none)'}`
    )
    return []
  }

  const rows: InjuredPitcherRow[] = []
  const allRows = targetTable.find('tr')

  const headerCells = allRows
    .first()
    .find('th, td')
    .map((_i, cell) => normalizeWhitespace($(cell).text()).toLowerCase())
    .get()

  const findHeaderIndex = (matcher: RegExp): number =>
    headerCells.findIndex((header) => matcher.test(header))

  const rankIndex = findHeaderIndex(/rank/)
  const playerIndex = findHeaderIndex(/player|pitcher|name/)
  const teamIndex = findHeaderIndex(/team/)
  const noteIndex = findHeaderIndex(/injur|note|status/)

  allRows.slice(1).each((_i, tr) => {
    const cells = $(tr)
      .find('td')
      .map((_j, td) => normalizeWhitespace($(td).text()))
      .get()

    if (cells.length === 0) {
      return
    }

    const playerCell = cells[playerIndex >= 0 ? playerIndex : 1] ?? cells[0] ?? ''
    const playerName = cleanPlayerName(playerCell)
    if (!playerName) {
      return
    }

    const rankCell = cells[rankIndex >= 0 ? rankIndex : 0] ?? ''
    const rankMatch = rankCell.match(/\d+/)
    const rankValue = rankMatch ? Number.parseInt(rankMatch[0], 10) : Number.NaN

    const teamCell = teamIndex >= 0 ? (cells[teamIndex] ?? '') : ''
    const noteCell = cells[noteIndex >= 0 ? noteIndex : cells.length - 1] ?? ''

    rows.push({
      rank_when_healthy: Number.isFinite(rankValue) ? rankValue : null,
      player_name: playerName,
      mlb_team: teamCell || null,
      injury_note: noteCell || null,
      source_list: sourceList,
    })
  })

  return rows
}

async function fetchLatestInjuredPitchers(): Promise<InjuredPitchersLatestResponse> {
  const pitcherCategoryHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL)
  const pitcherArticleUrl = extractLatestArticleUrl(
    pitcherCategoryHtml,
    /\/top-100-starting-pitchers-for-[^/]+\/?$/i,
    'Unable to find latest starting pitcher rankings article URL'
  )
  const pitcherArticleHtml = await fetchHtml(pitcherArticleUrl)

  const reliefCategoryHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
  const reliefArticleUrl = extractLatestArticleUrl(
    reliefCategoryHtml,
    /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
    'Unable to find latest reliever rankings article URL'
  )
  const reliefArticleHtml = await fetchHtml(reliefArticleUrl)

  const combinedRows = [
    ...parseInjuredPitchersFromArticle(pitcherArticleHtml, 'SP'),
    ...parseInjuredPitchersFromArticle(reliefArticleHtml, 'RP'),
  ]

  const deduped = new Map<string, InjuredPitcherRow>()
  for (const row of combinedRows) {
    const key = `${cleanPlayerName(row.player_name).toLowerCase()}::${row.source_list}`
    if (!deduped.has(key)) {
      deduped.set(key, row)
    }
  }

  return {
    title: 'Pitcher List Injured Pitchers Who Will Be Considered When Healthy',
    source_urls: {
      sp: pitcherArticleUrl,
      rp: reliefArticleUrl,
    },
    scraped_at: new Date().toISOString(),
    rows: [...deduped.values()].sort((a, b) => {
      if (a.source_list !== b.source_list) {
        return a.source_list.localeCompare(b.source_list)
      }
      const aRank = a.rank_when_healthy ?? Number.MAX_SAFE_INTEGER
      const bRank = b.rank_when_healthy ?? Number.MAX_SAFE_INTEGER
      if (aRank !== bRank) {
        return aRank - bRank
      }
      return a.player_name.localeCompare(b.player_name)
    }),
  }
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; yahoo-fantasy-eval-app/1.0)',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`)
  }
  const buffer = await response.arrayBuffer()
  return new TextDecoder('utf-8').decode(buffer)
}

async function fetchHtmlWithRetry(url: string): Promise<string> {
  const headerSets: Array<Record<string, string>> = [
    {
      'user-agent': 'Mozilla/5.0 (compatible; yahoo-fantasy-eval-app/1.0)',
    },
    {
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      referer: 'https://www.google.com/',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    },
  ]

  let lastError: Error | null = null

  for (const headers of headerSets) {
    try {
      const response = await fetch(url, { headers })
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url} (${response.status})`)
      }
      const buffer = await response.arrayBuffer()
      return new TextDecoder('utf-8').decode(buffer)
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`)
}

function normalizeSnapshotRefreshTarget(value: string | undefined): SnapshotRefreshTarget {
  const normalized = value?.trim().toLowerCase()
  if (
    normalized === 'pitcher' ||
    normalized === 'hitter' ||
    normalized === 'relief' ||
    normalized === 'cbs' ||
    normalized === 'all'
  ) {
    return normalized
  }
  return 'all'
}

function buildProductionSnapshotUrl(relativePath: string): string {
  return new URL(relativePath, `${PRODUCTION_API_BASE_URL.replace(/\/?$/, '/')}`).toString()
}

function normalizeSnapshotDate(value: string | null | undefined): string | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString().slice(0, 10)
}

function resolveSnapshotDate(publishedAt: string | null, scrapedAt: string): string {
  return (
    normalizeSnapshotDate(publishedAt) ??
    normalizeSnapshotDate(scrapedAt) ??
    new Date().toISOString().slice(0, 10)
  )
}

function upsertHistorySnapshots<T extends { snapshot_date: string }>(
  existing: T[] | undefined,
  current: T,
  maxSnapshots = MAX_HISTORY_SNAPSHOTS
): T[] {
  const byDate = new Map<string, T>()
  byDate.set(current.snapshot_date, current)

  for (const snapshot of existing ?? []) {
    if (!byDate.has(snapshot.snapshot_date)) {
      byDate.set(snapshot.snapshot_date, snapshot)
    }
  }

  return [...byDate.values()]
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
    .slice(0, maxSnapshots)
}

function toPitcherHistorySnapshot(payload: PitcherListLatestResponse): PitcherListHistorySnapshot {
  return {
    ...payload,
    snapshot_date: resolveSnapshotDate(payload.published_at, payload.scraped_at),
  }
}

function toReliefHistorySnapshot(payload: ReliefListLatestResponse): ReliefListHistorySnapshot {
  return {
    ...payload,
    snapshot_date: resolveSnapshotDate(payload.published_at, payload.scraped_at),
  }
}

async function fetchJsonSnapshot<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; yahoo-fantasy-eval-app/1.0)',
      accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch snapshot ${url} (${response.status})`)
  }
  return (await response.json()) as T
}

function normalizePositionToken(token: string): string {
  const normalized = normalizeWhitespace(token).toUpperCase()
  if (!normalized) return normalized
  if (normalized === 'INF') return 'INF'
  if (normalized === 'OF') return 'OF'
  if (normalized === 'C') return 'C'
  if (normalized === 'P') return 'P'
  return normalized
}

function splitPositions(raw: string): string[] {
  return raw
    .split(/[/,]/)
    .map((part) => normalizePositionToken(part))
    .filter(Boolean)
}

function stripHtml(value: string): string {
  return normalizeWhitespace(value.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' '))
}

function decodeBatThrowCode(value: unknown): string | null {
  return normalizeBatThrowValue(value)
}

function extractOverallGradeFromReport(report: string | null): string | null {
  if (!report) return null
  const match = report.match(/overall\s*:\s*(\d+)/i)
  if (!match) return null
  return normalizeWhitespace(match[1])
}

function resolveMlbOrgName(
  payload: Record<string, unknown>,
  person: Record<string, unknown> | null
): string | null {
  if (!person) return null

  const drafts = person.drafts
  if (Array.isArray(drafts) && drafts.length > 0) {
    const firstDraft = drafts[0] as { team?: { __ref?: string } }
    const draftTeamRef = firstDraft?.team?.__ref
    if (draftTeamRef && typeof draftTeamRef === 'string') {
      const draftTeam = payload[draftTeamRef] as { id?: number } | undefined
      const teamId = draftTeam?.id
      if (teamId != null) {
        const team = payload[`Team:${teamId}`] as { name?: string; abbreviation?: string } | undefined
        const teamName = normalizeWhitespace(String(team?.name ?? ''))
        if (teamName) return teamName
        const teamAbbrev = normalizeWhitespace(String(team?.abbreviation ?? ''))
        if (teamAbbrev) return teamAbbrev
      }
    }
  }

  return null
}

function parseMlbProspectsFromInitState(html: string): ProspectSourceRow[] {
  const $ = load(html)
  const initState = $('span[data-init-state]').first().attr('data-init-state')
  if (!initState) {
    return []
  }

  const parsed = JSON.parse(initState) as {
    payload?: Record<string, unknown>
  }

  const payload = parsed.payload
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const root = payload.ROOT_QUERY as Record<string, unknown> | undefined
  if (!root || typeof root !== 'object') {
    return []
  }

  const rankingKey = Object.keys(root).find((key) =>
    key.startsWith('getPlayerRankingsFromSelection(')
  )

  if (!rankingKey) {
    return []
  }

  const rankingRows = root[rankingKey]
  if (!Array.isArray(rankingRows)) {
    return []
  }

  const rows: ProspectSourceRow[] = []

  for (const rankingRow of rankingRows) {
    if (!rankingRow || typeof rankingRow !== 'object') {
      continue
    }

    const typedRankingRow = rankingRow as {
      rank?: number | string
      playerEntity?: {
        position?: string
        eta?: string
        prospectBio?: Array<{ contentText?: string; contentTitle?: string }>
        player?: { __ref?: string }
      }
    }

    const rank = Number.parseInt(String(typedRankingRow.rank ?? ''), 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > 300) {
      continue
    }

    const playerRef = typedRankingRow.playerEntity?.player?.__ref
    const person =
      playerRef && typeof playerRef === 'string'
        ? (payload[playerRef] as Record<string, unknown> | undefined)
        : undefined

    const playerName = repairMojibake(normalizeWhitespace(
      String(
        person?.fullName ??
          [person?.useName, person?.useLastName]
            .map((part) => normalizeWhitespace(String(part ?? '')))
            .filter(Boolean)
            .join(' ') ??
          ''
      )
    ))

    if (!playerName) {
      continue
    }

    const positionText = normalizeWhitespace(
      String(
        typedRankingRow.playerEntity?.position ??
          (person?.primaryPosition as { abbreviation?: string } | undefined)?.abbreviation ??
          ''
      )
    )

    const bioRows = typedRankingRow.playerEntity?.prospectBio ?? []
    const latestBio = bioRows[bioRows.length - 1]
    const scoutingReportRaw = latestBio?.contentText ? stripHtml(latestBio.contentText) : null
    const scoutingReport = normalizeScoutingText(scoutingReportRaw, 2200)
    const levelFromReport = extractLevelFromText(scoutingReport)
    const statsSummary = extractScoutingGradesSummary(scoutingReport)

    rows.push({
      source: 'mlb',
      rank,
      player_name: playerName,
      org: resolveMlbOrgName(payload, person ?? null),
      positions: splitPositions(positionText),
      age:
        typeof person?.currentAge === 'number' && Number.isFinite(person.currentAge)
          ? person.currentAge
          : null,
      eta: normalizeEtaValue(typedRankingRow.playerEntity?.eta),
      level: levelFromReport,
      height: normalizeHeightValue(person?.height),
      weight: normalizeWeightValue(person?.weight),
      bats: decodeBatThrowCode(person?.batSideCode),
      throws: decodeBatThrowCode(person?.pitchHandCode),
      fv: extractOverallGradeFromReport(scoutingReport),
      ofp: null,
      stats_summary: statsSummary,
      scouting_report: scoutingReport,
      notes: scoutingReport,
    })
  }

  const dedupedByRank = new Map<number, ProspectSourceRow>()
  for (const row of rows) {
    if (!dedupedByRank.has(row.rank)) {
      dedupedByRank.set(row.rank, row)
    }
  }

  return [...dedupedByRank.values()].sort((a, b) => a.rank - b.rank)
}

function parseMlbProspectsPage(html: string): ProspectSourceRow[] {
  const initStateRows = parseMlbProspectsFromInitState(html)
  if (initStateRows.length >= 50) {
    return initStateRows
  }

  const $ = load(html)
  const rows: ProspectSourceRow[] = []

  $('tr').each((_i, tr) => {
    const cells = $(tr).find('td')
    if (cells.length < 3) {
      return
    }

    const rankText = normalizeWhitespace($(cells[0]).text())
    const rank = Number.parseInt(rankText, 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > 300) {
      return
    }

    const nameCell = $(cells[1])
    const playerName = repairMojibake(
      normalizeWhitespace(nameCell.find('a').first().text()) ||
      normalizeWhitespace(nameCell.text())
    )
    if (!playerName) {
      return
    }

    const positionText = normalizeWhitespace($(cells[2]).text())
    const orgText = repairMojibake(normalizeWhitespace($(cells[3]).text())).replace(/\s+Logo$/i, '') || null

    rows.push({
      source: 'mlb',
      rank,
      player_name: playerName,
      org: orgText,
      positions: splitPositions(positionText),
      age: null,
      eta: null,
      level: null,
      height: null,
      weight: null,
      bats: null,
      throws: null,
      fv: null,
      ofp: null,
      stats_summary: null,
      scouting_report: null,
      notes: null,
    })
  })

  return rows
}

function parseProspectsLivePage(html: string): ProspectSourceRow[] {
  const $ = load(html)
  const rows: ProspectSourceRow[] = []

  $('h3').each((_i, h3) => {
    const headingText = normalizeWhitespace($(h3).text())
    const match = headingText.match(/^(\d+)\.\s*(.+?),\s*([^-]+?)\s*-\s*(\d+)\s*OFP$/i)
    if (!match) {
      return
    }

    const rank = Number.parseInt(match[1], 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > 300) {
      return
    }

    const playerName = repairMojibake(normalizeWhitespace(match[2]))
    const positions = splitPositions(match[3])
    const ofp = normalizeWhitespace(match[4])

    const contextNodes = $(h3).nextUntil('h3')
    const reportParagraph = normalizeWhitespace(
      contextNodes
        .filter('p')
        .map((_idx, p) => normalizeWhitespace($(p).text()))
        .get()
        .find((text) => text.length > 40) ?? ''
    )

    const reportText = normalizeScoutingText(reportParagraph, 1200)
    const statsSummary = reportText
      ? reportText.split('. ').slice(0, 2).join('. ').slice(0, 260)
      : null

    rows.push({
      source: 'prospects_live',
      rank,
      player_name: playerName,
      org: null,
      positions,
      age: null,
      eta: null,
      level: extractLevelFromText(reportText),
      height: null,
      weight: null,
      bats: null,
      throws: null,
      fv: null,
      ofp,
      stats_summary: statsSummary,
      scouting_report: reportText,
      notes: reportText,
    })
  })

  return rows
}

function parseSimpleProspectTableRows(
  html: string,
  source: ProspectSourceName,
  headerMatcher: RegExp,
  rowMapper: (cells: string[]) => ProspectSourceRow | null
): ProspectSourceRow[] {
  const $ = load(html)
  const tables = $('table')
  const allRows: ProspectSourceRow[] = []

  for (const table of tables.toArray()) {
    const headerText = normalizeWhitespace(
      $(table)
        .find('tr')
        .first()
        .find('th, td')
        .map((_i, cell) => normalizeWhitespace($(cell).text()))
        .get()
        .join(' ')
    )
    if (!headerMatcher.test(headerText)) {
      continue
    }

    const rows: ProspectSourceRow[] = []
    $(table)
      .find('tr')
      .slice(1)
      .each((_i, tr) => {
        const cells = $(tr)
          .find('td')
          .map((_j, td) => normalizeWhitespace($(td).text()))
          .get()
        if (cells.length === 0) return

        const row = rowMapper(cells)
        if (row && row.source === source) {
          rows.push(row)
        }
      })

    allRows.push(...rows)
  }

  if (allRows.length === 0) {
    return []
  }

  const deduped = new Map<string, ProspectSourceRow>()
  for (const row of allRows) {
    const key = `${row.rank}:${cleanPlayerName(row.player_name).toLowerCase()}`
    if (!deduped.has(key)) {
      deduped.set(key, row)
    }
  }

  return [...deduped.values()].sort((a, b) => a.rank - b.rank)
}

function parseFantraxProspectsPage(html: string): ProspectSourceRow[] {
  return parseSimpleProspectTableRows(
    html,
    'fantrax',
    /rank\s+change\s+player\s+position\s+team\s+age\s+level\s+eta/i,
    (cells) => {
      const rank = Number.parseInt(cells[0] ?? '', 10)
      if (!Number.isFinite(rank) || rank < 1 || rank > 500) return null

      const playerName = repairMojibake(normalizeWhitespace(cells[2] ?? ''))
      if (!playerName) return null

      return {
        source: 'fantrax',
        rank,
        player_name: playerName,
        org: repairMojibake(normalizeWhitespace(cells[4] ?? '')).toUpperCase() || null,
        positions: splitPositions(cells[3] ?? ''),
        age: Number.isFinite(Number.parseFloat(cells[5] ?? '')) ? Math.round(Number.parseFloat(cells[5] ?? '') * 10) / 10 : null,
        eta: normalizeEtaValue(cells[7]),
        level: normalizeLevelValue(cells[6]),
        height: null,
        weight: null,
        bats: null,
        throws: null,
        fv: null,
        ofp: null,
        stats_summary: null,
        scouting_report: null,
        notes: null,
      }
    }
  )
}

export function parsePitcherListProspectsPage(html: string): ProspectSourceRow[] {
  return parseSimpleProspectTableRows(
    html,
    'pitcherlist',
    // Pitcher List's table header reads "Previous Rank" (issue #30); tolerate the
    // older "Previous Ranking" wording too so a future copy tweak doesn't silently break it.
    /rank\s+player\s+team\s+position\s+age\s+previous rank(?:ing)?\s+\+\/-/i,
    (cells) => {
      const rank = Number.parseInt(cells[0] ?? '', 10)
      if (!Number.isFinite(rank) || rank < 1 || rank > 200) return null

      const playerName = repairMojibake(normalizeWhitespace(cells[1] ?? ''))
      if (!playerName) return null

      return {
        source: 'pitcherlist',
        rank,
        player_name: playerName,
        org: repairMojibake(normalizeWhitespace(cells[2] ?? '')).toUpperCase() || null,
        positions: splitPositions(cells[3] ?? ''),
        age: Number.isFinite(Number.parseFloat(cells[4] ?? '')) ? Math.round(Number.parseFloat(cells[4] ?? '') * 10) / 10 : null,
        eta: null,
        level: null,
        height: null,
        weight: null,
        bats: null,
        throws: null,
        fv: null,
        ofp: null,
        stats_summary: null,
        scouting_report: null,
        notes: normalizeWhitespace(cells.slice(5).join(' ')) || null,
      }
    }
  )
}

function parseTjStatsRankingsApi(payload: unknown): ProspectSourceRow[] {
  if (!Array.isArray(payload)) {
    return []
  }

  const rows: ProspectSourceRow[] = []
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>

    const rank = Number.parseInt(String(row.rank_value ?? ''), 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > 1000) continue

    const playerName = repairMojibake(normalizeWhitespace(String(row.name ?? '')))
    if (!playerName) continue

    rows.push({
      source: 'tjstats',
      rank,
      player_name: playerName,
      org: repairMojibake(normalizeWhitespace(String(row.abbreviation ?? row.team ?? row.franchise ?? ''))).toUpperCase() || null,
      positions: splitPositions(String(row.position ?? '')),
      age: Number.isFinite(Number.parseFloat(String(row.age ?? '')))
        ? Math.round(Number.parseFloat(String(row.age ?? '')) * 10) / 10
        : null,
      eta: null,
      level: null,
      height: normalizeHeightValue(String(row.height ?? '')),
      weight: normalizeWeightValue(String(row.weight ?? '')),
      bats: normalizeBatThrowValue(row.bat_side ?? null),
      throws: normalizeBatThrowValue(row.throw_side ?? null),
      fv: null,
      ofp: null,
      stats_summary: null,
      scouting_report: normalizeScoutingText(row.report ?? null, 2200),
      notes: null,
    })
  }

  return rows
}

function parseFangraphsBoardPage(html: string): ProspectSourceRow[] {
  const $ = load(html)
  const nextData = $('#__NEXT_DATA__').text()
  if (!nextData) {
    throw new Error('Fangraphs page did not contain __NEXT_DATA__ payload')
  }

  const parsed = JSON.parse(nextData) as {
    props?: {
      pageProps?: {
        dehydratedState?: {
          queries?: Array<{
            queryKey?: unknown[]
            state?: {
              data?: Array<Record<string, unknown>>
            }
          }>
        }
      }
    }
  }

  const prospectQuery =
    parsed.props?.pageProps?.dehydratedState?.queries?.find((query) => {
      const queryKey = query.queryKey
      if (!Array.isArray(queryKey) || queryKey.length === 0) {
        return false
      }
      return String(queryKey[0]).includes('prospects/the-board')
    }) ?? null

  const dataRows = prospectQuery?.state?.data
  if (!Array.isArray(dataRows)) {
    throw new Error('Fangraphs payload missing prospect data rows')
  }

  const rows: ProspectSourceRow[] = []

  for (const row of dataRows) {
    const rank = Number.parseInt(String(row.cOVR ?? row.Ovr_Rank ?? ''), 10)
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) {
      continue
    }

    const playerName = repairMojibake(
      normalizeWhitespace(String(row.playerName ?? row.player_name ?? ''))
    )
    if (!playerName) {
      continue
    }

    const age = Number.parseFloat(String(row.Age ?? row.age ?? ''))
    const positions = splitPositions(normalizeWhitespace(String(row.Position ?? row.position ?? '')))
    const org = repairMojibake(normalizeWhitespace(String(row.Team ?? row.org ?? ''))).toUpperCase() || null
    const level = normalizeLevelValue(row.llevel ?? row.mlevel ?? row.level)
    const eta = normalizeEtaValue(row.cETA ?? row.ETA_Current ?? row.eta)
    const fv = normalizeWhitespace(String(row.cFV ?? row.FV_Current ?? row.fv ?? '')) || null
    const bats = normalizeBatThrowValue(row.Bats ?? row.bats)
    const throws = normalizeBatThrowValue(row.Throws ?? row.throws)
    const height = normalizeHeightValue(row.cHeight ?? row.Height ?? row.height)
    const weight = normalizeWeightValue(row.cWeight ?? row.Weight ?? row.weight)
    const summary = normalizeScoutingText(row.Summary ?? row.Ovr_Summary ?? '', 700)
    const notes = normalizeScoutingText(row.TLDR ?? row.Notes ?? '', 320)

    rows.push({
      source: 'fangraphs',
      rank,
      player_name: playerName,
      org,
      positions,
      age: Number.isFinite(age) ? Math.round(age * 10) / 10 : null,
      eta,
      level,
      height,
      weight,
      bats,
      throws,
      fv,
      ofp: null,
      stats_summary: summary,
      scouting_report: summary,
      notes,
    })
  }

  const deduped = new Map<string, ProspectSourceRow>()
  for (const row of rows) {
    const key = `${row.rank}:${cleanPlayerName(row.player_name).toLowerCase()}`
    if (!deduped.has(key)) {
      deduped.set(key, row)
    }
  }

  return [...deduped.values()].sort((a, b) => a.rank - b.rank)
}

function parseFanGraphsUpdatedAt(html: string): string | null {
  const $ = load(html)
  const bodyText = normalizeWhitespace($('body').text())
  const match = bodyText.match(
    /Updated:\s*(?:[A-Za-z]+,\s*)?[A-Za-z]+\s+\d{1,2},\s+\d{4}\s+\d{1,2}:\d{2}\s+[AP]M\s+ET/i
  )
  if (!match) return extractGenericPublishedAt(html)

  return parseEasternUpdatedTimestamp(match[0]) ?? extractGenericPublishedAt(html)
}

async function collectProspectSource(
  source: ProspectSourceName,
  sourceUrl: string
): Promise<{ status: ProspectSourceStatus; rows: ProspectSourceRow[] }> {
  const scrapedAt = new Date().toISOString()
  let rows: ProspectSourceRow[] = []
  let html = ''
  let effectiveHtml = ''

  try {
    html =
      source === 'fangraphs'
        ? await fetchHtmlWithRetry(sourceUrl)
        : await fetchHtml(sourceUrl)

    effectiveHtml = html
    if (source === 'pitcherlist') {
      const $ = load(html)
      const candidateHref =
        $('a')
          .filter((_i, link) => /top\s*150\s*dynasty\s*prospects/i.test(normalizeWhitespace($(link).text())))
          .first()
          .attr('href') ?? null

      if (candidateHref) {
        const articleUrl = new URL(candidateHref, sourceUrl).toString()
        try {
          effectiveHtml = await fetchHtml(articleUrl)
        } catch {
          effectiveHtml = html
        }
      }
    }

    if (source === 'mlb') {
      rows = parseMlbProspectsPage(effectiveHtml)
    } else if (source === 'prospects_live') {
      rows = parseProspectsLivePage(effectiveHtml)
    } else if (source === 'fantrax') {
      rows = parseFantraxProspectsPage(effectiveHtml)
    } else if (source === 'pitcherlist') {
      rows = parsePitcherListProspectsPage(effectiveHtml)
    } else if (source === 'tjstats') {
      const tjstatsResponse = await fetch(TJSTATS_PROSPECTS_API_URL, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; YahooFantasyEval/1.0)',
          accept: 'application/json',
        },
      })
      if (!tjstatsResponse.ok) {
        throw new Error(`TJStats rankings API returned ${tjstatsResponse.status}`)
      }
      rows = parseTjStatsRankingsApi(await tjstatsResponse.json())
    } else {
      rows = parseFangraphsBoardPage(effectiveHtml)
    }

    if (rows.length === 0) {
      throw new Error('No prospect rows parsed')
    }

    return {
      status: {
        source,
        title:
          source === 'mlb'
            ? 'MLB Pipeline Top 100 Prospects'
            : source === 'fangraphs'
              ? 'FanGraphs The Board'
              : source === 'prospects_live'
                ? 'Prospects Live Top 100'
                : source === 'fantrax'
                  ? 'FantraxHQ Top 400 Fantasy Baseball Prospects'
                  : source === 'pitcherlist'
                    ? 'Pitcher List Top 150 Dynasty Prospects'
                    : 'TJStats Top 100 MLB Prospects',
        source_url: sourceUrl,
        published_at:
          source === 'fangraphs'
            ? parseFanGraphsUpdatedAt(effectiveHtml)
            : source === 'fantrax'
              ? extractJsonLdDates(effectiveHtml).dateModified ?? extractJsonLdDates(effectiveHtml).datePublished
              : source === 'pitcherlist' || source === 'prospects_live'
                ? extractGenericPublishedAt(effectiveHtml)
                : source === 'tjstats'
                  ? extractJsonLdDates(effectiveHtml).dateModified ?? extractGenericPublishedAt(effectiveHtml)
                  : extractGenericPublishedAt(effectiveHtml),
        scraped_at: scrapedAt,
        status: 'ok',
        row_count: rows.length,
        error: null,
      },
      rows,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    return {
      status: {
        source,
        title:
          source === 'mlb'
            ? 'MLB Pipeline Top 100 Prospects'
            : source === 'fangraphs'
              ? 'FanGraphs The Board'
              : source === 'prospects_live'
                ? 'Prospects Live Top 100'
                : source === 'fantrax'
                  ? 'FantraxHQ Top 400 Fantasy Baseball Prospects'
                  : source === 'pitcherlist'
                    ? 'Pitcher List Top 150 Dynasty Prospects'
                    : 'TJStats Top 100 MLB Prospects',
        source_url: sourceUrl,
        published_at:
          source === 'fangraphs'
            ? parseFanGraphsUpdatedAt(effectiveHtml)
            : source === 'fantrax'
              ? extractJsonLdDates(effectiveHtml).dateModified ?? extractJsonLdDates(effectiveHtml).datePublished
              : source === 'pitcherlist' || source === 'prospects_live'
                ? extractGenericPublishedAt(effectiveHtml)
                : source === 'tjstats'
                  ? extractJsonLdDates(effectiveHtml).dateModified ?? extractGenericPublishedAt(effectiveHtml)
                  : extractGenericPublishedAt(effectiveHtml),
        scraped_at: scrapedAt,
        status: 'error',
        row_count: 0,
        error: message,
      },
      rows: [],
    }
  }
}

async function fetchLatestProspects(): Promise<ProspectsLatestResponse> {
  const [mlb, fangraphs, prospectsLive, fantrax, pitcherlist, tjstats] = await Promise.all([
    collectProspectSource('mlb', MLB_PROSPECTS_URL),
    collectProspectSource('fangraphs', FANGRAPHS_PROSPECTS_URL),
    collectProspectSource('prospects_live', PROSPECTS_LIVE_URL),
    collectProspectSource('fantrax', FANTRAX_PROSPECTS_URL),
    collectProspectSource('pitcherlist', PITCHERLIST_PROSPECTS_URL),
    collectProspectSource('tjstats', TJSTATS_PROSPECTS_URL),
  ])

  const allRows = [
    ...mlb.rows,
    ...fangraphs.rows,
    ...prospectsLive.rows,
    ...fantrax.rows,
    ...pitcherlist.rows,
    ...tjstats.rows,
  ]
  const sources = [mlb.status, fangraphs.status, prospectsLive.status, fantrax.status, pitcherlist.status, tjstats.status]

  // Guard (issue #30): a single source that errors or returns zero rows is otherwise dropped
  // silently — the consensus still builds from the rest and the snapshot looks healthy. Surface
  // it loudly so a parse break or stale feed is visible instead of vanishing.
  const droppedSources = sources.filter((source) => source.status === 'error' || source.row_count === 0)
  for (const source of droppedSources) {
    console.warn(
      `[prospects] source "${source.source}" contributed 0 rows to the consensus` +
        (source.error ? `: ${source.error}` : ' (no error reported)')
    )
  }

  if (allRows.length === 0) {
    const errors = sources
      .filter((source) => source.error)
      .map((source) => `${source.source}: ${source.error}`)
      .join('; ')
    throw new Error(`No prospects were parsed from any source. ${errors}`)
  }

  return {
    title: 'Prospect Rankings Multi-Source Snapshot',
    scraped_at: new Date().toISOString(),
    sources,
    rows: allRows,
  }
}

// ---------------------------------------------------------------------------
// CBS Streamer feeds (issues #19 & #20)
//
// CBS Sports publishes a weekly "Top N sleeper hitters/pitchers" column. Each
// player renders as a PlayerObjectV4 widget carrying name, position, MLB team,
// and a Matchup(s) cell ("@DET3, @BOS4" for hitters; "at SD" / "vs. ARI, vs.
// MIA" for pitchers). We parse those, then enrich each matchup with the actual
// game date from the MLB Stats API schedule for the streaming week so the view
// can answer "who do I stream, against whom, on which day".
// ---------------------------------------------------------------------------

// The /fantasy/baseball/ landing page links the current week's sleeper columns;
// the bare /news/ index 404s, so discover the latest article from the landing.
const CBS_FANTASY_NEWS_URL = 'https://www.cbssports.com/fantasy/baseball/'
const CBS_BASE_URL = 'https://www.cbssports.com'
const CBS_STREAMER_HITTERS_SLUG = /top-\d+-sleeper-hitters?/i
const CBS_STREAMER_PITCHERS_SLUG = /top-\d+-sleeper-pitchers?/i
const MLB_STATS_TEAMS_URL = 'https://statsapi.mlb.com/api/v1/teams?sportId=1'
const MLB_STATS_SCHEDULE_URL = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1'

type StreamerKind = 'hitters' | 'pitchers'

interface StreamerMatchup {
  // Calendar date of the game ('YYYY-MM-DD'), or null when the schedule lookup
  // could not place it (e.g. probable-pitcher start not yet on the schedule).
  date: string | null
  opponent: string
  home: boolean
}

interface CbsStreamerRow {
  player_name: string
  mlb_team: string | null
  positions: string[]
  matchups: StreamerMatchup[]
  games: number
  two_start: boolean
  blurb: string | null
}

interface CbsStreamerLatestResponse {
  kind: StreamerKind
  title: string
  source_url: string
  published_at: string | null
  scraped_at: string
  week_label: string | null
  week_start: string | null
  week_end: string | null
  rows: CbsStreamerRow[]
}

// CBS / MLB-API abbreviation reconciliation. We canonicalise to MLB Stats API
// abbreviations so a CBS opponent token matches a schedule entry. Unknown codes
// pass through unchanged (a missed match only costs a date, never the row).
const TEAM_ABBR_ALIAS: Record<string, string> = {
  WAS: 'WSH', WSN: 'WSH', ARI: 'AZ', CHW: 'CWS', SDP: 'SD', SFG: 'SF',
  TBR: 'TB', KCR: 'KC', NYY: 'NYY', NYM: 'NYM', OAK: 'ATH', ATH: 'ATH',
}

function canonicalTeamAbbr(abbr: string): string {
  const up = normalizeWhitespace(abbr).toUpperCase().replace(/[^A-Z]/g, '')
  if (!up) return ''
  return TEAM_ABBR_ALIAS[up] ?? up
}

// Parse a CBS matchup cell into opponent tokens. Hitters: "@DET3, @BOS4" where
// the leading @ marks an away series and the trailing number is the game count.
// Pitchers: "at SD" / "vs. ARI" — one start per token, "at" marks an away start.
function parseStreamerMatchupTokens(
  text: string,
  kind: StreamerKind
): Array<{ opponent: string; home: boolean; games: number }> {
  const cleaned = normalizeWhitespace(text)
  if (!cleaned) return []

  return cleaned
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .map((token) => {
      if (kind === 'pitchers') {
        const away = /^at\b/i.test(token)
        const opponent = canonicalTeamAbbr(token.replace(/^(at|vs\.?)\b/i, ''))
        if (!opponent) return null
        return { opponent, home: !away, games: 1 }
      }
      const match = token.match(/^(@)?\s*([A-Za-z]{2,4})\s*(\d+)?$/)
      if (!match) return null
      const opponent = canonicalTeamAbbr(match[2])
      if (!opponent) return null
      return {
        opponent,
        home: !match[1],
        games: match[3] ? Number.parseInt(match[3], 10) : 1,
      }
    })
    .filter((entry): entry is { opponent: string; home: boolean; games: number } => entry != null)
}

function extractJsonLdDatePublished($: ReturnType<typeof load>): string | null {
  let published: string | null = null
  $('script[type="application/ld+json"]').each((_i, el) => {
    if (published) return
    const raw = $(el).contents().text()
    if (!raw) return
    try {
      const parsed = JSON.parse(raw)
      const nodes = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.['@graph'])
          ? parsed['@graph']
          : [parsed]
      for (const node of nodes) {
        if (node && typeof node.datePublished === 'string') {
          published = node.datePublished
          return
        }
      }
    } catch {
      // Non-JSON ld+json block — ignore.
    }
  })
  return published
}

function extractWeekLabel(title: string): string | null {
  const match = title.match(/week\s+(\d+)/i)
  return match ? `Week ${match[1]}` : null
}

// The fantasy streaming week is the Monday–Sunday window of the ISO week that
// contains the article's publish date (CBS posts the preview on the Monday).
export function deriveStreamerWeek(
  publishedAt: string | null
): { weekStart: string; weekEnd: string } | null {
  if (!publishedAt) return null
  const published = new Date(publishedAt)
  if (Number.isNaN(published.getTime())) return null

  const day = published.getUTCDay() // 0 = Sunday … 6 = Saturday
  const offsetToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(
    Date.UTC(published.getUTCFullYear(), published.getUTCMonth(), published.getUTCDate() + offsetToMonday)
  )
  const sunday = new Date(
    Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6)
  )
  const toIsoDate = (value: Date) => value.toISOString().slice(0, 10)
  return { weekStart: toIsoDate(monday), weekEnd: toIsoDate(sunday) }
}

export function parseCbsStreamerArticle(
  articleUrl: string,
  html: string,
  kind: StreamerKind
): CbsStreamerLatestResponse {
  const $ = load(html)
  const rows: CbsStreamerRow[] = []

  $('.PlayerObjectV4').each((_i, el) => {
    const node = $(el)
    const playerName = cleanPlayerName(
      normalizeWhitespace(node.find('.PlayerObjectV4-playerName .PlayerName').first().text())
    )
    if (!playerName) return

    const positionsRaw = normalizeWhitespace(node.find('.PlayerObjectV4-playerPosition').first().text())
    const positions = positionsRaw ? splitPositions(positionsRaw) : []

    const teamRaw = normalizeWhitespace(node.find('.PlayerObjectV4-playerInfoName--short').first().text())
    const team = teamRaw ? canonicalTeamAbbr(teamRaw) : null

    let matchupText = ''
    node.find('.PlayerObjectV4-tableCell').each((_j, cell) => {
      const cellNode = $(cell)
      const label = normalizeWhitespace(cellNode.find('.PlayerObjectV4-label').first().text())
      if (/^matchups?$/i.test(label)) {
        matchupText = normalizeWhitespace(
          cellNode.clone().find('.PlayerObjectV4-label').remove().end().text()
        )
      }
    })

    const tokens = parseStreamerMatchupTokens(matchupText, kind)
    // Expand each token into one matchup per game so the view can list every
    // game with its own date (a 3-game series becomes three dated entries).
    const matchups: StreamerMatchup[] = tokens.flatMap((token) =>
      Array.from({ length: Math.max(1, token.games) }, () => ({
        date: null as string | null,
        opponent: token.opponent,
        home: token.home,
      }))
    )

    // The analyst's per-player writeup (repairMojibake fixes CBS's stray bytes).
    const blurbRaw = normalizeWhitespace(node.find('.PlayerObjectV4-analysis').first().text())
    const blurb = blurbRaw ? repairMojibake(blurbRaw) : null

    rows.push({
      player_name: playerName,
      mlb_team: team || null,
      positions,
      matchups,
      games: matchups.length,
      two_start: kind === 'pitchers' && tokens.length >= 2,
      blurb,
    })
  })

  if (rows.length === 0) {
    throw new Error(`CBS streamer parse produced zero players for ${articleUrl}`)
  }

  const title = normalizeWhitespace($('h1').first().text()) || `CBS Streamer ${kind}`
  const publishedAt = extractJsonLdDatePublished($) ?? $('time[datetime]').first().attr('datetime') ?? null
  const week = deriveStreamerWeek(publishedAt)

  return {
    kind,
    title,
    source_url: articleUrl,
    published_at: publishedAt,
    scraped_at: new Date().toISOString(),
    week_label: extractWeekLabel(title),
    week_start: week?.weekStart ?? null,
    week_end: week?.weekEnd ?? null,
    rows,
  }
}

interface ScheduleGame {
  date: string
  home: string
  away: string
}

// Pure: attach calendar dates to each matchup by matching the player's team and
// the CBS opponent against the week schedule, consuming each game once so a
// multi-game series spreads across its distinct dates.
export function enrichStreamerMatchupDates(
  rows: CbsStreamerRow[],
  gamesByTeam: Map<string, ScheduleGame[]>
): CbsStreamerRow[] {
  return rows.map((row) => {
    if (!row.mlb_team) return row
    const games = gamesByTeam.get(row.mlb_team) ?? []
    if (games.length === 0) return row

    const usedDates = new Set<string>()
    const matchups = row.matchups.map((matchup) => {
      const game = games.find((candidate) => {
        if (usedDates.has(candidate.date)) return false
        const isHomeGame = candidate.home === row.mlb_team && candidate.away === matchup.opponent
        const isAwayGame = candidate.away === row.mlb_team && candidate.home === matchup.opponent
        return matchup.home ? isHomeGame : isAwayGame
      })
      if (!game) return matchup
      usedDates.add(game.date)
      return { ...matchup, date: game.date }
    })

    return { ...row, matchups }
  })
}

async function fetchJsonResource<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (compatible; yahoo-fantasy-eval-app/1.0)',
      accept: 'application/json',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url} (${response.status})`)
  }
  return (await response.json()) as T
}

async function fetchMlbWeekSchedule(weekStart: string, weekEnd: string): Promise<Map<string, ScheduleGame[]>> {
  const idToAbbr = new Map<number, string>()
  try {
    const teamsPayload = await fetchJsonResource<{ teams?: Array<{ id?: number; abbreviation?: string }> }>(
      MLB_STATS_TEAMS_URL
    )
    for (const team of teamsPayload.teams ?? []) {
      if (team.id && team.abbreviation) {
        idToAbbr.set(team.id, canonicalTeamAbbr(team.abbreviation))
      }
    }
  } catch (error) {
    console.warn(`[cbs-streamer] team lookup failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  const scheduleUrl = `${MLB_STATS_SCHEDULE_URL}&startDate=${weekStart}&endDate=${weekEnd}`
  const schedulePayload = await fetchJsonResource<{
    dates?: Array<{
      games?: Array<{
        officialDate?: string
        gameDate?: string
        teams?: {
          home?: { team?: { id?: number; abbreviation?: string } }
          away?: { team?: { id?: number; abbreviation?: string } }
        }
      }>
    }>
  }>(scheduleUrl)

  const resolveAbbr = (team?: { id?: number; abbreviation?: string }): string => {
    if (!team) return ''
    if (team.id != null && idToAbbr.has(team.id)) return idToAbbr.get(team.id) as string
    return team.abbreviation ? canonicalTeamAbbr(team.abbreviation) : ''
  }

  const byTeam = new Map<string, ScheduleGame[]>()
  for (const day of schedulePayload.dates ?? []) {
    for (const game of day.games ?? []) {
      const home = resolveAbbr(game.teams?.home?.team)
      const away = resolveAbbr(game.teams?.away?.team)
      const date = game.officialDate ?? game.gameDate?.slice(0, 10) ?? ''
      if (!home || !away || !date) continue
      // The schedule endpoint occasionally returns a rescheduled game outside the
      // requested window; never let a matchup date escape the streaming week.
      if (date < weekStart || date > weekEnd) continue
      const entry: ScheduleGame = { date, home, away }
      for (const team of [home, away]) {
        const list = byTeam.get(team) ?? []
        list.push(entry)
        byTeam.set(team, list)
      }
    }
  }
  for (const list of byTeam.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date))
  }
  return byTeam
}

function extractCbsLatestArticleUrl(newsHtml: string, slug: RegExp, errorMessage: string): string {
  const $ = load(newsHtml)
  const seen = new Set<string>()
  let match: string | null = null
  $('a[href]').each((_i, el) => {
    if (match) return
    const href = $(el).attr('href') ?? ''
    if (!href || !slug.test(href) || !/\/fantasy\/baseball\/news\//i.test(href)) return
    if (seen.has(href)) return
    seen.add(href)
    match = href.startsWith('http') ? href : `${CBS_BASE_URL}${href.startsWith('/') ? '' : '/'}${href}`
  })
  if (!match) {
    throw new Error(errorMessage)
  }
  return match
}

async function fetchLatestCbsStreamer(kind: StreamerKind): Promise<CbsStreamerLatestResponse> {
  const slug = kind === 'hitters' ? CBS_STREAMER_HITTERS_SLUG : CBS_STREAMER_PITCHERS_SLUG
  const newsHtml = await fetchHtmlWithRetry(CBS_FANTASY_NEWS_URL)
  const articleUrl = extractCbsLatestArticleUrl(
    newsHtml,
    slug,
    `Unable to find latest CBS streamer ${kind} article URL`
  )
  console.log(`[cbs-streamer] selected ${kind} article URL: ${articleUrl}`)
  const articleHtml = await fetchHtmlWithRetry(articleUrl)
  const parsed = parseCbsStreamerArticle(articleUrl, articleHtml, kind)

  if (parsed.week_start && parsed.week_end) {
    try {
      const schedule = await fetchMlbWeekSchedule(parsed.week_start, parsed.week_end)
      parsed.rows = enrichStreamerMatchupDates(parsed.rows, schedule)
    } catch (error) {
      console.warn(
        `[cbs-streamer] schedule enrichment failed for ${kind}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  return parsed
}

function cbsStreamerApiPlugin(): Plugin {
  const routes: Record<string, StreamerKind> = {
    '/api/cbs-streamer-hitters/latest': 'hitters',
    '/api/cbs-streamer-pitchers/latest': 'pitchers',
  }

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url) return
    const requestPath = new URL(req.url, 'http://localhost').pathname
    const kind = routes[requestPath]
    if (!kind) return

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    try {
      const payload = await fetchLatestCbsStreamer(kind)
      res.statusCode = 200
      res.end(JSON.stringify(payload))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scraper error'
      res.statusCode = 500
      res.end(JSON.stringify({ error: 'cbs_streamer_scrape_failed', message }))
    }
  }

  return {
    name: 'cbs-streamer-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
  }
}

function pitcherListApiPlugin(): Plugin {
  const latestRoute = '/api/pitcher-list/latest'
  const historyRoute = '/api/pitcher-list/history'

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url) {
      return
    }

    const requestUrl = new URL(req.url, 'http://localhost')
    const requestPath = requestUrl.pathname
    if (requestPath !== latestRoute && requestPath !== historyRoute) {
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    try {
      const categoryHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL)
      const latestArticleUrl = extractLatestArticleUrl(
        categoryHtml,
        /\/top-100-starting-pitchers-for-[^/]+\/?$/i,
        'Unable to find latest starting pitcher rankings article URL'
      )
      console.log(`[pitcher-list] selected article URL: ${latestArticleUrl}`)
      const articleHtml = await fetchHtml(latestArticleUrl)
      const latestPayload = parsePitcherListArticle(latestArticleUrl, articleHtml)

      if (requestPath === historyRoute) {
        let existingHistory: PitcherListHistoryResponse | null = null

        // Prefer the local backfilled file; fall back to deployed snapshot.
        const localHistoryPath = path.resolve(process.cwd(), 'dist', 'api', 'pitcher-list', 'history.json')
        try {
          const raw = await readFile(localHistoryPath, 'utf8')
          existingHistory = JSON.parse(raw) as PitcherListHistoryResponse
          console.log(`[pitcher-list] loaded local history (${existingHistory.snapshots.length} snapshots)`)
        } catch {
          const historyUrl = buildProductionSnapshotUrl('pitcher-list/history.json')
          try {
            existingHistory = await fetchJsonSnapshot<PitcherListHistoryResponse>(historyUrl)
          } catch {
            existingHistory = null
          }
        }

        const payload: PitcherListHistoryResponse = {
          snapshots: upsertHistorySnapshots(
            existingHistory?.snapshots,
            toPitcherHistorySnapshot(latestPayload)
          ),
        }

        res.statusCode = 200
        res.end(JSON.stringify(payload))
        return
      }

      res.statusCode = 200
      res.end(JSON.stringify(latestPayload))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scraper error'
      res.statusCode = 500
      res.end(JSON.stringify({
        error: 'pitcher_list_scrape_failed',
        message,
      }))
    }
  }

  return {
    name: 'pitcher-list-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
  }
}

function hitterListApiPlugin(): Plugin {
  const latestRoute = '/api/hitter-list/latest'
  const historyRoute = '/api/hitter-list/history'

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url) {
      return
    }

    const requestUrl = new URL(req.url, 'http://localhost')
    const requestPath = requestUrl.pathname
    if (requestPath !== latestRoute && requestPath !== historyRoute) {
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    try {
      const categoryHtml = await fetchHtml(HITTER_LIST_CATEGORY_URL)
      const latestArticleUrl = extractLatestArticleUrl(
        categoryHtml,
        HITTER_LIST_ARTICLE_PATTERN,
        'Unable to find latest hitter rankings article URL'
      )
      console.log(`[hitter-list] selected article URL: ${latestArticleUrl}`)
      const articleHtml = await fetchHtml(latestArticleUrl)
      const latestPayload = parseHitterListArticle(latestArticleUrl, articleHtml)

      if (requestPath === historyRoute) {
        let existingHistory: PitcherListHistoryResponse | null = null

        // Prefer the local backfilled file; fall back to deployed snapshot.
        const localHistoryPath = path.resolve(process.cwd(), 'dist', 'api', 'hitter-list', 'history.json')
        try {
          const raw = await readFile(localHistoryPath, 'utf8')
          existingHistory = JSON.parse(raw) as PitcherListHistoryResponse
          console.log(`[hitter-list] loaded local history (${existingHistory.snapshots.length} snapshots)`)
        } catch {
          const historyUrl = buildProductionSnapshotUrl('hitter-list/history.json')
          try {
            existingHistory = await fetchJsonSnapshot<PitcherListHistoryResponse>(historyUrl)
          } catch {
            existingHistory = null
          }
        }

        const payload: PitcherListHistoryResponse = {
          snapshots: upsertHistorySnapshots(
            existingHistory?.snapshots,
            toPitcherHistorySnapshot(latestPayload)
          ),
        }

        res.statusCode = 200
        res.end(JSON.stringify(payload))
        return
      }

      res.statusCode = 200
      res.end(JSON.stringify(latestPayload))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scraper error'
      res.statusCode = 500
      res.end(JSON.stringify({
        error: 'hitter_list_scrape_failed',
        message,
      }))
    }
  }

  return {
    name: 'hitter-list-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
  }
}

function reliefListApiPlugin(): Plugin {
  const latestRoute = '/api/relief-list/latest'
  const historyRoute = '/api/relief-list/history'

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url) {
      return
    }

    const requestUrl = new URL(req.url, 'http://localhost')
    const requestPath = requestUrl.pathname
    if (requestPath !== latestRoute && requestPath !== historyRoute) {
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    try {
      const mode: ReliefScoringMode =
        requestUrl.searchParams.get('scoring') === 'saves' ? 'saves' : 'svhld'

      const categoryHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
      const latestArticleUrl = extractLatestArticleUrl(
        categoryHtml,
        /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
        'Unable to find latest reliever rankings article URL'
      )
      console.log(`[relief-list] selected article URL: ${latestArticleUrl}`)
      const articleHtml = await fetchHtml(latestArticleUrl)
      const latestPayload = parseReliefListArticle(latestArticleUrl, articleHtml, mode)

      if (requestPath === historyRoute) {
        const historyRelativePath =
          mode === 'saves' ? 'relief-list/history.saves.json' : 'relief-list/history.svhld.json'
        let existingHistory: ReliefListHistoryResponse | null = null

        // Prefer the local backfilled file; fall back to deployed snapshot.
        const localHistoryPath = path.resolve(process.cwd(), 'dist', 'api', historyRelativePath)
        try {
          const raw = await readFile(localHistoryPath, 'utf8')
          existingHistory = JSON.parse(raw) as ReliefListHistoryResponse
          console.log(`[relief-list] loaded local history (${existingHistory.snapshots.length} snapshots)`)
        } catch {
          const historyUrl = buildProductionSnapshotUrl(historyRelativePath)
          try {
            existingHistory = await fetchJsonSnapshot<ReliefListHistoryResponse>(historyUrl)
          } catch {
            existingHistory = null
          }
        }

        const payload: ReliefListHistoryResponse = {
          snapshots: upsertHistorySnapshots(
            existingHistory?.snapshots,
            toReliefHistorySnapshot(latestPayload)
          ),
        }

        res.statusCode = 200
        res.end(JSON.stringify(payload))
        return
      }

      res.statusCode = 200
      res.end(JSON.stringify(latestPayload))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scraper error'
      res.statusCode = 500
      res.end(JSON.stringify({
        error: 'relief_list_scrape_failed',
        message,
      }))
    }
  }

  return {
    name: 'relief-list-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
  }
}

function injuredPitchersApiPlugin(): Plugin {
  const route = '/api/injured-pitchers/latest'

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url || !req.url.startsWith(route)) {
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    try {
      const payload = await fetchLatestInjuredPitchers()
      res.statusCode = 200
      res.end(JSON.stringify(payload))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scraper error'
      res.statusCode = 500
      res.end(JSON.stringify({
        error: 'injured_pitchers_scrape_failed',
        message,
      }))
    }
  }

  return {
    name: 'injured-pitchers-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
  }
}

function prospectsApiPlugin(): Plugin {
  const route = '/api/prospects/latest'

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url || !req.url.startsWith(route)) {
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    try {
      const payload = await fetchLatestProspects()
      res.statusCode = 200
      res.end(JSON.stringify(payload))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown scraper error'
      res.statusCode = 500
      res.end(
        JSON.stringify({
          error: 'prospects_scrape_failed',
          message,
        })
      )
    }
  }

  return {
    name: 'prospects-api',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        middleware(req, res).then(() => {
          if (!res.writableEnded) next()
        })
      })
    },
  }
}

function staticApiSnapshotPlugin(): Plugin {
  return {
    name: 'static-api-snapshot',
    apply: 'build',
    async closeBundle() {
      const outputDir = path.resolve(process.cwd(), 'dist', 'api')
      await mkdir(path.join(outputDir, 'pitcher-list'), { recursive: true })
      await mkdir(path.join(outputDir, 'hitter-list'), { recursive: true })
      await mkdir(path.join(outputDir, 'relief-list'), { recursive: true })
      await mkdir(path.join(outputDir, 'prospects'), { recursive: true })
      await mkdir(path.join(outputDir, 'injured-pitchers'), { recursive: true })
      await mkdir(path.join(outputDir, 'cbs-streamer-hitters'), { recursive: true })
      await mkdir(path.join(outputDir, 'cbs-streamer-pitchers'), { recursive: true })

      const refreshTarget = normalizeSnapshotRefreshTarget(process.env.RANKING_REFRESH_TARGET)
      // A 'cbs' build only refreshes the CBS feeds and reuses every other deployed
      // snapshot, so the weekly streamer bootstrap never blocks on the fragile
      // pitcher/relief/prospects scrapes (and vice versa).
      const refreshPitcher = refreshTarget !== 'relief' && refreshTarget !== 'cbs'
      // The hitter board refreshes on its own cadence (RANKING_REFRESH_TARGET=hitter)
      // or on a full 'all' build; targeted pitcher/relief/cbs builds reuse the
      // deployed hitter snapshot so they never block on the hitter scrape.
      const refreshHitter = refreshTarget === 'hitter' || refreshTarget === 'all'
      const refreshRelief = refreshTarget !== 'pitcher' && refreshTarget !== 'cbs'
      const refreshProspects = refreshTarget !== 'relief' && refreshTarget !== 'cbs'
      // CBS streamer feeds get their own weekly cadence (RANKING_REFRESH_TARGET=cbs);
      // other targets reuse the deployed snapshot so a Tuesday SP build never blocks
      // on the more fragile CBS scrape.
      const refreshCbs = refreshTarget === 'cbs' || refreshTarget === 'all'

      console.log(`[snapshot] refresh target: ${refreshTarget}`)

      const writeJsonSnapshot = async (relativePath: string, payload: unknown): Promise<void> => {
        await writeFile(path.join(outputDir, relativePath), JSON.stringify(payload), 'utf8')
      }

      const pitcherSnapshotUrl = buildProductionSnapshotUrl('pitcher-list/latest.json')
      const scrapePitcherLive = async (): Promise<PitcherListLatestResponse> => {
        const pitcherCategoryHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL)
        const pitcherArticleUrl = extractLatestArticleUrl(
          pitcherCategoryHtml,
          /\/top-100-starting-pitchers-for-[^/]+\/?$/i,
          'Unable to find latest starting pitcher rankings article URL'
        )
        console.log(`[snapshot] selected pitcher article URL: ${pitcherArticleUrl}`)
        const pitcherArticleHtml = await fetchHtml(pitcherArticleUrl)
        return parsePitcherListArticle(pitcherArticleUrl, pitcherArticleHtml)
      }
      const loadDeployedPitcher = (): Promise<PitcherListLatestResponse> =>
        fetchJsonSnapshot<PitcherListLatestResponse>(pitcherSnapshotUrl)

      let pitcherPayload: PitcherListLatestResponse
      if (refreshPitcher) {
        try {
          pitcherPayload = await scrapePitcherLive()
        } catch (error) {
          console.warn(
            `[snapshot] pitcher live scrape failed, falling back to deployed snapshot (${pitcherSnapshotUrl}): ${error instanceof Error ? error.message : String(error)}`
          )
          pitcherPayload = await loadDeployedPitcher()
        }
      } else {
        try {
          pitcherPayload = await loadDeployedPitcher()
          console.log(`[snapshot] reusing deployed pitcher snapshot: ${pitcherSnapshotUrl}`)
        } catch (error) {
          console.warn(
            `[snapshot] fallback failed for pitcher snapshot (${pitcherSnapshotUrl}), scraping live instead: ${error instanceof Error ? error.message : String(error)}`
          )
          pitcherPayload = await scrapePitcherLive()
        }
      }
      await writeJsonSnapshot(path.join('pitcher-list', 'latest.json'), pitcherPayload)

      const pitcherHistoryUrl = buildProductionSnapshotUrl('pitcher-list/history.json')
      let existingPitcherHistory: PitcherListHistoryResponse | null = null
      try {
        existingPitcherHistory = await fetchJsonSnapshot<PitcherListHistoryResponse>(pitcherHistoryUrl)
      } catch (error) {
        console.warn(
          `[snapshot] history seed unavailable for pitcher (${pitcherHistoryUrl}): ${error instanceof Error ? error.message : String(error)}`
        )
      }

      // Backfill: scrape past articles when history is too sparse to build 8-week trend
      const pitcherBackfillSnapshots: PitcherListHistorySnapshot[] = []
      const existingPitcherCount = existingPitcherHistory?.snapshots?.length ?? 0
      if (refreshPitcher && existingPitcherCount < HISTORY_BACKFILL_TARGET) {
        const needed = HISTORY_BACKFILL_TARGET - existingPitcherCount
        console.log(
          `[snapshot] pitcher history has ${existingPitcherCount} snapshot(s); backfilling up to ${needed} past article(s)`
        )
        try {
          const catHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL)
          const allUrls = extractMultipleArticleUrls(
            catHtml,
            /\/top-100-starting-pitchers-for-[^/]+\/?$/i,
            'Unable to find pitcher rankings article URLs',
            HISTORY_BACKFILL_TARGET + 1
          )
          const latestPath = new URL(pitcherPayload.source_url).pathname.toLowerCase()
          const pastUrls = allUrls
            .filter((url) => {
              try {
                return new URL(url).pathname.toLowerCase() !== latestPath
              } catch {
                return true
              }
            })
            .slice(0, needed)

          for (const url of pastUrls) {
            try {
              const html = await fetchHtml(url)
              const parsed = parsePitcherListArticle(url, html)
              const snapshot = toPitcherHistorySnapshot(parsed)
              pitcherBackfillSnapshots.push(snapshot)
              console.log(`[snapshot] backfilled pitcher article: ${url} → ${snapshot.snapshot_date}`)
            } catch (err) {
              console.warn(
                `[snapshot] failed to backfill pitcher article ${url}: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            }
          }
        } catch (err) {
          console.warn(
            `[snapshot] pitcher backfill failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      const pitcherHistoryPayload: PitcherListHistoryResponse = {
        snapshots: upsertHistorySnapshots(
          [...(existingPitcherHistory?.snapshots ?? []), ...pitcherBackfillSnapshots],
          toPitcherHistorySnapshot(pitcherPayload)
        ),
      }
      await writeJsonSnapshot(path.join('pitcher-list', 'history.json'), pitcherHistoryPayload)

      // ----- Hitter rankings (Pitcher List Top 150) -----
      const hitterSnapshotUrl = buildProductionSnapshotUrl('hitter-list/latest.json')
      const scrapeHitterLive = async (): Promise<PitcherListLatestResponse> => {
        const hitterCategoryHtml = await fetchHtml(HITTER_LIST_CATEGORY_URL)
        const hitterArticleUrl = extractLatestArticleUrl(
          hitterCategoryHtml,
          HITTER_LIST_ARTICLE_PATTERN,
          'Unable to find latest hitter rankings article URL'
        )
        console.log(`[snapshot] selected hitter article URL: ${hitterArticleUrl}`)
        const hitterArticleHtml = await fetchHtml(hitterArticleUrl)
        return parseHitterListArticle(hitterArticleUrl, hitterArticleHtml)
      }
      const loadDeployedHitter = (): Promise<PitcherListLatestResponse> =>
        fetchJsonSnapshot<PitcherListLatestResponse>(hitterSnapshotUrl)

      let hitterPayload: PitcherListLatestResponse
      if (refreshHitter) {
        try {
          hitterPayload = await scrapeHitterLive()
        } catch (error) {
          console.warn(
            `[snapshot] hitter live scrape failed, falling back to deployed snapshot (${hitterSnapshotUrl}): ${error instanceof Error ? error.message : String(error)}`
          )
          hitterPayload = await loadDeployedHitter()
        }
      } else {
        try {
          hitterPayload = await loadDeployedHitter()
          console.log(`[snapshot] reusing deployed hitter snapshot: ${hitterSnapshotUrl}`)
        } catch (error) {
          console.warn(
            `[snapshot] fallback failed for hitter snapshot (${hitterSnapshotUrl}), scraping live instead: ${error instanceof Error ? error.message : String(error)}`
          )
          hitterPayload = await scrapeHitterLive()
        }
      }
      await writeJsonSnapshot(path.join('hitter-list', 'latest.json'), hitterPayload)

      const hitterHistoryUrl = buildProductionSnapshotUrl('hitter-list/history.json')
      let existingHitterHistory: PitcherListHistoryResponse | null = null
      try {
        existingHitterHistory = await fetchJsonSnapshot<PitcherListHistoryResponse>(hitterHistoryUrl)
      } catch (error) {
        console.warn(
          `[snapshot] history seed unavailable for hitter (${hitterHistoryUrl}): ${error instanceof Error ? error.message : String(error)}`
        )
      }

      // Backfill: scrape past articles when history is too sparse to build 8-week trend
      const hitterBackfillSnapshots: PitcherListHistorySnapshot[] = []
      const existingHitterCount = existingHitterHistory?.snapshots?.length ?? 0
      if (refreshHitter && existingHitterCount < HISTORY_BACKFILL_TARGET) {
        const needed = HISTORY_BACKFILL_TARGET - existingHitterCount
        console.log(
          `[snapshot] hitter history has ${existingHitterCount} snapshot(s); backfilling up to ${needed} past article(s)`
        )
        try {
          const catHtml = await fetchHtml(HITTER_LIST_CATEGORY_URL)
          const allUrls = extractMultipleArticleUrls(
            catHtml,
            HITTER_LIST_ARTICLE_PATTERN,
            'Unable to find hitter rankings article URLs',
            HISTORY_BACKFILL_TARGET + 1
          )
          const latestPath = new URL(hitterPayload.source_url).pathname.toLowerCase()
          const pastUrls = allUrls
            .filter((url) => {
              try {
                return new URL(url).pathname.toLowerCase() !== latestPath
              } catch {
                return true
              }
            })
            .slice(0, needed)

          for (const url of pastUrls) {
            try {
              const html = await fetchHtml(url)
              const parsed = parseHitterListArticle(url, html)
              const snapshot = toPitcherHistorySnapshot(parsed)
              hitterBackfillSnapshots.push(snapshot)
              console.log(`[snapshot] backfilled hitter article: ${url} → ${snapshot.snapshot_date}`)
            } catch (err) {
              console.warn(
                `[snapshot] failed to backfill hitter article ${url}: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            }
          }
        } catch (err) {
          console.warn(
            `[snapshot] hitter backfill failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      const hitterHistoryPayload: PitcherListHistoryResponse = {
        snapshots: upsertHistorySnapshots(
          [...(existingHitterHistory?.snapshots ?? []), ...hitterBackfillSnapshots],
          toPitcherHistorySnapshot(hitterPayload)
        ),
      }
      await writeJsonSnapshot(path.join('hitter-list', 'history.json'), hitterHistoryPayload)

      const svhldSnapshotUrl = buildProductionSnapshotUrl('relief-list/latest.svhld.json')
      const savesSnapshotUrl = buildProductionSnapshotUrl('relief-list/latest.saves.json')
      const scrapeReliefLive = async (): Promise<
        [ReliefListLatestResponse, ReliefListLatestResponse]
      > => {
        const reliefCategoryHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
        const reliefArticleUrl = extractLatestArticleUrl(
          reliefCategoryHtml,
          /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
          'Unable to find latest reliever rankings article URL'
        )
        console.log(`[snapshot] selected relief article URL: ${reliefArticleUrl}`)
        const reliefArticleHtml = await fetchHtml(reliefArticleUrl)
        return [
          parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'svhld'),
          parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'saves'),
        ]
      }
      const loadDeployedRelief = (): Promise<
        [ReliefListLatestResponse, ReliefListLatestResponse]
      > =>
        Promise.all([
          fetchJsonSnapshot<ReliefListLatestResponse>(svhldSnapshotUrl),
          fetchJsonSnapshot<ReliefListLatestResponse>(savesSnapshotUrl),
        ])

      let svhldPayload: ReliefListLatestResponse
      let savesPayload: ReliefListLatestResponse
      if (refreshRelief) {
        try {
          ;[svhldPayload, savesPayload] = await scrapeReliefLive()
        } catch (error) {
          console.warn(
            `[snapshot] relief live scrape failed, falling back to deployed snapshots (${svhldSnapshotUrl}, ${savesSnapshotUrl}): ${error instanceof Error ? error.message : String(error)}`
          )
          ;[svhldPayload, savesPayload] = await loadDeployedRelief()
        }
      } else {
        try {
          ;[svhldPayload, savesPayload] = await loadDeployedRelief()
          console.log(`[snapshot] reusing deployed relief snapshots: ${svhldSnapshotUrl}, ${savesSnapshotUrl}`)
        } catch (error) {
          console.warn(
            `[snapshot] fallback failed for relief snapshots, scraping live instead: ${error instanceof Error ? error.message : String(error)}`
          )
          ;[svhldPayload, savesPayload] = await scrapeReliefLive()
        }
      }
      await writeJsonSnapshot(path.join('relief-list', 'latest.svhld.json'), svhldPayload)
      await writeJsonSnapshot(path.join('relief-list', 'latest.saves.json'), savesPayload)

      const svhldHistoryUrl = buildProductionSnapshotUrl('relief-list/history.svhld.json')
      const savesHistoryUrl = buildProductionSnapshotUrl('relief-list/history.saves.json')
      let existingSvhldHistory: ReliefListHistoryResponse | null = null
      let existingSavesHistory: ReliefListHistoryResponse | null = null

      try {
        existingSvhldHistory = await fetchJsonSnapshot<ReliefListHistoryResponse>(svhldHistoryUrl)
      } catch (error) {
        console.warn(
          `[snapshot] history seed unavailable for relief svhld (${svhldHistoryUrl}): ${error instanceof Error ? error.message : String(error)}`
        )
      }

      try {
        existingSavesHistory = await fetchJsonSnapshot<ReliefListHistoryResponse>(savesHistoryUrl)
      } catch (error) {
        console.warn(
          `[snapshot] history seed unavailable for relief saves (${savesHistoryUrl}): ${error instanceof Error ? error.message : String(error)}`
        )
      }

      // Backfill: scrape past articles when relief history is too sparse to build 8-week trend
      const reliefBackfillSvhld: ReliefListHistorySnapshot[] = []
      const reliefBackfillSaves: ReliefListHistorySnapshot[] = []
      const existingSvhldCount = existingSvhldHistory?.snapshots?.length ?? 0
      const existingSavesCount = existingSavesHistory?.snapshots?.length ?? 0
      const reliefNeeded = Math.max(
        HISTORY_BACKFILL_TARGET - existingSvhldCount,
        HISTORY_BACKFILL_TARGET - existingSavesCount
      )
      if (refreshRelief && reliefNeeded > 0) {
        console.log(
          `[snapshot] relief history has ${existingSvhldCount}/${existingSavesCount} svhld/saves snapshot(s); backfilling up to ${reliefNeeded} past article(s)`
        )
        try {
          const reliefCatHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
          const allReliefUrls = extractMultipleArticleUrls(
            reliefCatHtml,
            /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
            'Unable to find reliever rankings article URLs',
            HISTORY_BACKFILL_TARGET + 1
          )
          const latestReliefPath = new URL(svhldPayload.source_url).pathname.toLowerCase()
          const pastReliefUrls = allReliefUrls
            .filter((url) => {
              try {
                return new URL(url).pathname.toLowerCase() !== latestReliefPath
              } catch {
                return true
              }
            })
            .slice(0, reliefNeeded)

          for (const url of pastReliefUrls) {
            try {
              const html = await fetchHtml(url)
              const svhldSnap = toReliefHistorySnapshot(parseReliefListArticle(url, html, 'svhld'))
              const savesSnap = toReliefHistorySnapshot(parseReliefListArticle(url, html, 'saves'))
              reliefBackfillSvhld.push(svhldSnap)
              reliefBackfillSaves.push(savesSnap)
              console.log(`[snapshot] backfilled relief article: ${url} → ${svhldSnap.snapshot_date}`)
            } catch (err) {
              console.warn(
                `[snapshot] failed to backfill relief article ${url}: ${
                  err instanceof Error ? err.message : String(err)
                }`
              )
            }
          }
        } catch (err) {
          console.warn(
            `[snapshot] relief backfill failed: ${err instanceof Error ? err.message : String(err)}`
          )
        }
      }

      const svhldHistoryPayload: ReliefListHistoryResponse = {
        snapshots: upsertHistorySnapshots(
          [...(existingSvhldHistory?.snapshots ?? []), ...reliefBackfillSvhld],
          toReliefHistorySnapshot(svhldPayload)
        ),
      }
      const savesHistoryPayload: ReliefListHistoryResponse = {
        snapshots: upsertHistorySnapshots(
          [...(existingSavesHistory?.snapshots ?? []), ...reliefBackfillSaves],
          toReliefHistorySnapshot(savesPayload)
        ),
      }

      await writeJsonSnapshot(path.join('relief-list', 'history.svhld.json'), svhldHistoryPayload)
      await writeJsonSnapshot(path.join('relief-list', 'history.saves.json'), savesHistoryPayload)

      try {
        const injuredPayload = await fetchLatestInjuredPitchers()
        await writeJsonSnapshot(path.join('injured-pitchers', 'latest.json'), injuredPayload)
      } catch (error) {
        const injuredSnapshotUrl = buildProductionSnapshotUrl('injured-pitchers/latest.json')
        console.warn(
          `[snapshot] injured scrape failed, trying deployed snapshot (${injuredSnapshotUrl}): ${error instanceof Error ? error.message : String(error)}`
        )
        const injuredPayload = await fetchJsonSnapshot<InjuredPitchersLatestResponse>(
          injuredSnapshotUrl
        )
        await writeJsonSnapshot(path.join('injured-pitchers', 'latest.json'), injuredPayload)
      }

      const prospectsSnapshotUrl = buildProductionSnapshotUrl('prospects/latest.json')
      const loadDeployedProspects = (): Promise<ProspectsLatestResponse> =>
        fetchJsonSnapshot<ProspectsLatestResponse>(prospectsSnapshotUrl)

      let prospectsPayload: ProspectsLatestResponse
      if (refreshProspects) {
        try {
          prospectsPayload = await fetchLatestProspects()
        } catch (error) {
          console.warn(
            `[snapshot] prospects live scrape failed, falling back to deployed snapshot (${prospectsSnapshotUrl}): ${error instanceof Error ? error.message : String(error)}`
          )
          prospectsPayload = await loadDeployedProspects()
        }
      } else {
        try {
          prospectsPayload = await loadDeployedProspects()
          console.log(`[snapshot] reusing deployed prospects snapshot: ${prospectsSnapshotUrl}`)
        } catch (error) {
          console.warn(
            `[snapshot] fallback failed for prospects snapshot, scraping live instead: ${error instanceof Error ? error.message : String(error)}`
          )
          prospectsPayload = await fetchLatestProspects()
        }
      }
      await writeJsonSnapshot(path.join('prospects', 'latest.json'), prospectsPayload)

      // CBS streamer snapshots. Live scrape is best-effort: on failure we reuse
      // the deployed snapshot, and if even that is unavailable we skip the write
      // rather than fail the whole build.
      const writeCbsStreamerSnapshot = async (kind: StreamerKind): Promise<void> => {
        const dir = kind === 'hitters' ? 'cbs-streamer-hitters' : 'cbs-streamer-pitchers'
        const relativePath = path.join(dir, 'latest.json')
        if (refreshCbs) {
          try {
            const payload = await fetchLatestCbsStreamer(kind)
            await writeJsonSnapshot(relativePath, payload)
            return
          } catch (error) {
            console.warn(
              `[snapshot] CBS streamer ${kind} live scrape failed, falling back to deployed snapshot: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        }
        const snapshotUrl = buildProductionSnapshotUrl(`${dir}/latest.json`)
        try {
          const payload = await fetchJsonSnapshot<CbsStreamerLatestResponse>(snapshotUrl)
          await writeJsonSnapshot(relativePath, payload)
          console.log(`[snapshot] reusing deployed CBS streamer ${kind} snapshot: ${snapshotUrl}`)
        } catch (error) {
          console.warn(
            `[snapshot] no CBS streamer ${kind} snapshot available (${snapshotUrl}): ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }
      await writeCbsStreamerSnapshot('hitters')
      await writeCbsStreamerSnapshot('pitchers')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pitcherListApiPlugin(),
    hitterListApiPlugin(),
    reliefListApiPlugin(),
    injuredPitchersApiPlugin(),
    prospectsApiPlugin(),
    cbsStreamerApiPlugin(),
    staticApiSnapshotPlugin(),
  ],
  base: '/yahoo-fantasy-baseball-eval-app/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
