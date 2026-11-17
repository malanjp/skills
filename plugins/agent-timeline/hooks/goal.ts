import type { EngineInterface } from 'claude-code'

import type { Board } from '../types'
import { change, readBoard } from './state'

const GOAL_MAX = 200
/** The prompts the summary is made from: the latest ones. */
const MAX_PROMPTS = 20

/** The person's prompts so far, oldest first: the history keeps them clipped, the last one in full. */
function promptsOf(b: Board): string[] {
  const clipped = b.events.filter(e => e.kind === 'prompt').map(e => e.text)
  if (b.lastPrompt === undefined) return clipped.slice(-MAX_PROMPTS)
  return [...clipped.slice(0, -1), b.lastPrompt.text].slice(-MAX_PROMPTS)
}

function goalPrompt(prompts: string[]): string {
  return [
    'Claude Code のセッションで、ユーザーが出した指示を古い順に並べます。',
    'このセッションでやるべきことを、日本語で 1〜3 行にまとめてください。',
    '途中で方針が変わっていれば新しい指示を優先します。挨拶や前置きは書かず、まとめだけを返します。',
    `指示:\n${prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
  ].join('\n\n')
}

function clipGoal(text: string): string {
  const body = text.trim()
  return body.length > GOAL_MAX ? `${body.slice(0, GOAL_MAX - 1)}…` : body
}

let isUpdating = false

/**
 * Has haiku sum up the prompts as the goal. Without `isForced` it only fills a goal not set yet:
 * once set, the goal changes only when the person asks with /timeline goal.
 */
async function summarize($: EngineInterface, isForced: boolean): Promise<void> {
  const b = await readBoard($)
  const prompts = promptsOf(b)
  if (isUpdating || prompts.length === 0) return
  if (!isForced && b.goal !== undefined) return
  isUpdating = true
  try {
    const r = await $.model.complete({ model: 'haiku', prompt: goalPrompt(prompts), maxTokens: 300 })
    if (!r.isAnswered || r.text.trim() === '') return
    const at = await $.clock.now()
    const text = clipGoal(r.text)
    // The person may have written the goal while the model was answering.
    await change($, x => (x.goal?.isManual === true ? x : { ...x, goal: { text, at, isManual: false } }))
  } catch {
    // Without a goal yet, the next prompt tries again.
  } finally {
    isUpdating = false
  }
}

/** After a prompt: sums up the goal the first time only. */
export async function initGoal($: EngineInterface): Promise<void> {
  await summarize($, false)
}

/** `/timeline goal <text>` writes the goal; `/timeline goal` alone sums up the prompts so far again. */
export async function setGoal($: EngineInterface, text: string): Promise<string> {
  const at = await $.clock.now()
  if (text.trim() === '') {
    await change($, b => ({ ...b, goal: b.goal && { ...b.goal, isManual: false } }))
    void summarize($, true)
    return '目的をこれまでの指示からまとめ直します。'
  }
  const goal = { text: clipGoal(text), at, isManual: true }
  await change($, b => ({ ...b, goal }))
  return `目的を設定しました: ${goal.text}`
}
