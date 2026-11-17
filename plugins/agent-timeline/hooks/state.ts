import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Board, Card } from '../types'
import { EMPTY } from './board'
import { lookupIdentity, readChildren, writeCard } from './cards'
import type { Identity } from './cards'

// The one file that reads and writes the mod's state: the state scan only
// accepts an atom in the file that defines it. Change a shape tag when its
// value's fields change: it declines what an earlier version stored.
const board = atom({ plugin: 'agent-timeline', key: 'board' } as const, EMPTY, { shape: 'board-3' })
const children = atom({ plugin: 'agent-timeline', key: 'cards' } as const, [] as Card[], { shape: 'cards-1' })
const openId = atom({ plugin: 'agent-timeline', key: 'openId' } as const, '', { shape: 'open-1' })
const tick = atom({ plugin: 'agent-timeline', key: 'tick' } as const, 0, { shape: 'tick-1' })

/** This session: set by `start` after every reload. */
export const me: Identity & { id: string; home: string } = { id: '', home: '' }

// Reads for drawing: a render hook that calls one redraws when it changes.
export async function readBoard($: EngineInterface): Promise<Board> {
  return read($, board)
}
export async function readChildCards($: EngineInterface): Promise<Card[]> {
  return read($, children)
}
export async function readOpenId($: EngineInterface): Promise<string> {
  return read($, openId)
}
export async function readTick($: EngineInterface): Promise<number> {
  return read($, tick)
}

async function writeOwnCard($: EngineInterface): Promise<void> {
  if (me.id === '' || me.home === '') return
  const { localId, parentId, title } = me
  const card: Card = {
    id: me.id,
    localId,
    parentId,
    title,
    cwd: await $.session.cwd(),
    savedAt: await $.clock.now(),
    board: await read($, board),
  }
  await writeCard($, me.home, card)
}

/** Changes this session's board and writes its card for the session that started it. */
export async function change($: EngineInterface, fn: (b: Board) => Board): Promise<void> {
  await update($, board, fn)
  await writeOwnCard($)
}

/** Changes the board without writing the card: for what changes on every tool call. */
export async function changeQuietly($: EngineInterface, fn: (b: Board) => Board): Promise<void> {
  await update($, board, fn)
}

export async function start($: EngineInterface): Promise<void> {
  me.home = (await $.env.get('HOME')) ?? ''
  me.id = await $.session.id()
}

let refreshes = 0

/**
 * Asks the app who this session is until it answers (right after start its
 * session tools may not be connected yet), then once a minute for the title,
 * which the app names after the first turn and the agent may rename.
 */
async function syncIdentity($: EngineInterface): Promise<void> {
  refreshes++
  const isKnown = me.localId !== undefined
  if (isKnown ? refreshes % 6 !== 0 : refreshes > 30) return
  const found = await lookupIdentity($)
  if (found.localId === undefined) return
  const isChanged = !isKnown || found.title !== me.title
  Object.assign(me, found)
  if (isChanged) await writeOwnCard($)
}

/** Runs every 10 seconds: who this session is, and the cards of the sessions it started. */
export async function refresh($: EngineInterface): Promise<void> {
  if (me.home === '') return
  await syncIdentity($)
  if (me.localId === undefined) return
  const loaded = await readChildren($, me.home, me.localId, await $.clock.now())
  await update($, children, previous => {
    // Whether a child's history shows in full is this pane's, not the child's.
    const showAll = new Map(previous.map(c => [c.id, c.board.showAll]))
    return loaded.map(c => ({ ...c, board: { ...c.board, showAll: showAll.get(c.id) ?? false } }))
  })
}

export async function toggleOpen($: EngineInterface, id: string): Promise<void> {
  await update($, openId, cur => (cur === id ? '' : id))
}

/** Shows a board's whole history, or its last rows again: `self` for this session's. */
export async function toggleAll($: EngineInterface, id: string): Promise<void> {
  if (id === 'self') return change($, b => ({ ...b, showAll: !b.showAll }))
  await update($, children, list =>
    list.map(c => (c.id === id ? { ...c, board: { ...c.board, showAll: !c.board.showAll } } : c)),
  )
}

/** Redraws what shows elapsed time. */
export async function bumpTick($: EngineInterface): Promise<void> {
  await update($, tick, n => n + 1)
}
