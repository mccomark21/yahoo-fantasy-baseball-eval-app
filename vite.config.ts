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
const MLB_PROSPECTS_URL = 'https://www.mlb.com/milb/prospects/top100/'
const FANGRAPHS_PROSPECTS_URL = 'https://www.fangraphs.com/prospects/the-board'
const PROSPECTS_LIVE_URL = 'https://www.prospectslive.com/2026-top-100-prospects/'
const PRODUCTION_API_BASE_URL =
  process.env.PRODUCTION_API_BASE_URL ??
  'https://mccomark21.github.io/yahoo-fantasy-baseball-eval-app/api'
const MAX_HISTORY_SNAPSHOTS = 12
const HISTORY_BACKFILL_TARGET = 8

type ReliefScoringMode = 'svhld' | 'saves'
type ProspectSourceName = 'mlb' | 'fangraphs' | 'prospects_live'
type SnapshotRefreshTarget = 'all' | 'pitcher' | 'relief'
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
  tableHeadingPattern?: RegExp
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
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) return

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
    if (!Number.isFinite(rank) || rank < 1 || rank > 100) {
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
  if (normalized === 'pitcher' || normalized === 'relief' || normalized === 'all') {
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

async function collectProspectSource(
  source: ProspectSourceName,
  sourceUrl: string
): Promise<{ status: ProspectSourceStatus; rows: ProspectSourceRow[] }> {
  const scrapedAt = new Date().toISOString()
  let rows: ProspectSourceRow[] = []

  try {
    const html =
      source === 'fangraphs'
        ? await fetchHtmlWithRetry(sourceUrl)
        : await fetchHtml(sourceUrl)

    if (source === 'mlb') {
      rows = parseMlbProspectsPage(html)
    } else if (source === 'prospects_live') {
      rows = parseProspectsLivePage(html)
    } else {
      rows = parseFangraphsBoardPage(html)
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
              ? 'Fangraphs The Board'
              : 'Prospects Live Top 100',
        source_url: sourceUrl,
        published_at: null,
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
              ? 'Fangraphs The Board'
              : 'Prospects Live Top 100',
        source_url: sourceUrl,
        published_at: null,
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
  const [mlb, fangraphs, prospectsLive] = await Promise.all([
    collectProspectSource('mlb', MLB_PROSPECTS_URL),
    collectProspectSource('fangraphs', FANGRAPHS_PROSPECTS_URL),
    collectProspectSource('prospects_live', PROSPECTS_LIVE_URL),
  ])

  const allRows = [...mlb.rows, ...fangraphs.rows, ...prospectsLive.rows]
  const sources = [mlb.status, fangraphs.status, prospectsLive.status]

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
      await mkdir(path.join(outputDir, 'relief-list'), { recursive: true })
      await mkdir(path.join(outputDir, 'prospects'), { recursive: true })
      await mkdir(path.join(outputDir, 'injured-pitchers'), { recursive: true })

      const refreshTarget = normalizeSnapshotRefreshTarget(process.env.RANKING_REFRESH_TARGET)
      const refreshPitcher = refreshTarget !== 'relief'
      const refreshRelief = refreshTarget !== 'pitcher'
      const refreshProspects = refreshTarget !== 'relief'

      console.log(`[snapshot] refresh target: ${refreshTarget}`)

      const writeJsonSnapshot = async (relativePath: string, payload: unknown): Promise<void> => {
        await writeFile(path.join(outputDir, relativePath), JSON.stringify(payload), 'utf8')
      }

      let pitcherPayload: PitcherListLatestResponse
      if (refreshPitcher) {
        const pitcherCategoryHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL)
        const pitcherArticleUrl = extractLatestArticleUrl(
          pitcherCategoryHtml,
          /\/top-100-starting-pitchers-for-[^/]+\/?$/i,
          'Unable to find latest starting pitcher rankings article URL'
        )
        console.log(`[snapshot] selected pitcher article URL: ${pitcherArticleUrl}`)
        const pitcherArticleHtml = await fetchHtml(pitcherArticleUrl)
        pitcherPayload = parsePitcherListArticle(pitcherArticleUrl, pitcherArticleHtml)
      } else {
        const pitcherSnapshotUrl = buildProductionSnapshotUrl('pitcher-list/latest.json')
        try {
          pitcherPayload = await fetchJsonSnapshot<PitcherListLatestResponse>(pitcherSnapshotUrl)
          console.log(`[snapshot] reusing deployed pitcher snapshot: ${pitcherSnapshotUrl}`)
        } catch (error) {
          console.warn(
            `[snapshot] fallback failed for pitcher snapshot (${pitcherSnapshotUrl}), scraping live instead: ${error instanceof Error ? error.message : String(error)}`
          )
          const pitcherCategoryHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL)
          const pitcherArticleUrl = extractLatestArticleUrl(
            pitcherCategoryHtml,
            /\/top-100-starting-pitchers-for-[^/]+\/?$/i,
            'Unable to find latest starting pitcher rankings article URL'
          )
          const pitcherArticleHtml = await fetchHtml(pitcherArticleUrl)
          pitcherPayload = parsePitcherListArticle(pitcherArticleUrl, pitcherArticleHtml)
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

      let svhldPayload: ReliefListLatestResponse
      let savesPayload: ReliefListLatestResponse
      if (refreshRelief) {
        const reliefCategoryHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
        const reliefArticleUrl = extractLatestArticleUrl(
          reliefCategoryHtml,
          /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
          'Unable to find latest reliever rankings article URL'
        )
        console.log(`[snapshot] selected relief article URL: ${reliefArticleUrl}`)
        const reliefArticleHtml = await fetchHtml(reliefArticleUrl)
        svhldPayload = parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'svhld')
        savesPayload = parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'saves')
      } else {
        const svhldSnapshotUrl = buildProductionSnapshotUrl('relief-list/latest.svhld.json')
        const savesSnapshotUrl = buildProductionSnapshotUrl('relief-list/latest.saves.json')
        try {
          ;[svhldPayload, savesPayload] = await Promise.all([
            fetchJsonSnapshot<ReliefListLatestResponse>(svhldSnapshotUrl),
            fetchJsonSnapshot<ReliefListLatestResponse>(savesSnapshotUrl),
          ])
          console.log(`[snapshot] reusing deployed relief snapshots: ${svhldSnapshotUrl}, ${savesSnapshotUrl}`)
        } catch (error) {
          console.warn(
            `[snapshot] fallback failed for relief snapshots, scraping live instead: ${error instanceof Error ? error.message : String(error)}`
          )
          const reliefCategoryHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
          const reliefArticleUrl = extractLatestArticleUrl(
            reliefCategoryHtml,
            /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
            'Unable to find latest reliever rankings article URL'
          )
          const reliefArticleHtml = await fetchHtml(reliefArticleUrl)
          svhldPayload = parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'svhld')
          savesPayload = parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'saves')
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

      if (refreshProspects) {
        const prospectsPayload = await fetchLatestProspects()
        await writeJsonSnapshot(path.join('prospects', 'latest.json'), prospectsPayload)
      } else {
        const prospectsSnapshotUrl = buildProductionSnapshotUrl('prospects/latest.json')
        try {
          const prospectsPayload = await fetchJsonSnapshot<ProspectsLatestResponse>(prospectsSnapshotUrl)
          console.log(`[snapshot] reusing deployed prospects snapshot: ${prospectsSnapshotUrl}`)
          await writeJsonSnapshot(path.join('prospects', 'latest.json'), prospectsPayload)
        } catch (error) {
          console.warn(
            `[snapshot] fallback failed for prospects snapshot, scraping live instead: ${error instanceof Error ? error.message : String(error)}`
          )
          const prospectsPayload = await fetchLatestProspects()
          await writeJsonSnapshot(path.join('prospects', 'latest.json'), prospectsPayload)
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    pitcherListApiPlugin(),
    reliefListApiPlugin(),
    injuredPitchersApiPlugin(),
    prospectsApiPlugin(),
    staticApiSnapshotPlugin(),
  ],
  base: '/yahoo-fantasy-baseball-eval-app/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
