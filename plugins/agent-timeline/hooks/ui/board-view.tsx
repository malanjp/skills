import type { ElementTable } from 'claude-code'

import type { Board, Report, Step, TimelineEvent } from '../../types'
import { STATUS_COLOR, STATUS_LABEL, STATUS_MARK, count, percent } from '../plan'
import { hardBreaks, hhmm, plainLine } from '../text'
import { Section } from './section'

/** History rows shown before さらに表示. */
const SHOWN = 5
const BAR_WIDTH = 32
/** Report levels as the pane names them: every 15 minutes, hour, 4 hours. */
const LEVEL_LABEL = ['15分', '1時間', '4時間']

/** The plan's progress as the surface draws a bar, no wider than BAR_WIDTH. */
export function PlanBar(props: { ui: ElementTable; steps: Step[]; label: string; asCount?: boolean }) {
  const { Box, Progress } = props.ui
  const { done, total } = count(props.steps)
  if (total === 0) return null
  const valueText = props.asCount === true ? `${done}/${total}` : `${percent(done, total)}%`
  return (
    <Box width={BAR_WIDTH}>
      <Progress label={props.label} value={done} max={total} valueText={valueText} />
    </Box>
  )
}

const EVENT_COLOR: Record<TimelineEvent['kind'], string> = {
  plan: 'blue',
  step: 'gray',
  prompt: 'magenta',
  recap: 'yellow',
  pr: 'cyan',
}

function eventRow(e: TimelineEvent): { color: string; text: string } {
  if (e.kind === 'step') {
    const status = e.status ?? 'pending'
    return { color: STATUS_COLOR[status], text: `${e.text} → ${STATUS_LABEL[status]}` }
  }
  const prefix = { plan: '', prompt: '指示 ', recap: 'まとめ ', pr: 'PR ' }[e.kind]
  return { color: EVENT_COLOR[e.kind], text: `${prefix}${e.text}` }
}

/** The newest report in full; the older ones as one line each. */
function Reports({ ui, reports }: { ui: ElementTable; reports: Report[] }) {
  const { Text, Markdown } = ui
  const [latest, ...older] = [...reports].sort((a, b) => b.to - a.to || b.level - a.level)
  const span = (r: Report) => `${LEVEL_LABEL[r.level] ?? ''} · ${hhmm(r.from)}–${hhmm(r.to)}`
  return (
    <Section ui={ui} title="定期レポート" note={latest === undefined ? undefined : span(latest)}>
      {latest === undefined ? (
        <Text dimColor>作業が 15 分続くと最初のレポートができます。</Text>
      ) : (
        <Markdown text={hardBreaks(latest.text)} />
      )}
      {older.length > 0 && (
        <Text dimColor bold>
          以前のレポート
        </Text>
      )}
      {older.slice(0, 4).map(r => (
        <Text dimColor wrap="truncate-end">
          {span(r)} {plainLine(r.text.replace(/-/g, ''), 200)}
        </Text>
      ))}
    </Section>
  )
}

function goalNote(b: Board): string | undefined {
  if (b.goal === undefined) return undefined
  return `${b.goal.isManual ? '手動' : '自動'} · ${hhmm(b.goal.at)}`
}

type Props = { ui: ElementTable; board: Board; place: string; toggleKey: string; onToggle: () => void }

/** One session's board: plan, last prompt and recap, reports, history. */
export function BoardView({ ui, board, place, toggleKey, onToggle }: Props) {
  const { Box, Text, Button, Markdown } = ui
  const { done, total } = count(board.steps)
  const newest = [...board.events].reverse()
  const shown = board.showAll ? newest : newest.slice(0, SHOWN)
  const details = [
    place,
    board.startedAt === undefined ? '' : `開始 ${hhmm(board.startedAt)}`,
    board.lastAt === undefined ? '' : `最後の動き ${hhmm(board.lastAt)}`,
  ].filter(d => d !== '')

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Section ui={ui} title="このセッションの目的" note={goalNote(board)}>
        {board.goal === undefined ? (
          <Text dimColor>指示が来ると自動でまとめます。/timeline goal で自分で書けます。</Text>
        ) : (
          <Text bold>{board.goal.text}</Text>
        )}
      </Section>

      <Section ui={ui} title="計画" note={total === 0 ? undefined : `${done}/${total}`}>
        {total === 0 && <Text dimColor>まだありません。</Text>}
        <PlanBar ui={ui} steps={board.steps} label="進捗" />
        {board.steps.map(s => (
          <Text color={STATUS_COLOR[s.status]} bold={s.status === 'in_progress'} dimColor={s.status === 'completed'}>
            {STATUS_MARK[s.status]} {s.content}
          </Text>
        ))}
      </Section>

      <Section ui={ui} title="直近の指示" note={board.lastPrompt && hhmm(board.lastPrompt.at)}>
        <Text>{board.lastPrompt?.text ?? 'まだありません。'}</Text>
      </Section>

      <Section ui={ui} title="直近のまとめ" note={board.lastRecap && hhmm(board.lastRecap.at)}>
        <Markdown text={board.lastRecap?.text ?? 'まだありません。'} />
      </Section>

      <Reports ui={ui} reports={board.reports} />

      <Section ui={ui} title="履歴">
        {shown.length === 0 && <Text dimColor>まだ動きはありません。</Text>}
        {shown.map(e => {
          const row = eventRow(e)
          return (
            <Box flexDirection="row" gap={1}>
              <Text color={row.color}>●</Text>
              <Text dimColor>{hhmm(e.at)}</Text>
              <Text wrap="truncate-end">{row.text}</Text>
            </Box>
          )
        })}
        {newest.length > SHOWN && (
          <Button
            key={toggleKey}
            plain
            label={board.showAll ? '折りたたむ' : `さらに ${newest.length - SHOWN} 件を表示`}
            onPress={onToggle}
          />
        )}
      </Section>

      {board.prs.map(url => (
        <Text color="cyan">PR {url}</Text>
      ))}
      <Text dimColor>{details.join(' · ')}</Text>
    </Box>
  )
}
