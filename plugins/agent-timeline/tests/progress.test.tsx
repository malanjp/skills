import { expect, mock, test } from 'claude-code/testing'

import { BAND, PANE, PLAN, STEPS, USAGE, engine, planRow } from './engine'

test('the band shows the plan and the row of a plan update shows what moved', async ($, on) => {
  mock.clock(on)
  engine(on)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: '直して', turnId: 't1' })
  await $.tool.call({ tool: PLAN, tool_use_id: 'u0', items: STEPS.map(s => ({ ...s, status: 'pending' })) })
  await $.tool.call({ tool: PLAN, tool_use_id: 'u1', items: STEPS })

  for (const surface of ['terminal', 'desktop'] as const) {
    const band = await $.ui.mount({ ...BAND, surface })
    expect(await band.find({ type: 'Text', text: /^33%$/ })).toBeTruthy()
    expect(await band.find({ type: 'Text', text: /直す/ })).toBeTruthy()
    await band.unmount()

    const row = await $.ui.mount({ ...planRow('u1'), surface })
    expect(await row.find({ type: 'Text', text: /^row$/ })).toBeTruthy()
    expect(await row.find({ type: 'Text', text: /進捗 0% →/ })).toBeTruthy()
    expect(await row.find({ type: 'Text', text: /調べる → 完了/ })).toBeTruthy()
    await row.unmount()
  }
})

test('a busy 15 minutes gets a report, a quiet one does not', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  // Both levels ask haiku; the hour's prompt combines the reports below it.
  let quarters = 0
  let rollups = 0
  on('model.complete', (_, e) => {
    const isRollup = String(e.prompt).includes('短いレポートをまとめます')
    if (isRollup) rollups++
    else quarters++
    return { value: { isAnswered: true, text: isRollup ? '1 時間のまとめ' : '進捗: テストが通った', usage: USAGE } }
  })

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, tool_use_id: 'u1', items: STEPS })
  await clock.advance(10 * 60_000)
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await clock.advance(6 * 60_000)
  expect(quarters).toBe(1)

  await clock.advance(16 * 60_000)
  expect(quarters).toBe(1)

  // The hour combines the 15-minute reports in it.
  await clock.advance(30 * 60_000)
  expect(rollups).toBe(1)

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  // The newest report (the hour's) in full, the older one as a line.
  expect(await pane.find({ type: 'Text', text: /^1時間 · / })).toBeTruthy()
  expect(await pane.find({ type: 'Markdown', text: /1 時間のまとめ/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /^15分 · .*テストが通った/ })).toBeTruthy()
  await pane.unmount()
})

test('a plan for other work counts its time and progress afresh', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>row</Text>
  })

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: '一つ目', turnId: 't1' })
  await $.tool.call({ tool: PLAN, tool_use_id: 'u1', items: [{ content: '古い作業', status: 'completed' }] })
  await clock.advance(60 * 60_000)
  await $.tool.call({ tool: PLAN, tool_use_id: 'u2', items: STEPS })
  await clock.advance(10 * 60_000)

  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  // Elapsed counts from the second plan (10 minutes), not the first (70).
  expect(await band.find({ type: 'Text', text: /経過 10分 · 残り 約20分/ })).toBeTruthy()
  await band.unmount()

  const row = await $.ui.mount({ ...planRow('u2'), surface: 'desktop' })
  expect(await row.find({ type: 'Text', text: /進捗 0% →/ })).toBeTruthy()
  await row.unmount()
})

test('wrap_up checks off every step left, as the app does', async ($, on) => {
  mock.clock(on)
  engine(on)

  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PLAN, tool_use_id: 'u1', items: STEPS })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', recap: '終わりました。' })

  const pane = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await pane.find({ type: 'Text', text: /^3\/3$/ })).toBeTruthy()
  expect(await pane.find({ type: 'Text', text: /○/ })).toBeUndefined()
  await pane.unmount()
})

test('the session ids are asked for again when the app was not ready at start', async ($, on) => {
  const clock = mock.clock(on)
  const writes: string[] = []
  engine(on, { writes })
  let calls = 0
  on('mcp.call', () => {
    calls++
    const text = JSON.stringify({ sessionId: 'local_child', parentSessionId: 'local_parent' })
    return { value: { content: [{ type: 'text', text }], isError: calls <= 1 } }
  })

  // Asked at start: the app is not ready yet.
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  expect(writes.some(w => w.includes('local_parent'))).toBe(false)
  // Asked again at the next refresh.
  await clock.advance(11_000)
  expect(calls).toBe(2)
  expect(writes.some(w => w.includes('"parentId":"local_parent"'))).toBe(true)
})

test('the band redraws its elapsed time each minute', async ($, on) => {
  const clock = mock.clock(on)
  engine(on)
  await $.session.start({ cwd: '/work', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: '直して', turnId: 't1' })
  await $.tool.call({ tool: PLAN, tool_use_id: 'u1', items: STEPS })
  await clock.advance(10 * 60_000)
  const band = await $.ui.mount({ ...BAND, surface: 'desktop' })
  expect(await band.find({ type: 'Text', text: /経過 10分/ })).toBeTruthy()
  await clock.advance(60_000)
  expect(await band.find({ type: 'Text', text: /経過 11分/ })).toBeTruthy()
  await band.unmount()
})
