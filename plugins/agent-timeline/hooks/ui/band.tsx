import type { ElementTable } from 'claude-code'

import type { Board, PlanChange } from '../../types'
import { estimate } from '../board'
import { cells, count, percent } from '../plan'
import { duration } from '../text'

const BAR_WIDTH = 12

/** Above the prompt: plan progress in three colors, time elapsed and left, the step now. */
export function ProgressBand({ ui, board, now }: { ui: ElementTable; board: Board; now: number }) {
  const { Box, Text } = ui
  const c = count(board.steps)
  const [done, active, pending] = cells(c, BAR_WIDTH)
  const { elapsed, remaining } = estimate(board, now)
  const facts = [
    `${c.done}/${c.total}`,
    elapsed === undefined ? '' : `経過 ${duration(elapsed)}`,
    remaining === undefined ? '' : `残り 約${duration(remaining)}`,
  ].filter(t => t !== '')
  const current = board.steps.find(s => s.status === 'in_progress')
  return (
    <Box flexDirection="row" gap={1}>
      <Text dimColor>計画</Text>
      <Text>
        <Text color="green">{'█'.repeat(done)}</Text>
        <Text color="blue">{'█'.repeat(active)}</Text>
        <Text color="gray">{'░'.repeat(pending)}</Text>
      </Text>
      <Text bold>{percent(c.done, c.total)}%</Text>
      <Text dimColor>{facts.join(' · ')}</Text>
      {current !== undefined && (
        <Text color="blue" wrap="truncate-end">
          ◐ {current.content}
        </Text>
      )}
    </Box>
  )
}

/** Under an update_plan row: the progress before and after, and what moved. */
export function ChangeCard({ ui, change }: { ui: ElementTable; change: PlanChange }) {
  const { Box, Text } = ui
  const before = percent(change.before, change.total)
  const after = percent(change.after, change.total)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text>
        進捗 {before}% → <Text bold color={after > before ? 'green' : undefined}>{after}%</Text>
        <Text dimColor>
          {' '}
          ({change.after}/{change.total})
        </Text>
      </Text>
      {change.lines.map(line => (
        <Text dimColor wrap="truncate-end">
          {line}
        </Text>
      ))}
    </Box>
  )
}
