import type { DevServer, DevServerInfo } from '../types'
import { clean } from './parse'

export type Proc = { pid: number; ppid: number; command: string }
export type Listen = { name: string; addrs: string[] }

// Bash ツールのコマンドはエンジン直下の `<shell> -c ...` で動く。
// MCP サーバなどエンジンの他の子プロセスも待受することがあるので、シェルの配下だけを対象にする
const SHELL = /^(\S*\/)?(zsh|bash|sh) -c /
const MAX_COMMAND = 200

// `ps -axo pid=,ppid=,command=` の出力を読む
export function parsePs(text: string): Proc[] {
  const out: Proc[] = []
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (m) out.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] ?? '' })
  }
  return out
}

// エンジン直下のシェルとその子孫を pid からコマンドへの対応で返す
export function bashDescendants(procs: Proc[], enginePid: number): Map<number, string> {
  const children = new Map<number, Proc[]>()
  for (const p of procs) children.set(p.ppid, [...(children.get(p.ppid) ?? []), p])
  const found = new Map<number, string>()
  const queue = (children.get(enginePid) ?? []).filter(p => SHELL.test(p.command))
  while (queue.length > 0) {
    const p = queue.shift()!
    if (found.has(p.pid)) continue
    found.set(p.pid, p.command)
    queue.push(...(children.get(p.pid) ?? []))
  }
  return found
}

// `lsof -Fpcn` の出力を pid ごとのプロセス名と待受アドレスにまとめる
export function parseLsof(text: string): Map<number, Listen> {
  const out = new Map<number, Listen>()
  let cur: Listen | null = null
  for (const line of text.split('\n')) {
    const tag = line[0]
    const val = line.slice(1)
    if (tag === 'p') {
      const pid = Number(val)
      cur = out.get(pid) ?? { name: '', addrs: [] }
      out.set(pid, cur)
    } else if (tag === 'c' && cur) {
      cur.name = val
    } else if (tag === 'n' && cur && !cur.addrs.includes(val)) {
      cur.addrs.push(val)
    }
  }
  return out
}

// `127.0.0.1:3000` や `[::1]:3000` や `*:3000` からポート番号を取る
export function portOf(addr: string): number | null {
  const port = Number(addr.slice(addr.lastIndexOf(':') + 1))
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null
}

export function toServers(commands: Map<number, string>, listens: Map<number, Listen>): DevServer[] {
  const out: DevServer[] = []
  for (const [pid, l] of listens) {
    const command = commands.get(pid)
    if (command === undefined) continue
    const ports = [...new Set(l.addrs.map(portOf).filter((p): p is number => p !== null))].sort((a, b) => a - b)
    if (ports.length === 0) continue
    out.push({ pid, name: clean(l.name), command: clean(command).slice(0, MAX_COMMAND), ports })
  }
  return out.sort((a, b) => (a.ports[0] ?? 0) - (b.ports[0] ?? 0))
}

export const NO_SERVERS = 'このセッションで起動した開発サーバはありません'

export function summarize(v: DevServerInfo): string {
  if (v.error) return `取得失敗: ${v.error}`
  if (v.list.length === 0) return NO_SERVERS
  return v.list.map(s => `${s.ports.map(p => `:${p}`).join(' ')} ${s.name} (pid ${s.pid})`).join('\n')
}

// ステータス行に出す文字列。サーバが無ければ undefined で消す
export function statusText(v: DevServerInfo): string | undefined {
  return v.list.length > 0 ? `dev ${v.list.flatMap(s => s.ports.map(p => `:${p}`)).join(' ')}` : undefined
}
