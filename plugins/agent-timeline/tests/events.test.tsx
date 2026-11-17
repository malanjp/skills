import { expect, mock, test } from 'claude-code/testing'

import { NOW, PANE, PLAN, STEPS, USAGE, command, engine } from './engine'

test('the pane redraws when the plan changes after it is open', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /直す/ })).toBeUndefined()
  await $.tool.call({ tool: PLAN, tool_use_id: 'u1', items: STEPS })
  expect(await pane.find({ type: 'Text', text: /直す/ })).toBeTruthy()
  await pane.unmount()
})

test('a wrap_up that asks something puts the session on the person', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'やって', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: '直しました。', ask: 'コミットする？' })
  await $.turn.complete({ answer: '別の答え', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /自分の番/ })).toBeTruthy()
  // The wrap_up's recap stands; the turn's answer does not replace it.
  expect(await pane.find({ type: 'Markdown', text: /^直しました。$/ })).toBeTruthy()
  await pane.unmount()
})

test('a question to the person marks the session while it waits', async ($, on) => {
  mock.clock(on)
  const writes: string[] = []
  engine(on, { writes })
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] })
  expect(writes.some(w => w.includes('"needsYou":true'))).toBe(true)
  expect(writes.at(-1)?.includes('"needsYou":false')).toBe(true)
})

test('a PR link in command output is listed', async ($, on) => {
  mock.clock(on)
  engine(on, { toolText: 'created https://github.com/o/r/pull/12' })
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'Bash', command: 'gh pr create' })
  await $.tool.call({ tool: 'Bash', command: 'gh pr view' })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await pane.findAll({ type: 'Text', text: /^PR https:\/\/github\.com\/o\/r\/pull\/12$/ })).length).toBe(2)
  await pane.unmount()
})

test('/timeline answers in text where no pane is placed, with the title the agent set', async ($, on) => {
  mock.clock(on)
  engine(on, { isPlaced: false })
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_session_mgmt__set_session_title', title: '新しい名前' })
  await $.tool.call({ tool: PLAN, items: STEPS })

  const r = await $.command.run(command(''))
  expect(r.text).toContain('新しい名前')
  expect(r.text).toContain('- [進行中] 直す')
})

test('/timeline report writes a report now and says what it cost', async ($, on) => {
  mock.clock(on)
  engine(on)
  on('model.complete', () => ({ value: { isAnswered: true, text: '**進捗**\n- 直した', usage: USAGE } }))
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

  const r = await $.command.run(command('report'))
  expect(r.text).toContain('- 直した')
  expect(r.text).toContain('トークン (haiku): 入力 1')
  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Markdown', text: /直した/ })).toBeTruthy()
  await pane.unmount()
})

test('the history shows five rows until asked for all', async ($, on) => {
  mock.clock(on)
  engine(on)
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  for (let i = 1; i <= 7; i++) await $.turn.start({ text: `指示${i}`, turnId: `t${i}` })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /^指示 指示1$/ })).toBeUndefined()
  await pane.press({ key: 'all-self' })
  expect(await pane.find({ type: 'Text', text: /^指示 指示1$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Button', text: /折りたたむ/ })).toBeTruthy()
  await pane.unmount()
})

test('a child opens to its own board', async ($, on) => {
  mock.clock(on)
  const child = {
    id: 'child',
    localId: 'local_child',
    parentId: 'local_self',
    title: '子',
    cwd: '/home/me/repo',
    savedAt: NOW,
    board: {
      steps: [{ content: 'テストを書く', status: 'in_progress' }],
      events: [],
      prs: [],
      isWorking: true,
      lastAt: NOW,
      showAll: false,
      needsYou: false,
      lastPrompt: { at: NOW, text: '子への指示' },
    },
  }
  engine(on, { files: { 'child.json': JSON.stringify(child) } })
  on('mcp.call', () => ({
    value: { content: [{ type: 'text', text: JSON.stringify({ sessionId: 'local_self' }) }], isError: false },
  }))
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /^子への指示$/ })).toBeUndefined()
  await pane.press({ key: 'open-child' })
  expect(await pane.find({ type: 'Text', text: /^子への指示$/ })).toBeTruthy()
  await pane.unmount()
})
