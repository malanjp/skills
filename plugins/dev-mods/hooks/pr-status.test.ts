import { describe, expect, test } from 'claude-code/testing'

import { classify, extractLinear, parseGithubIssues, parseLinearIssue } from './parse'

const RUN = {
  command: 'pr-status',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

const ok = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } })
const ng = (stderr: string) => ({ value: { exitCode: 1, stdout: '', stderr, isStdoutTruncated: false, isStderrTruncated: false } })

const GH_JSON = JSON.stringify({
  number: 42,
  title: 'feat: テスト',
  state: 'OPEN',
  url: 'https://github.com/o/r/pull/42',
  statusCheckRollup: [
    { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'SUCCESS' },
    { __typename: 'CheckRun', name: 'e2e', status: 'COMPLETED', conclusion: 'FAILURE' },
    { __typename: 'CheckRun', name: 'build', status: 'IN_PROGRESS', conclusion: '' },
    { __typename: 'StatusContext', context: 'ext', state: 'PENDING' },
  ],
})

describe('classify', () => {
  test('CheckRun は完了前を pending、失敗系 conclusion を fail に分類する', () => {
    expect(classify({ name: 'a', status: 'QUEUED' }).result).toBe('pending')
    expect(classify({ name: 'a', status: 'COMPLETED', conclusion: 'TIMED_OUT' }).result).toBe('fail')
    expect(classify({ name: 'a', status: 'COMPLETED', conclusion: 'SKIPPED' }).result).toBe('skip')
  })
  test('StatusContext は state で判定する', () => {
    expect(classify({ __typename: 'StatusContext', context: 'x', state: 'SUCCESS' })).toEqual({ name: 'x', result: 'pass' })
    expect(classify({ __typename: 'StatusContext', context: 'x', state: 'ERROR' }).result).toBe('fail')
  })
})

describe('extractLinear', () => {
  test('小文字のブランチ名と本文の URL を同じ ID にまとめ、URL を付ける', () => {
    const r = extractLinear(
      'feature/abc-123-add-login',
      'test: ログイン追加 (ABC-123)',
      'Fixes <https://linear.app/example/issue/ABC-123>',
    )
    expect(r).toEqual([{ id: 'ABC-123', url: 'https://linear.app/example/issue/ABC-123', title: null, status: null }])
  })
  test('URL が無い ID は url を null にする', () => {
    expect(extractLinear('main', 'fix (ABC-1)', '')).toEqual([{ id: 'ABC-1', url: null, title: null, status: null }])
  })
  test('ID を含まなければ空', () => {
    expect(extractLinear('main', 'chore: deps', '')).toEqual([])
  })
})

describe('parseLinearIssue', () => {
  test('Linear MCP の text ブロックからタイトル・URL・状態を読む', () => {
    const content = [{ type: 'text', text: JSON.stringify({ id: 'ABC-1', title: 't', url: 'https://linear.app/x', status: 'Done' }) }]
    expect(parseLinearIssue(content)).toEqual({ title: 't', url: 'https://linear.app/x', status: 'Done' })
  })
  test('JSON でない応答やタイトル無しは null', () => {
    expect(parseLinearIssue([{ type: 'text', text: 'Issue not found' }])).toBeNull()
    expect(parseLinearIssue([{ type: 'text', text: '{}' }])).toBeNull()
    expect(parseLinearIssue(undefined)).toBeNull()
  })
})

describe('parseGithubIssues', () => {
  test('number と url を持つ要素だけを取り出す', () => {
    expect(parseGithubIssues([{ number: 7, url: 'https://github.com/o/r/issues/7' }, { url: 'x' }])).toEqual([
      { number: 7, url: 'https://github.com/o/r/issues/7' },
    ])
    expect(parseGithubIssues(null)).toEqual([])
  })
})

describe('/pr-status', () => {
  test('gh の結果から PR 番号を返す', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', async (_$, e) =>
      e.argv[0] === 'git'
        ? ok('feature/x\n')
        : ok(GH_JSON),
    )
    const { text } = await $.command.run(RUN)
    expect(text).toBe('#42 を更新しました')
  })

  test('PR が無いブランチはエラーにせず「PR はありません」を返す', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', async (_$, e) =>
      e.argv[0] === 'git'
        ? ok('main\n')
        : ng('no pull requests found for branch "main"'),
    )
    const { text } = await $.command.run(RUN)
    expect(text).toBe('main に PR はありません')
  })

  test('gh 認証切れなどはエラーとして返す', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', async (_$, e) =>
      e.argv[0] === 'git'
        ? ok('main\n')
        : ng('gh auth login required'),
    )
    const { text } = await $.command.run(RUN)
    expect(text).toBe('取得失敗: gh auth login required')
  })
})
