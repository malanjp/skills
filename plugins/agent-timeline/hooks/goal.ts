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

function goalPrompt(prompts: string[], current: string | undefined): string {
  return [
    'Claude Code のセッションで、ユーザーが出した指示を古い順に並べます。',
    'このセッションでやるべきことを、日本語で 1〜3 行にまとめてください。',
    '途中で方針が変わっていれば新しい指示を優先します。挨拶や前置きは書かず、まとめだけを返します。',
    current === undefined ? '' : `いまのまとめ (変える必要がなければそのまま返す):\n${current}`,
    `指示:\n${prompts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
  ]
    .filter(s => s !== '')
    .join('\n\n')
}

function clipGoal(text: string): string {
  const body = text.trim()
  return body.length > GOAL_MAX ? `${body.slice(0, GOAL_MAX - 1)}…` : body
}

let isUpdating = false

/** After a prompt: has haiku sum up the prompts again, unless the person wrote the goal. */
export async function updateGoal($: EngineInterface): Promise<void> {
  const b = await readBoard($)
  const prompts = promptsOf(b)
  if (isUpdating || b.goal?.isManual === true || prompts.length === 0) return
  isUpdating = true
  try {
    const r = await $.model.complete({ model: 'haiku', prompt: goalPrompt(prompts, b.goal?.text), maxTokens: 300 })
    if (!r.isAnswered || r.text.trim() === '') return
    const at = await $.clock.now()
    const text = clipGoal(r.text)
    // The person may have written the goal while the model was answering.
    await change($, x => (x.goal?.isManual === true ? x : { ...x, goal: { text, at, isManual: false } }))
  } catch {
    // The next prompt tries again.
  } finally {
    isUpdating = false
  }
}

/** `/timeline goal <text>` writes the goal; `/timeline goal` alone hands it back to the prompts. */
export async function setGoal($: EngineInterface, text: string): Promise<string> {
  const at = await $.clock.now()
  if (text.trim() === '') {
    await change($, b => ({ ...b, goal: b.goal && { ...b.goal, isManual: false } }))
    void updateGoal($)
    return '目的を指示からの自動まとめに戻しました。'
  }
  const goal = { text: clipGoal(text), at, isManual: true }
  await change($, b => ({ ...b, goal }))
  return `目的を設定しました: ${goal.text}`
}
