import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { load } from 'cheerio'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'

const PITCHER_LIST_CATEGORY_URL =
  'https://pitcherlist.com/category/fantasy/starting-pitchers/the-list/'
const RELIEF_LIST_CATEGORY_URL_SVHLD =
  'https://pitcherlist.com/category/fantasy/relief-pitchers/reliever-ranks/'
const MLB_PROSPECTS_URL = 'https://www.mlb.com/milb/prospects/top100/'
const FANGRAPHS_PROSPECTS_URL = 'https://www.fangraphs.com/prospects/the-board'
const PROSPECTS_LIVE_URL = 'https://www.prospectslive.com/2026-top-100-prospects/'

type ReliefScoringMode = 'svhld' | 'saves'
type ProspectSourceName = 'mlb' | 'fangraphs' | 'prospects_live'

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

  const feetInches = normalized.match(/(\d+)\s*['’]\s*(\d{1,2})\s*(?:\"|”|in)?/)
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

  const looseMatch = report.match(/Scouting grades?:\s*([^\.]{1,220})/i)
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

function extractLatestArticleUrl(
  categoryHtml: string,
  articlePattern: RegExp,
  errorMessage: string
): string {
  const $ = load(categoryHtml)
  const links = $('a[href]')
    .map((_i, el) => $(el).attr('href') ?? '')
    .get()

  const candidate = links.find((href) =>
    articlePattern.test(href)
  )

  if (!candidate) {
    throw new Error(errorMessage)
  }

  return toAbsoluteUrl(candidate)
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
    .split(/[\/,]/)
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
    const match = headingText.match(/^(\d+)\.\s*(.+?),\s*([^\-]+?)\s*-\s*(\d+)\s*OFP$/i)
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
  const route = '/api/pitcher-list/latest'

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url || !req.url.startsWith(route)) {
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
      const articleHtml = await fetchHtml(latestArticleUrl)
      const payload = parsePitcherListArticle(latestArticleUrl, articleHtml)
      res.statusCode = 200
      res.end(JSON.stringify(payload))
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
  const route = '/api/relief-list/latest'

  const middleware = async (req: { url?: string }, res: { setHeader: (name: string, value: string) => void; statusCode: number; end: (body?: string) => void }) => {
    if (!req.url || !req.url.startsWith(route)) {
      return
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8')

    try {
      const requestUrl = new URL(req.url, 'http://localhost')
      const mode: ReliefScoringMode =
        requestUrl.searchParams.get('scoring') === 'saves' ? 'saves' : 'svhld'

      const categoryHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
      const latestArticleUrl = extractLatestArticleUrl(
        categoryHtml,
        /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
        'Unable to find latest reliever rankings article URL'
      )
      const articleHtml = await fetchHtml(latestArticleUrl)
      const payload = parseReliefListArticle(latestArticleUrl, articleHtml, mode)
      res.statusCode = 200
      res.end(JSON.stringify(payload))
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

      const pitcherCategoryHtml = await fetchHtml(PITCHER_LIST_CATEGORY_URL)
      const pitcherArticleUrl = extractLatestArticleUrl(
        pitcherCategoryHtml,
        /\/top-100-starting-pitchers-for-[^/]+\/?$/i,
        'Unable to find latest starting pitcher rankings article URL'
      )
      const pitcherArticleHtml = await fetchHtml(pitcherArticleUrl)
      const pitcherPayload = parsePitcherListArticle(pitcherArticleUrl, pitcherArticleHtml)

      await writeFile(
        path.join(outputDir, 'pitcher-list', 'latest.json'),
        JSON.stringify(pitcherPayload),
        'utf8'
      )

      const reliefCategoryHtml = await fetchHtml(RELIEF_LIST_CATEGORY_URL_SVHLD)
      const reliefArticleUrl = extractLatestArticleUrl(
        reliefCategoryHtml,
        /\/fantasy-reliever-rankings-closers-holds-solds-[^/]+\/?$/i,
        'Unable to find latest reliever rankings article URL'
      )
      const reliefArticleHtml = await fetchHtml(reliefArticleUrl)

      const svhldPayload = parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'svhld')
      const savesPayload = parseReliefListArticle(reliefArticleUrl, reliefArticleHtml, 'saves')

      await writeFile(
        path.join(outputDir, 'relief-list', 'latest.svhld.json'),
        JSON.stringify(svhldPayload),
        'utf8'
      )
      await writeFile(
        path.join(outputDir, 'relief-list', 'latest.saves.json'),
        JSON.stringify(savesPayload),
        'utf8'
      )

      const prospectsPayload = await fetchLatestProspects()
      await writeFile(
        path.join(outputDir, 'prospects', 'latest.json'),
        JSON.stringify(prospectsPayload),
        'utf8'
      )
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
