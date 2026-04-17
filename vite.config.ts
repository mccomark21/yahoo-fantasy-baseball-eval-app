import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { load } from 'cheerio'
import path from 'path'

const PITCHER_LIST_CATEGORY_URL =
  'https://pitcherlist.com/category/fantasy/starting-pitchers/the-list/'
const RELIEF_LIST_CATEGORY_URL_SVHLD =
  'https://pitcherlist.com/category/fantasy/relief-pitchers/reliever-ranks/'

type ReliefScoringMode = 'svhld' | 'saves'

type TrendDirection = 'up' | 'down' | 'flat' | 'new' | 'unknown'

interface PitcherListRankRow {
  latest_rank: number
  player_name: string
  mlb_team: string | null
  movement_raw: string
  movement_value: number | null
  trend_direction: TrendDirection
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
  rows: PitcherListRankRow[]
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
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
      })
    }
  })

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
    return parseRankingArticle(
      articleUrl,
      articleHtml,
      'Pitcher List Reliever Rankings',
      40,
      /top\s*50\s*closers\s*for\s*fantasy\s*baseball/i
    )
  }
  return parseRankingArticle(
    articleUrl,
    articleHtml,
    'Pitcher List Reliever Rankings',
    90,
    /top\s*100\s*relievers\s*for\s*sv\+hld\s*leagues/i
  )
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
  return response.text()
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
      const payload = {
        ...parseReliefListArticle(latestArticleUrl, articleHtml, mode),
        scoring_mode: mode,
      }
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

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), pitcherListApiPlugin(), reliefListApiPlugin()],
  base: '/yahoo-fantasy-baseball-eval-app/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
