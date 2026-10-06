import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Check, LinearIssue, PrInfo } from '../types'
import { extractLinear, parseChecks, parseGithubIssues, parseLinearIssue } from './parse'

const PANE = 'pr-status'
const POLL_MS = 10_000
const info = atom({ plugin: 'dev-mods', key: 'info' } as const, null)

const ICON: Record<Check['result'], string> = { pass: '✓', fail: '✗', pending: '…', skip: '-' }

const LINEAR_SERVER = 'claude.ai Linear'
// Linear の状態は頻繁に変わらないので、10 秒ごとの更新で毎回 MCP を呼ばない
const LINEAR_TTL_MS = 5 * 60_000
const linearCache = new Map<string, { at: number; issue: LinearIssue }>()

// Linear MCP が使えればタイトルと状態を補う。未接続や失敗時は ID だけで表示する
async function enrichLinear($: EngineInterface, issue: LinearIssue): Promise<LinearIssue> {
  const hit = linearCache.get(issue.id)
  if (hit && Date.now() - hit.at < LINEAR_TTL_MS) return { ...hit.issue, url: hit.issue.url ?? issue.url }
  try {
    const r = await $.mcp.call(LINEAR_SERVER, 'get_issue', { id: issue.id, fields: ['title', 'url', 'status'] })
    const got = r.isError ? null : parseLinearIssue(r.content)
    const merged = got ? { ...issue, ...got, url: got.url ?? issue.url } : issue
    linearCache.set(issue.id, { at: Date.now(), issue: merged })
    return merged
  } catch {
    return issue
  }
}

// gh が 10 秒以上かかったとき、前回の取得と重ならないようにする
let inFlight: Promise<PrInfo> | null = null

function refresh($: EngineInterface): Promise<PrInfo> {
  inFlight ??= fetchInfo($).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function fetchInfo($: EngineInterface): Promise<PrInfo> {
  const now = new Date().toLocaleTimeString('ja-JP')
  const next: PrInfo = { branch: '', pr: null, checks: [], githubIssues: [], linearIssues: [], error: null, updatedAt: now }
  try {
    const b = await $.process.run(['git', 'branch', '--show-current'])
    next.branch = b.exitCode === 0 ? b.stdout.trim() : '(git 外)'
    let body = ''
    const r = await $.process.run(
      ['gh', 'pr', 'view', '--json', 'number,title,state,url,body,statusCheckRollup,closingIssuesReferences'],
      { timeoutMs: 20_000 },
    )
    if (r.exitCode !== 0) {
      // PR が無いブランチは gh が非 0 で終わる。エラーではなく「PR なし」として表示する
      if (!/no pull requests found/i.test(r.stderr)) next.error = r.stderr.trim().split('\n')[0] ?? 'gh 失敗'
    } else {
      const j = JSON.parse(r.stdout) as {
        number: number
        title: string
        state: string
        url: string
        body: string
        statusCheckRollup: unknown
        closingIssuesReferences: unknown
      }
      next.pr = { number: j.number, title: j.title, state: j.state, url: j.url }
      next.checks = parseChecks(j.statusCheckRollup)
      next.githubIssues = parseGithubIssues(j.closingIssuesReferences)
      body = j.body ?? ''
    }
    next.linearIssues = await Promise.all(extractLinear(next.branch, next.pr?.title ?? '', body).map(i => enrichLinear($, i)))
  } catch (err) {
    next.error = err instanceof Error ? err.message : String(err)
  }
  await update($, info, () => next)
  return next
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pr-status', description: 'PR と CI 状態のパネルを開いて更新する' })
    void $.ui.open({ id: PANE, title: 'PR / CI' })
    void refresh($).catch(() => undefined)
    $.clock.every(POLL_MS, () => void refresh($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'pr-status' }, async $ => {
    await $.ui.open({ id: PANE, title: 'PR / CI' })
    const r = await refresh($)
    if (r.error) return { text: `取得失敗: ${r.error}` }
    return { text: r.pr ? `#${r.pr.number} を更新しました` : `${r.branch} に PR はありません` }
  })

  // push や gh 操作の直後は CI 状態が変わるので即時更新する
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    try {
      const cmd = e.command
      if (/\bgit (push|checkout|switch)\b|\bgh pr\b/.test(cmd)) void refresh($).catch(() => undefined)
    } catch {
      // パネル更新の失敗でツール結果を壊さない
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Link } = $.ui.resolve(e)
    const v = await read($, info)
    if (!v) return <Text dimColor>読み込み中…</Text>

    const count = (k: Check['result']) => v.checks.filter(c => c.result === k).length
    const failed = v.checks.filter(c => c.result === 'fail')
    const pending = v.checks.filter(c => c.result === 'pending')
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 8)

    return (
      <Box flexDirection="column">
        <Text dimColor>branch: {v.branch}</Text>
        {v.linearIssues.length > 0 && (
          <Box flexDirection="column">
            {v.linearIssues.map(i => (
              <Text>
                {i.url ? <Link href={i.url} label={i.id} /> : i.id}
                {i.status && <Text color="cyan"> [{i.status}]</Text>}
                {i.title && <Text dimColor> {i.title}</Text>}
              </Text>
            ))}
          </Box>
        )}
        {v.githubIssues.length > 0 && (
          <Text>
            Issue: {v.githubIssues.map(i => <Link href={i.url} label={`#${i.number} `} />)}
          </Text>
        )}
        {v.error && <Text color="red">エラー: {v.error}</Text>}
        {!v.error && !v.pr && <Text dimColor>PR なし</Text>}
        {v.pr && (
          <Box flexDirection="column">
            <Text bold>
              #{v.pr.number} [{v.pr.state}]
            </Text>
            <Text>{v.pr.title}</Text>
            <Text>
              <Text color="green">✓{count('pass')}</Text> <Text color="red">✗{count('fail')}</Text>{' '}
              <Text color="yellow">…{count('pending')}</Text> <Text dimColor>-{count('skip')}</Text>
            </Text>
            {[...failed, ...pending].slice(0, room).map(c => (
              <Text color={c.result === 'fail' ? 'red' : 'yellow'}>
                {ICON[c.result]} {c.name}
              </Text>
            ))}
          </Box>
        )}
        <Text dimColor>更新 {v.updatedAt}</Text>
      </Box>
    )
  })
}
