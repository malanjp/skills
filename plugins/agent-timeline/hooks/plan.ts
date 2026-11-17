import type { Step, StepStatus, TimelineEvent } from '../types'

const STATUSES: readonly StepStatus[] = ['pending', 'in_progress', 'completed']

export const STATUS_LABEL: Record<StepStatus, string> = { pending: '未着手', in_progress: '進行中', completed: '完了' }
export const STATUS_MARK: Record<StepStatus, string> = { pending: '○', in_progress: '◐', completed: '✓' }
export const STATUS_COLOR: Record<StepStatus, string> = { pending: 'gray', in_progress: 'blue', completed: 'green' }

type Count = { done: number; active: number; total: number }

export function count(steps: Step[]): Count {
  const of = (status: StepStatus) => steps.filter(s => s.status === status).length
  return { done: of('completed'), active: of('in_progress'), total: steps.length }
}

export function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100)
}

/** Cells of a bar `width` wide: done, in progress, pending. */
export function cells(c: Count, width: number): [number, number, number] {
  if (c.total === 0) return [0, 0, width]
  const done = Math.round((c.done / c.total) * width)
  const active = Math.min(width - done, Math.round((c.active / c.total) * width))
  return [done, active, width - done - active]
}

/** A plan for other work: none before, the last one finished, or no step in common. */
function isNewPlan(old: Step[], items: Step[]): boolean {
  return (
    old.length === 0 ||
    old.every(s => s.status === 'completed') ||
    !items.some(it => old.some(s => s.content === it.content))
  )
}

/** The arguments of one update_plan call, as the model sent them. */
export type PlanArgs = { items?: unknown; advance?: unknown; done?: unknown; start?: unknown }

type Moved = { steps: Step[]; events: TimelineEvent[] }

function toSteps(items: unknown): Step[] | undefined {
  if (!Array.isArray(items)) return undefined
  return items.flatMap(item => {
    if (typeof item !== 'object' || item === null) return []
    const { content, status } = item as { content?: unknown; status?: unknown }
    if (typeof content !== 'string') return []
    return [{ content, status: STATUSES.find(s => s === status) ?? 'pending' }]
  })
}

const stepEvent = (at: number, s: Step): TimelineEvent => ({ at, kind: 'step', text: s.content, status: s.status })

/** Sets one step's status, recording the move as an event. */
function setStatus(m: Moved, index: number, status: StepStatus, at: number): Moved {
  const step = m.steps[index]
  if (step === undefined || step.status === status) return m
  const moved = { ...step, status }
  return { steps: m.steps.map((s, i) => (i === index ? moved : s)), events: [...m.events, stepEvent(at, moved)] }
}

/** One update_plan call: `items` replaces the plan, `advance`, `done` and `start` move steps. */
export function applySteps(old: Step[], args: PlanArgs, at: number): Moved & { isNew: boolean } {
  let m: Moved = { steps: old, events: [] }
  const items = toSteps(args.items)
  const isNew = items !== undefined && isNewPlan(old, items)
  if (items !== undefined) {
    const was = new Map(old.map(s => [s.content, s.status]))
    const moved = isNew ? [] : items.filter(s => was.has(s.content) && was.get(s.content) !== s.status)
    const text = `${isNew ? '計画を作成' : '計画を更新'}: ${items.length} ステップ`
    m = { steps: items, events: [{ at, kind: 'plan', text }, ...moved.map(s => stepEvent(at, s))] }
  }
  if (args.advance === true) {
    m = setStatus(m, m.steps.findIndex(s => s.status === 'in_progress'), 'completed', at)
    m = setStatus(m, m.steps.findIndex(s => s.status === 'pending'), 'in_progress', at)
  }
  if (Array.isArray(args.done)) {
    for (const n of args.done) if (typeof n === 'number') m = setStatus(m, n - 1, 'completed', at)
  }
  if (typeof args.start === 'number') m = setStatus(m, args.start - 1, 'in_progress', at)
  return { ...m, isNew }
}

/** Every step left marked done, as the app does at wrap_up. */
export function finishSteps(old: Step[], at: number): Moved {
  return old.reduce<Moved>((m, _, i) => setStatus(m, i, 'completed', at), { steps: old, events: [] })
}
