import { expect, mock, test } from 'claude-code/testing'

import { NOW, PANE, USAGE, command, engine } from './engine'

const GOAL = 'タイムライン mod に目的の表示を足す'

test('the prompts are summed up as the session goal at the top of the pane', async ($, on) => {
  mock.clock(on)
  engine(on)
  const prompts: string[] = []
  on('model.complete', (_, e) => {
    prompts.push(String(e.prompt))
    return { value: { isAnswered: true, text: GOAL, usage: USAGE } }
  })
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: '目的を表示したい', turnId: 't1' })
  // A notice the app sends is not an instruction: no new summary.
  await $.turn.start({ text: '<task-notification>x</task-notification>', turnId: 't2' })

  expect(prompts.length).toBe(1)
  expect(prompts[0]).toContain('1. 目的を表示したい')
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /^▍このセッションの目的$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: new RegExp(`^${GOAL}$`) })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^自動 · / })).toBeTruthy()
  await pane.unmount()
})

test('a goal the person writes stays until they hand it back', async ($, on) => {
  mock.clock(on)
  engine(on)
  let calls = 0
  on('model.complete', () => {
    calls++
    return { value: { isAnswered: true, text: '自動のまとめ', usage: USAGE } }
  })
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

  const set = await $.command.run(command('goal 自分で書いた 目的'))
  expect(set.text).toContain('自分で書いた 目的')
  await $.turn.start({ text: '別の指示', turnId: 't1' })
  expect(calls).toBe(0)
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /^自分で書いた 目的$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^手動 · / })).toBeTruthy()

  await $.command.run(command('goal'))
  expect(calls).toBe(1)
  expect(await pane.find({ type: 'Text', text: /^自動のまとめ$/ })).toBeTruthy()
  await pane.unmount()
})

test('a child row shows the child goal', async ($, on) => {
  mock.clock(on)
  const child = {
    id: 'child',
    localId: 'local_child',
    parentId: 'local_self',
    title: '子',
    cwd: '/home/me/repo',
    savedAt: NOW,
    board: {
      steps: [],
      events: [],
      prs: [],
      isWorking: true,
      lastAt: NOW,
      showAll: false,
      needsYou: false,
      goal: { text: '**ログイン**画面を直す', at: NOW, isManual: false },
    },
  }
  engine(on, { files: { 'child.json': JSON.stringify(child) } })
  on('mcp.call', () => ({
    value: { content: [{ type: 'text', text: JSON.stringify({ sessionId: 'local_self' }) }], isError: false },
  }))
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /^目的: ログイン画面を直す$/ })).toBeTruthy()
  await pane.unmount()
})
