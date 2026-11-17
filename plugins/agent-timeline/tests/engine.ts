import type { TestBody } from 'claude-code/testing'

export type On = Parameters<TestBody>[1]

export const PLAN = 'mcp__ccd_turn__update_plan'
export const NOW = 1_700_000_000_000
export const SITE = { scroll: { offset: 0, bodyRows: 40 }, view: {} } as const
export const USAGE = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

export const PANE = {
  plugin: 'agent-timeline',
  component: 'Pane',
  requestId: 'agent-timeline',
  props: { title: 'タイムライン', isFocused: false, bodyColumns: 80, placement: 'dock', ...SITE },
} as const

export const BAND = {
  plugin: 'agent-timeline',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isCollapsed: false, isWorking: true, maxRows: 10, bodyColumns: 80, ...SITE },
} as const

export function planRow(id: string) {
  return {
    plugin: 'agent-timeline',
    component: 'ToolUse',
    requestId: id,
    props: { tool_use_id: id, tool: PLAN, input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as const
}

export const STEPS = [
  { content: '調べる', status: 'completed' },
  { content: '直す', status: 'in_progress' },
  { content: '確かめる', status: 'pending' },
]

/**
 * Stands in for the engine: a home folder, the session's ids, a folder of
 * cards (`files`, by name) and a record of every card written (`writes`).
 * The clock is the test's: `mock.clock(on)`, or NOW when a test sets none.
 */
export function engine(
  on: On,
  opts: { files?: Record<string, string>; writes?: string[]; toolText?: string; isPlaced?: boolean } = {},
) {
  const files = opts.files ?? {}
  on('env.get', () => ({ value: '/home/me' }))
  on('session.id', () => ({ value: 'self' }))
  on('session.cwd', () => ({ value: '/work' }))
  on('ui.open', () => ({
    value: opts.isPlaced === false ? { isPlaced: false, reason: 'no surface' } : { isPlaced: true },
  }))
  on('fs.exists', () => ({ value: Object.keys(files).length > 0 }))
  on('fs.list', () => ({
    value: Object.keys(files).map(name => ({ name, kind: 'file', size: 1, mtimeMs: NOW, isLink: false })),
  }))
  on('fs.read', (_, e) => ({ value: files[String(e.path).split('/').pop() ?? ''] ?? '' }))
  on('fs.write', (_, e) => {
    opts.writes?.push(String(e.text))
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'timeline' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: {}, text: opts.toolText ?? 'ok' }))
  on('command.run', (_, e) => ({ text: e.args }))
}

/** Runs /timeline as the person would type it. */
export function command(args: string) {
  return {
    command: 'timeline',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 80 },
  } as const
}
