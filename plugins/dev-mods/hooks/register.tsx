import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DevServerInfo, LinearIssue, PrInfo } from '../types'
import { clean, extractLinear, parseChecks, parseGithubIssues, parseLinearIssue } from './parse'
import { bashDescendants, parseLsof, parsePs, statusText, summarize, toServers } from './servers'
import { devServersView, prStatusView } from './views'

const PANE = 'pr-status'
const POLL_MS = 10_000
const info = atom({ plugin: 'dev-mods', key: 'info' } as const, null)

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
    next.branch = b.exitCode === 0 ? clean(b.stdout.trim()) : '(git 外)'
    let body = ''
    const r = await $.process.run(
      ['gh', 'pr', 'view', '--json', 'number,title,state,url,body,statusCheckRollup,closingIssuesReferences'],
      { timeoutMs: 20_000 },
    )
    if (r.exitCode !== 0) {
      // PR が無いブランチは gh が非 0 で終わる。エラーではなく「PR なし」として表示する
      if (!/no pull requests found/i.test(r.stderr)) next.error = clean(r.stderr.trim().split('\n')[0] ?? 'gh 失敗')
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
      next.pr = { number: j.number, title: clean(j.title), state: clean(j.state), url: clean(j.url) }
      next.checks = parseChecks(j.statusCheckRollup)
      next.githubIssues = parseGithubIssues(j.closingIssuesReferences)
      body = j.body ?? ''
    }
    next.linearIssues = await Promise.all(extractLinear(next.branch, next.pr?.title ?? '', body).map(i => enrichLinear($, i)))
  } catch (err) {
    next.error = clean(err instanceof Error ? err.message : String(err))
  }
  await update($, info, () => next)
  return next
}

const SERVERS_PANE = 'dev-servers'
const SERVERS_TITLE = '開発サーバ'
// バックグラウンド起動の直後はまだ待受していないことが多いので、少し待ってから取り直す
const SETTLE_MS = 3_000
const servers = atom({ plugin: 'dev-mods', key: 'servers' } as const, null)

// エンジンの PID はセッション中に変わらない。モジュールの再読み込みで消えてよい
let enginePid: number | null = null
let serversInFlight: Promise<DevServerInfo> | null = null

async function getEnginePid($: EngineInterface): Promise<number> {
  if (enginePid !== null) return enginePid
  // $.process.run が起動した子の親がエンジン本体になる
  const r = await $.process.run(['sh', '-c', 'echo $PPID'])
  const pid = Number(r.stdout.trim())
  if (r.exitCode !== 0 || !Number.isInteger(pid) || pid <= 1) throw new Error('エンジンの PID を取得できません')
  enginePid = pid
  return pid
}

async function fetchServers($: EngineInterface): Promise<DevServerInfo> {
  const next: DevServerInfo = { list: [], error: null, updatedAt: new Date().toLocaleTimeString('ja-JP') }
  try {
    const pid = await getEnginePid($)
    const ps = await $.process.run(['ps', '-axo', 'pid=,ppid=,command='])
    if (ps.exitCode !== 0) throw new Error(ps.stderr.trim() || 'ps 失敗')
    const commands = bashDescendants(parsePs(ps.stdout), pid)
    if (commands.size > 0) {
      // -p で絞らないと全プロセスを走査して数秒かかる
      const pids = [...commands.keys()].join(',')
      const ls = await $.process.run(['lsof', '-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-p', pids, '-Fpcn'])
      // 待受が 1 件も無いときも lsof は 1 で終わるので、stderr があるときだけ失敗とする
      if (ls.exitCode !== 0 && ls.stderr.trim()) throw new Error(ls.stderr.trim().split('\n')[0])
      next.list = toServers(commands, parseLsof(ls.stdout))
    }
  } catch (err) {
    next.error = clean(err instanceof Error ? err.message : String(err))
  }
  let before = 0
  await update($, servers, old => {
    before = old?.list.length ?? 0
    return next
  })
  $.ui.status(statusText(next))
  // 0 件から増えたときだけ開く。毎回開くと、閉じたパネルが何度も戻ってくる
  if (before === 0 && next.list.length > 0) void $.ui.open({ id: SERVERS_PANE, title: SERVERS_TITLE })
  return next
}

function refreshServers($: EngineInterface): Promise<DevServerInfo> {
  serversInFlight ??= fetchServers($).finally(() => {
    serversInFlight = null
  })
  return serversInFlight
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'pr-status', description: 'PR と CI 状態のパネルを開いて更新する' })
    void $.ui.open({ id: PANE, title: 'PR / CI' })
    void refresh($).catch(() => undefined)
    $.clock.every(POLL_MS, () => void refresh($).catch(() => undefined))
    await $.command.register({ name: 'dev-servers', description: 'このセッションで起動した開発サーバの一覧を開く' })
    void refreshServers($).catch(() => undefined)
    $.clock.every(POLL_MS, () => void refreshServers($).catch(() => undefined))
    return next(e)
  })

  on('command.run', { command: 'pr-status' }, async $ => {
    await $.ui.open({ id: PANE, title: 'PR / CI' })
    const r = await refresh($)
    if (r.error) return { text: `取得失敗: ${r.error}` }
    return { text: r.pr ? `#${r.pr.number} を更新しました` : `${r.branch} に PR はありません` }
  })

  // push や gh 操作の直後は CI 状態が変わるので即時更新する。バックグラウンド起動ではサーバ一覧も取り直す
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    try {
      const cmd = e.command
      if (/\bgit (push|checkout|switch)\b|\bgh pr\b/.test(cmd)) void refresh($).catch(() => undefined)
      if (e.run_in_background) $.clock.after(SETTLE_MS, () => void refreshServers($).catch(() => undefined))
    } catch {
      // パネル更新の失敗でツール結果を壊さない
    }
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const v = await read($, info)
    if (!v) return <ui.Text dimColor>読み込み中…</ui.Text>
    return prStatusView(ui, v, e.viewport?.rows ?? 24)
  })

  on('command.run', { command: 'dev-servers' }, async $ => {
    await $.ui.open({ id: SERVERS_PANE, title: SERVERS_TITLE })
    return { text: summarize(await refreshServers($)) }
  })

  // サーバを止めたら一覧からすぐ消す
  on('tool.call', { tool: 'TaskStop' }, async ($, e, next) => {
    const ran = await next(e)
    void refreshServers($).catch(() => undefined)
    return ran
  })

  on('ui.render', { component: 'Pane', requestId: SERVERS_PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const v = await read($, servers)
    if (!v) return <ui.Text dimColor>読み込み中…</ui.Text>
    return devServersView(ui, v)
  })
}
