export type Check = { name: string; result: 'pass' | 'fail' | 'pending' | 'skip' }
export type GithubIssue = { number: number; url: string }
export type LinearIssue = { id: string; url: string | null; title: string | null; status: string | null }
export type PrInfo = {
  branch: string
  pr: { number: number; title: string; state: string; url: string } | null
  checks: Check[]
  githubIssues: GithubIssue[]
  linearIssues: LinearIssue[]
  error: string | null
  updatedAt: string
}
export type DevServer = { pid: number; name: string; command: string; ports: number[] }
export type DevServerInfo = { list: DevServer[]; error: string | null; updatedAt: string }

declare module 'claude-code' {
  interface PluginState {
    'dev-mods': { info: PrInfo | null; servers: DevServerInfo | null }
  }
}
