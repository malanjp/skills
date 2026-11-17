import type { Board, TimelineEvent } from '../types'
import { STATUS_LABEL, STATUS_MARK, applySteps, count, finishSteps } from './plan'
import type { PlanArgs } from './plan'
import { clip, hhmm } from './text'

// Every change to a board is a pure function here: (board, what happened, when) → board.

const MAX_EVENTS = 200
const MAX_CHANGES = 30
/** A working session with no move for this long is shown as 応答なし. */
const STALE_MS = 10 * 60 * 1000

export const EMPTY: Board = {
  steps: [],
  events: [],
  prs: [],
  isWorking: false,
  showAll: false,
  needsYou: false,
  reports: [],
  reportedTo: [],
  changes: [],
}

function withEvents(b: Board, events: TimelineEvent[], at: number): Board {
  return { ...b, events: [...b.events, ...events].slice(-MAX_EVENTS), lastAt: at }
}

export function started(b: Board, at: number): Board {
  return b.startedAt === undefined ? { ...b, startedAt: at } : b
}

/** Whether a turn's text is the person's: a notice the app sends (<task-notification>, ...) is not. */
export function isInstruction(text: string): boolean {
  return text.trim() !== '' && !/^\s*<[a-z][\w-]*[\s>]/.test(text)
}

/** A turn starts. */
export function prompted(b: Board, text: string, at: number): Board {
  const working = { ...b, isWorking: true, needsYou: false, lastAt: at }
  if (!isInstruction(text)) return working
  const prompt = clip(text, 200)
  return withEvents(
    { ...working, lastPrompt: { at, text: prompt }, title: b.title ?? clip(prompt, 40) },
    [{ at, kind: 'prompt', text: clip(prompt, 80) }],
    at,
  )
}

/** A turn ends. Its answer is the recap unless wrap_up already gave one for it. */
export function answered(b: Board, answer: string, turnId: string, at: number): Board {
  const stopped = { ...b, isWorking: false, lastAt: at }
  if (b.lastRecap?.turnId === turnId || answer.trim() === '') return stopped
  return { ...stopped, lastRecap: { at, text: clip(answer, 300), turnId } }
}

export function ended(b: Board): Board {
  return { ...b, isWorking: false, needsYou: false }
}

export function waiting(b: Board, needsYou: boolean): Board {
  return { ...b, needsYou }
}

/** One update_plan call, and what it moved for the card under its row. */
export function planned(b: Board, args: PlanArgs, id: string, at: number): Board {
  const { steps, events, isNew } = applySteps(b.steps, args, at)
  const was = new Map(b.steps.map(s => [s.content, s.status]))
  const lines = steps
    .filter(s => was.get(s.content) !== s.status)
    .map(s => `${STATUS_MARK[s.status]} ${s.content} → ${STATUS_LABEL[s.status]}`)
  const change = {
    id,
    before: isNew ? 0 : count(b.steps).done,
    after: count(steps).done,
    total: steps.length,
    lines: lines.slice(0, 5),
  }
  // Elapsed time counts from when the current plan was first made.
  const planAt = args.items !== undefined && (isNew || b.planAt === undefined) ? at : b.planAt
  return withEvents({ ...b, steps, planAt, changes: [...b.changes, change].slice(-MAX_CHANGES) }, events, at)
}

/** wrap_up: every step left is done, its recap is the turn's, and an `ask` waits on the person. */
export function wrapped(b: Board, recap: string, ask: string | undefined, turnId: string | undefined, at: number): Board {
  const { steps, events } = finishSteps(b.steps, at)
  const text = clip(recap, 300)
  return withEvents(
    { ...b, steps, lastRecap: { at, text, turnId }, needsYou: ask !== undefined && ask.trim() !== '' },
    [...events, { at, kind: 'recap', text: clip(text, 80) }],
    at,
  )
}

export function titled(b: Board, title: string): Board {
  return { ...b, title: clip(title, 60) }
}

const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g

/** Pull request links in a command's output that the board does not list yet. */
export function withPrs(b: Board, output: string, at: number): Board {
  const fresh = [...new Set(output.match(PR_URL) ?? [])].filter(url => !b.prs.includes(url))
  if (fresh.length === 0) return b
  const events = fresh.map(url => ({ at, kind: 'pr' as const, text: url }))
  return withEvents({ ...b, prs: [...b.prs, ...fresh] }, events, at)
}

type Lane = 'mine' | 'stale' | 'working' | 'stopped'

export function laneOf(b: Board, now: number): Lane {
  if (b.needsYou) return 'mine'
  if (!b.isWorking) return 'stopped'
  return now - (b.lastAt ?? b.startedAt ?? now) > STALE_MS ? 'stale' : 'working'
}

export const LANE_LABEL: Record<Lane, string> = { mine: '自分の番', stale: '応答なし', working: '作業中', stopped: '停止中' }
export const LANE_COLOR: Record<Lane, string> = { mine: 'yellow', stale: 'red', working: 'blue', stopped: 'gray' }

/**
 * Time since the plan was made and, at the pace so far, time left:
 * elapsed × (1 − progress) ÷ progress. No estimate before the first step
 * is done, after the last, or while the session is not working.
 */
export function estimate(b: Board, now: number): { elapsed?: number; remaining?: number } {
  if (b.planAt === undefined) return {}
  const elapsed = now - b.planAt
  const { done, total } = count(b.steps)
  if (!b.isWorking || done === 0 || done >= total) return { elapsed }
  return { elapsed, remaining: (elapsed * (total - done)) / done }
}

/** The board as text, for /timeline where no pane can be drawn. */
export function asText(b: Board, now: number): string {
  return [
    `${LANE_LABEL[laneOf(b, now)]} · ${b.title ?? ''}`,
    ...b.steps.map(s => `- [${STATUS_LABEL[s.status]}] ${s.content}`),
    '',
    'タイムライン (新しい順):',
    ...[...b.events].reverse().slice(0, 20).map(e => `${hhmm(e.at)} ${e.kind} ${e.text}`),
  ].join('\n')
}
