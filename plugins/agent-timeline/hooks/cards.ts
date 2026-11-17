import type { EngineInterface } from 'claude-code'

import type { Card } from '../types'
import { EMPTY } from './board'

// Each session writes its board as a card in one shared folder, which is
// how a parent sees its children. These are the folder's reads and writes.

/** Cards older than this are left off the board. */
const HIDE_MS = 24 * 60 * 60 * 1000

const cardDir = (home: string): string => `${home}/.claude/agent-board`

function isCard(value: unknown): value is Card {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<Card>
  return (
    typeof c.id === 'string' &&
    typeof c.cwd === 'string' &&
    typeof c.savedAt === 'number' &&
    typeof c.board === 'object' &&
    c.board !== null &&
    Array.isArray(c.board.steps) &&
    Array.isArray(c.board.events)
  )
}

/** Writes a card; a failed write only costs the board one update. */
export async function writeCard($: EngineInterface, home: string, card: Card): Promise<void> {
  try {
    await $.fs.write(`${cardDir(home)}/${card.id}.json`, JSON.stringify(card))
  } catch (err) {
    $.ui.status(`agent-timeline: 書き込みに失敗 (${String(err).slice(0, 80)})`)
  }
}

/** The cards of the sessions `parentId` started, newest first; unreadable files are skipped. */
export async function readChildren($: EngineInterface, home: string, parentId: string, now: number): Promise<Card[]> {
  const dir = cardDir(home)
  if (!(await $.fs.exists(dir))) return []
  const cards: Card[] = []
  for (const entry of await $.fs.list(dir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.json') || now - entry.mtimeMs > HIDE_MS) continue
    try {
      const parsed: unknown = JSON.parse(await $.fs.read(`${dir}/${entry.name}`))
      // A card from an older version lacks the newer fields: fill them in.
      if (isCard(parsed) && parsed.parentId === parentId) cards.push({ ...parsed, board: { ...EMPTY, ...parsed.board } })
    } catch {
      // A card being written right now: the next refresh reads it.
    }
  }
  return cards.sort((a, b) => b.savedAt - a.savedAt)
}

/** Who this session is in the desktop app: its id, the session that started it, its title. */
export type Identity = { localId?: string; parentId?: string; title?: string }

/**
 * Asks the desktop app. Outside the desktop app the server is missing and
 * the call fails: the board then shows this session alone.
 */
export async function lookupIdentity($: EngineInterface): Promise<Identity> {
  try {
    const result = await $.mcp.call('ccd_session_mgmt', 'get_session', { session_id: 'self' })
    if (result.isError) return {}
    const block = result.content.find(c => c.type === 'text')
    const text = block !== undefined && 'text' in block && typeof block.text === 'string' ? block.text : ''
    const s = JSON.parse(text) as { sessionId?: unknown; parentSessionId?: unknown; detached?: unknown; title?: unknown }
    return {
      localId: typeof s.sessionId === 'string' ? s.sessionId : undefined,
      title: typeof s.title === 'string' && s.title !== '' ? s.title : undefined,
      parentId: typeof s.parentSessionId === 'string' && s.detached !== true ? s.parentSessionId : undefined,
    }
  } catch {
    return {}
  }
}
