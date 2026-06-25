import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parsePitcherListProspectsPage } from '../../vite.config'

const fixtureDir = path.dirname(fileURLToPath(import.meta.url))
const pitcherListHtml = readFileSync(
  path.join(fixtureDir, '__fixtures__', 'pitcherlist-prospects.html'),
  'utf8'
)

describe('parsePitcherListProspectsPage (issue #30 regression)', () => {
  it('parses rows from the live "Previous Rank" table header', () => {
    const rows = parsePitcherListProspectsPage(pitcherListHtml)

    // Before the fix the header matcher required the wording "Previous Ranking",
    // so the live "Previous Rank" header matched nothing and zero rows parsed.
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((row) => row.source === 'pitcherlist')).toBe(true)
  })

  it('maps rank, name, org, and positions from the table cells', () => {
    const rows = parsePitcherListProspectsPage(pitcherListHtml)
    const top = rows.find((row) => row.rank === 1)

    expect(top).toMatchObject({
      rank: 1,
      player_name: 'Leo De Vries',
      org: 'ATH',
      positions: ['SS', '3B'],
    })
  })
})
