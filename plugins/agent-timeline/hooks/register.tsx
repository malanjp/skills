import type { Register } from 'claude-code'

import { answered, asText, ended, isInstruction, planned, prompted, started, titled, waiting, withPrs, wrapped } from './board'
import { setGoal, updateGoal } from './goal'
import type { PlanArgs } from './plan'
import { reportNow, runReports } from './reports'
import {
  bumpTick,
  change,
  changeQuietly,
  me,
  readBoard,
  readChildCards,
  readOpenId,
  readTick,
  refresh,
  start,
  toggleAll,
  toggleOpen,
} from './state'
import { ChangeCard, ProgressBand } from './ui/band'
import { TimelinePane } from './ui/pane'

const PANE = 'agent-timeline'
const TITLE = 'タイムライン'
const PLAN_TOOL = 'mcp__ccd_turn__update_plan'
const WRAP_TOOL = 'mcp__ccd_turn__wrap_up'
const TITLE_TOOL = 'mcp__ccd_session_mgmt__set_session_title'
const REFRESH_MS = 10_000
const REPORT_CHECK_MS = 60_000

const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

// The turn running now: wrap_up's recap belongs to it.
let currentTurn: string | undefined

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await start($)
    const now = await $.clock.now()
    await change($, b => started(b, now))
    await $.command.register({ name: 'timeline', description: 'タイムラインを開く (report: 定期レポートを今すぐ作成 / goal <文>: 目的を書く)' })
    void $.ui.open({ id: PANE, title: TITLE })
    await refresh($)
    $.clock.every(REFRESH_MS, () => void refresh($))
    $.clock.every(REPORT_CHECK_MS, () => {
      void bumpTick($)
      void runReports($)
    })
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await change($, ended)
    return next(e)
  })

  on('command.run', { command: 'timeline' }, async ($, e) => {
    const [sub = '', ...rest] = e.args.trim().split(/\s+/)
    if (sub === 'report') return { text: await reportNow($) }
    if (sub === 'goal') return { text: await setGoal($, rest.join(' ')) }
    const { isPlaced } = await $.ui.open({ id: PANE, title: TITLE })
    if (isPlaced) return { text: 'タイムラインを開きました。' }
    return { text: asText(await readBoard($), await $.clock.now()) }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    currentTurn = e.turnId
    const at = await $.clock.now()
    await change($, b => prompted(b, e.text, at))
    if (isInstruction(e.text)) void updateGoal($)
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const at = await $.clock.now()
    await change($, b => answered(b, e.answer, e.turnId, at))
    currentTurn = undefined
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    const isQuestion = e.tool === 'AskUserQuestion'
    if (isQuestion) await change($, b => waiting(b, true))
    const ran = await next(e)
    if (isQuestion) await change($, b => waiting(b, false))
    if (('deny' in ran && ran.deny !== undefined) || ran.isError === true) return ran

    const at = await $.clock.now()
    const args = e as unknown as Record<string, unknown>
    await changeQuietly($, b => ({ ...b, lastToolAt: at }))
    const recap = text(args.recap)
    const title = text(args.title)
    if (e.tool === PLAN_TOOL) await change($, b => planned(b, args as PlanArgs, e.tool_use_id, at))
    else if (e.tool === WRAP_TOOL && recap !== undefined)
      await change($, b => wrapped(b, recap, text(args.ask), currentTurn, at))
    else if (e.tool === TITLE_TOOL && title !== undefined) await change($, b => titled(b, title))
    else if (e.tool === 'Bash' && typeof ran.text === 'string' && ran.text.includes('/pull/')) {
      const output = ran.text
      await change($, b => withPrs(b, output, at))
    }
    return ran
  }).catch((_, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const b = await readBoard($)
    await readTick($)
    const isFinished = !b.isWorking && b.steps.every(s => s.status === 'completed')
    if (e.props.hasSurvey || b.steps.length === 0 || isFinished) return next(e)
    return <ProgressBand ui={$.ui.resolve(e)} board={b} now={await $.clock.now()} />
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== PLAN_TOOL) return next(e)
    const found = (await readBoard($)).changes.find(c => c.id === e.props.tool_use_id)
    if (found === undefined) return next(e)
    const ui = $.ui.resolve(e)
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {await next(e)}
        <ChangeCard ui={ui} change={found} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => (
    <TimelinePane
      ui={$.ui.resolve(e)}
      board={await readBoard($)}
      cwd={await $.session.cwd()}
      childCards={await readChildCards($)}
      openId={await readOpenId($)}
      home={me.home}
      now={await $.clock.now()}
      onOpen={id => void toggleOpen($, id)}
      onToggleAll={id => void toggleAll($, id)}
    />
  ))
}
