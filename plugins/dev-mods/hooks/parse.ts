import type { Check, GithubIssue, LinearIssue } from '../types'

type RawCheck = {
  __typename?: string
  name?: string
  context?: string
  status?: string
  conclusion?: string
  state?: string
}

// gh pr view --json statusCheckRollup の 1 件を pass / fail / pending / skip に分類する
export function classify(raw: RawCheck): Check {
  const name = raw.name ?? raw.context ?? '(unknown)'
  // StatusContext (外部 CI) は state だけを持つ
  if (raw.__typename === 'StatusContext') {
    const s = raw.state ?? ''
    if (s === 'SUCCESS') return { name, result: 'pass' }
    if (s === 'PENDING' || s === 'EXPECTED') return { name, result: 'pending' }
    return { name, result: 'fail' }
  }
  if (raw.status !== 'COMPLETED') return { name, result: 'pending' }
  const c = raw.conclusion ?? ''
  if (c === 'SUCCESS') return { name, result: 'pass' }
  if (c === 'SKIPPED' || c === 'NEUTRAL') return { name, result: 'skip' }
  return { name, result: 'fail' }
}

export function parseChecks(rollup: unknown): Check[] {
  if (!Array.isArray(rollup)) return []
  return rollup.map(r => classify(r as RawCheck))
}

// Linear の Issue ID (例: ABC-123)。ブランチ名は小文字 (feature/abc-123-...) が慣例なので大文字小文字を区別しない
const LINEAR_ID = /\b([a-z]{2,6})-(\d+)\b/gi
const LINEAR_URL = /https:\/\/linear\.app\/[\w-]+\/issue\/([A-Za-z]{2,6}-\d+)/g

// ブランチ名・PR タイトル・本文の Linear URL から Linear Issue を集める。
// 本文に URL があればそれを使い、無い ID は URL なしで表示する
export function extractLinear(branch: string, title: string, body: string): LinearIssue[] {
  const found = new Map<string, string | null>()
  for (const m of body.matchAll(LINEAR_URL)) {
    const id = m[1]!.toUpperCase()
    found.set(id, `${m[0].slice(0, m[0].length - m[1]!.length)}${id}`)
  }
  for (const text of [branch, title]) {
    for (const m of text.matchAll(LINEAR_ID)) {
      const id = `${m[1]!.toUpperCase()}-${m[2]}`
      if (!found.has(id)) found.set(id, null)
    }
  }
  return [...found].map(([id, url]) => ({ id, url, title: null, status: null }))
}

export function parseGithubIssues(refs: unknown): GithubIssue[] {
  if (!Array.isArray(refs)) return []
  return refs.flatMap(r => {
    const { number, url } = r as { number?: unknown; url?: unknown }
    return typeof number === 'number' && typeof url === 'string' ? [{ number, url }] : []
  })
}

// Linear MCP get_issue の結果 (text ブロックの JSON) を読む。読めなければ null
export function parseLinearIssue(content: unknown): { title: string; url: string | null; status: string | null } | null {
  if (!Array.isArray(content)) return null
  const text = content.find(b => (b as { type?: unknown }).type === 'text') as { text?: unknown } | undefined
  if (typeof text?.text !== 'string') return null
  try {
    const j = JSON.parse(text.text) as { title?: unknown; url?: unknown; status?: unknown }
    if (typeof j.title !== 'string') return null
    return {
      title: j.title,
      url: typeof j.url === 'string' ? j.url : null,
      status: typeof j.status === 'string' ? j.status : null,
    }
  } catch {
    return null
  }
}
