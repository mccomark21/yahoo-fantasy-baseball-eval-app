import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  parseCbsStreamerArticle,
  deriveStreamerWeek,
  enrichStreamerMatchupDates,
} from '../../vite.config'

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__')
const hittersHtml = readFileSync(path.join(fixtureDir, 'cbs-streamer-hitters.html'), 'utf8')
const pitchersHtml = readFileSync(path.join(fixtureDir, 'cbs-streamer-pitchers.html'), 'utf8')

const HITTERS_URL =
  'https://www.cbssports.com/fantasy/baseball/news/fantasy-baseball-week-14-preview-top-10-sleeper-hitters/'
const PITCHERS_URL =
  'https://www.cbssports.com/fantasy/baseball/news/fantasy-baseball-week-14-preview-top-10-sleeper-pitchers/'

describe('parseCbsStreamerArticle — hitters (issue #19)', () => {
  const result = parseCbsStreamerArticle(HITTERS_URL, hittersHtml, 'hitters')

  it('parses all ten sleeper hitters with week metadata', () => {
    expect(result.kind).toBe('hitters')
    expect(result.rows).toHaveLength(10)
    expect(result.week_label).toBe('Week 14')
    expect(result.published_at).toBe('2026-06-22T09:30:00+00:00')
    // The Monday–Sunday window derived from the publish date.
    expect(result.week_start).toBe('2026-06-22')
    expect(result.week_end).toBe('2026-06-28')
  })

  it('expands an away series into one dateless matchup per game', () => {
    const goldschmidt = result.rows.find((row) => row.player_name === 'Paul Goldschmidt')
    expect(goldschmidt).toBeDefined()
    expect(goldschmidt?.mlb_team).toBe('NYY')
    expect(goldschmidt?.positions).toEqual(['1B'])
    expect(goldschmidt?.two_start).toBe(false)
    // "@DET3, @BOS4" → 3 + 4 away games.
    expect(goldschmidt?.games).toBe(7)
    expect(goldschmidt?.matchups.filter((m) => m.opponent === 'DET')).toHaveLength(3)
    expect(goldschmidt?.matchups.filter((m) => m.opponent === 'BOS')).toHaveLength(4)
    expect(goldschmidt?.matchups.every((m) => m.home === false)).toBe(true)
    expect(goldschmidt?.matchups.every((m) => m.date === null)).toBe(true)
  })

  it('marks home series (no @ prefix) and canonicalises team codes', () => {
    const nootbaar = result.rows.find((row) => row.player_name === 'Lars Nootbaar')
    // "ARI4, MIA3" → home games; ARI canonicalises to the MLB-API code AZ.
    expect(nootbaar?.matchups.every((m) => m.home === true)).toBe(true)
    expect(nootbaar?.matchups.some((m) => m.opponent === 'AZ')).toBe(true)
  })

  it('captures the analyst writeup per player', () => {
    expect(result.rows.every((row) => (row.blurb?.length ?? 0) > 0)).toBe(true)
    const goldschmidt = result.rows.find((row) => row.player_name === 'Paul Goldschmidt')
    expect(goldschmidt?.blurb).toContain('under-rostered')
  })
})

describe('parseCbsStreamerArticle — pitchers (issue #20)', () => {
  const result = parseCbsStreamerArticle(PITCHERS_URL, pitchersHtml, 'pitchers')

  it('parses all ten sleeper pitchers', () => {
    expect(result.kind).toBe('pitchers')
    expect(result.rows).toHaveLength(10)
  })

  it('flags two-start arms from the plural "Matchups" cell', () => {
    const rodriguez = result.rows.find((row) => row.player_name === 'Eduardo Rodriguez')
    // "at STL, at TB" → two away starts.
    expect(rodriguez?.two_start).toBe(true)
    expect(rodriguez?.games).toBe(2)
    expect(rodriguez?.matchups.map((m) => m.opponent)).toEqual(['STL', 'TB'])
    expect(rodriguez?.matchups.every((m) => m.home === false)).toBe(true)
  })

  it('treats a single "Matchup" cell as a one-start, non-two-start pitcher', () => {
    const sasaki = result.rows.find((row) => row.player_name === 'Roki Sasaki')
    expect(sasaki?.two_start).toBe(false)
    expect(sasaki?.games).toBe(1)
    expect(sasaki?.matchups).toHaveLength(1)
  })
})

describe('deriveStreamerWeek', () => {
  it('returns the Monday–Sunday window for a Monday publish date', () => {
    expect(deriveStreamerWeek('2026-06-22T09:30:00+00:00')).toEqual({
      weekStart: '2026-06-22',
      weekEnd: '2026-06-28',
    })
  })

  it('rolls a Sunday publish date back to that ISO week', () => {
    expect(deriveStreamerWeek('2026-06-28T12:00:00Z')).toEqual({
      weekStart: '2026-06-22',
      weekEnd: '2026-06-28',
    })
  })

  it('returns null for missing or unparseable dates', () => {
    expect(deriveStreamerWeek(null)).toBeNull()
    expect(deriveStreamerWeek('not-a-date')).toBeNull()
  })
})

describe('enrichStreamerMatchupDates', () => {
  it('attaches a distinct game date to each matchup in a series', () => {
    const rows = [
      {
        player_name: 'Paul Goldschmidt',
        mlb_team: 'NYY',
        positions: ['1B'],
        games: 3,
        two_start: false,
        blurb: null,
        matchups: [
          { date: null, opponent: 'DET', home: false },
          { date: null, opponent: 'DET', home: false },
          { date: null, opponent: 'BOS', home: false },
        ],
      },
    ]
    const schedule = new Map([
      [
        'NYY',
        [
          { date: '2026-06-23', home: 'DET', away: 'NYY' },
          { date: '2026-06-24', home: 'DET', away: 'NYY' },
          { date: '2026-06-26', home: 'BOS', away: 'NYY' },
        ],
      ],
    ])

    const [enriched] = enrichStreamerMatchupDates(rows, schedule)
    expect(enriched.matchups.map((m) => m.date)).toEqual(['2026-06-23', '2026-06-24', '2026-06-26'])
  })

  it('leaves dates null when the schedule has no matching game', () => {
    const rows = [
      {
        player_name: 'Unknown Bat',
        mlb_team: 'NYY',
        positions: [],
        games: 1,
        two_start: false,
        blurb: null,
        matchups: [{ date: null, opponent: 'TOR', home: true }],
      },
    ]
    const [enriched] = enrichStreamerMatchupDates(rows, new Map())
    expect(enriched.matchups[0].date).toBeNull()
  })
})
