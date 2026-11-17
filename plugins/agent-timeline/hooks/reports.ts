import type { EngineInterface } from 'claude-code'

import type { Board, Report } from '../types'
import { STATUS_LABEL } from './plan'
import { change, readBoard } from './state'
import { hhmm } from './text'

/** Each level's interval: 15 minutes, 1 hour, 4 hours. A higher level combines the level below. */
const LEVEL_MS = [15 * 60_000, 60 * 60_000, 4 * 60 * 60_000]
const KEEP_MS = 7 * 24 * 60 * 60_000
const KEEP_COUNT = 60
const REPORT_MAX = 600
const RETRY_MS = 5 * 60_000
/** The most events of one interval sent to the model. */
const MAX_EVENTS = 40

type Due = { level: number; from: number; isQuiet: boolean }

/**
 * The lowest level whose interval has passed, and whether anything happened
 * in it: tool calls for the first level, reports of the level below for the
 * others. A quiet interval is skipped without asking the model.
 */
function dueReport(b: Board, now: number): Due | undefined {
  for (const [level, ms] of LEVEL_MS.entries()) {
    const from = b.reportedTo[level] ?? b.planAt ?? b.startedAt
    if (from === undefined || now - from < ms) continue
    const isQuiet =
      level === 0 ? (b.lastToolAt ?? 0) <= from : !b.reports.some(r => r.level === level - 1 && r.to > from)
    return { level, from, isQuiet }
  }
  return undefined
}

const FORMAT = [
  '日本語で短い進捗レポートを書いてください。',
  '次の 3 つの見出しを使います: 進捗 / 未確定事項 / ユーザーにお願いしたいこと。',
  '見出しは「**進捗**」の形で 1 行に書き、その下に「- 」で始まる箇条書きを 1〜3 個書きます。',
  '該当がなければ「なし」と書きます。結果を先に書き、全体で 400 字以内にします。',
].join('\n')

/**
 * The first level gives the small model what the board recorded: the plan,
 * the interval's events and the last prompt and recap. It does not see the
 * conversation, so the report says only what these show.
 */
function firstLevelPrompt(b: Board, from: number, to: number): string {
  const plan = b.steps.map(s => `- [${STATUS_LABEL[s.status]}] ${s.content}`).join('\n')
  const events = b.events
    .filter(e => e.at > from && e.at <= to)
    .slice(-MAX_EVENTS)
    .map(e => `${hhmm(e.at)} ${e.kind} ${e.text}`)
    .join('\n')
  return [
    `${hhmm(from)} から ${hhmm(to)} までの作業の記録から、${FORMAT}`,
    '記録にないことは書きません。',
    `現在の計画:\n${plan || 'なし'}`,
    `この間の出来事:\n${events || 'なし'}`,
    `直近の指示:\n${b.lastPrompt?.text ?? 'なし'}`,
    `直近のまとめ:\n${b.lastRecap?.text ?? 'なし'}`,
  ].join('\n\n')
}

/** A higher level asks a small model to combine the reports below it. */
function rollupPrompt(reports: Report[], from: number, to: number): string {
  const body = reports.map(r => `[${hhmm(r.from)}–${hhmm(r.to)}]\n${r.text}`).join('\n\n')
  return `${hhmm(from)} から ${hhmm(to)} までの短いレポートをまとめます。${FORMAT}\n\n${body}`
}

/** Marks a level reported up to `to`, keeping `report` when there is one. */
function reported(b: Board, level: number, to: number, report?: Report): Board {
  const reportedTo = [...b.reportedTo]
  reportedTo[level] = to
  if (report === undefined) return { ...b, reportedTo }
  const reports = [...b.reports, report].filter(r => to - r.to < KEEP_MS).slice(-KEEP_COUNT)
  return { ...b, reports, reportedTo }
}

function toReport(level: number, from: number, to: number, text: string): Report {
  const body = text.trim()
  return { level, from, to, text: body.length > REPORT_MAX ? `${body.slice(0, REPORT_MAX - 1)}…` : body }
}

// One report at a time; after a failed call, wait before asking again.
let isReporting = false
let retryAt = 0

/** Every report is written by a small model from what the board recorded. */
async function complete($: EngineInterface, prompt: string) {
  return $.model.complete({ model: 'haiku', prompt, maxTokens: 800 })
}

function promptFor(b: Board, due: Due, now: number): string {
  if (due.level === 0) return firstLevelPrompt(b, due.from, now)
  const below = b.reports.filter(r => r.level === due.level - 1 && r.to > due.from)
  return rollupPrompt(below, due.from, now)
}

/** Writes the report that is due, if any. Runs from the minute timer. */
export async function runReports($: EngineInterface): Promise<void> {
  const now = await $.clock.now()
  if (isReporting || now < retryAt) return
  const due = dueReport(await readBoard($), now)
  if (due === undefined) return
  isReporting = true
  try {
    const r = due.isQuiet ? undefined : await complete($, promptFor(await readBoard($), due, now))
    if (r !== undefined && !r.isAnswered) retryAt = now + RETRY_MS
    else {
      const text = r?.text.trim() ?? ''
      const report = text === '' ? undefined : toReport(due.level, due.from, now, text)
      await change($, b => reported(b, due.level, now, report))
    }
  } catch {
    retryAt = now + RETRY_MS
  } finally {
    isReporting = false
  }
}

/**
 * `/timeline report`: writes a first-level report now, whatever the interval,
 * and says what the call cost.
 */
export async function reportNow($: EngineInterface): Promise<string> {
  if (isReporting) return 'レポートを作成中です。'
  const now = await $.clock.now()
  const b = await readBoard($)
  const from = b.reportedTo[0] ?? b.planAt ?? b.startedAt ?? now - (LEVEL_MS[0] ?? 0)
  isReporting = true
  try {
    const r = await complete($, firstLevelPrompt(b, from, now))
    if (!r.isAnswered) return `レポートを作成できませんでした (${r.reason})。`
    const report = toReport(0, from, now, r.text)
    await change($, x => reported(x, 0, now, report))
    const u = r.usage
    return [
      report.text,
      '',
      `トークン (haiku): 入力 ${u.input_tokens} · 出力 ${u.output_tokens}`,
    ].join('\n')
  } catch (err) {
    return `レポートを作成できませんでした (${String(err).slice(0, 80)})。`
  } finally {
    isReporting = false
  }
}
