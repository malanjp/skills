import { expect, mock, test } from 'claude-code/testing'

import { NOW, PANE, PLAN, engine } from './engine'

test('plan steps and prompts become timeline rows', async ($, on) => {
  mock.clock(on)
  engine(on)

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'PR の状況を出して', turnId: 't1' })
  await $.tool.call({
    tool: PLAN,
    items: [
      { content: 'gh を調べる', status: 'in_progress' },
      { content: '画面に出す', status: 'pending' },
    ],
  })
  await $.tool.call({ tool: PLAN, advance: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /計画を作成: 2 ステップ/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /gh を調べる → 完了/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /画面に出す → 進行中/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /指示 PR の状況を出して/ }))?.text).toBeTruthy()
    expect((await ui.find({ type: 'Text', text: /作業中/ }))?.text).toBeTruthy()
    await ui.unmount()
  }
})

test('the turn answer is the recap when wrap_up gave none', async ($, on) => {
  mock.clock(on)
  engine(on)

  await $.turn.start({ text: 'やって', turnId: 't2' })
  await $.turn.complete({
    answer: '終わりました。',
    durationMs: 10,
    isAborted: false,
    turnId: 't2',
    reason: 'answer',
  })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Markdown', text: /^終わりました。$/ }))?.text).toBe('終わりました。')
  expect((await ui.find({ type: 'Text', text: /停止中/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a notice the app sends is not shown as an instruction', async ($, on) => {
  mock.clock(on)
  engine(on)

  await $.turn.start({ text: '<task-notification>\nmods loaded\n</task-notification>', turnId: 't3' })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /task-notification/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /作業中/ }))?.text).toBeTruthy()
  await ui.unmount()
})

test('a session this one started shows as a child; others do not', async ($, on) => {
  const card = (id: string, parentId: string | undefined, step: string) => ({
    id,
    localId: `local_${id}`,
    parentId,
    cwd: '/home/me/repo',
    savedAt: NOW,
    board: {
      steps: [{ content: step, status: 'in_progress' }],
      events: [],
      prs: [],
      isWorking: true,
      lastAt: NOW,
      showAll: false,
      needsYou: false,
      title: `${id}-title`,
      lastRecap: { at: NOW, text: `${id} のまとめ` },
    },
  })
  mock.clock(on)
  engine(on, { files: {
    'child.json': JSON.stringify({ ...card('child', 'local_self', 'テストを書く'), title: 'アプリでの名前' }),
    'other.json': JSON.stringify(card('other', undefined, '関係ない作業')),
  } })
  on('mcp.call', () => ({
    value: { content: [{ type: 'text', text: JSON.stringify({ sessionId: 'local_self' }) }], isError: false },
  }))

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Text', text: /子セッション/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^1 件$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Button', text: /アプリでの名前/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /テストを書く/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /^child のまとめ$/ })).toBeTruthy()
    expect(await ui.find({ type: 'Text', text: /関係ない作業/ })).toBeUndefined()
    await ui.unmount()
  }
})

