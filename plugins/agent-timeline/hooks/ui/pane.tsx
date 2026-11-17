import type { ElementTable } from 'claude-code'

import type { Board, Card } from '../../types'
import { LANE_COLOR, LANE_LABEL, laneOf } from '../board'
import { hhmm, plainLine, shortPath } from '../text'
import { BoardView, PlanBar } from './board-view'
import { Section } from './section'

type Props = {
  ui: ElementTable
  board: Board
  cwd: string
  childCards: Card[]
  openId: string
  home: string
  now: number
  onOpen: (id: string) => void
  /** A board's whole history or its last rows: `self` for this session's. */
  onToggleAll: (id: string) => void
}

function titleOf(card: Card): string {
  return card.title ?? card.board.title ?? card.board.lastPrompt?.text.slice(0, 40) ?? card.id.slice(0, 8)
}

/** A child's latest summary: its last recap or report, whichever is newer. */
function summaryOf(b: Board): string {
  const report = [...b.reports].sort((x, y) => y.to - x.to)[0]
  const latest = [b.lastRecap, report && { at: report.to, text: report.text }]
    .filter(x => x !== undefined)
    .sort((x, y) => y.at - x.at)[0]
  return latest === undefined ? 'まとめはまだありません。' : plainLine(latest.text, 160)
}

function Lane({ ui, board, now }: { ui: ElementTable; board: Board; now: number }) {
  const { Text } = ui
  const lane = laneOf(board, now)
  return <Text color={LANE_COLOR[lane]}>● {LANE_LABEL[lane]}</Text>
}

/** The pane: this session's board, then a row for each session it started. */
export function TimelinePane(props: Props) {
  const { ui, board, cwd, childCards, openId, home, now, onOpen, onToggleAll } = props
  const { Box, Text, Button } = ui

  return (
    <Box flexDirection="column" gap={1} paddingX={1}>
      <Box flexDirection="row" gap={2} flexWrap="wrap">
        <Text bold>タイムライン</Text>
        <Lane ui={ui} board={board} now={now} />
        <Text dimColor>{hhmm(now)} 更新</Text>
      </Box>

      <BoardView
        ui={ui}
        board={board}
        place={shortPath(cwd, home)}
        toggleKey="all-self"
        onToggle={() => onToggleAll('self')}
      />

      {childCards.length > 0 && (
        <Section ui={ui} title="子セッション" note={`${childCards.length} 件`}>
          {childCards.map(card => {
            const isOpen = card.id === openId
            const step = card.board.steps.find(s => s.status === 'in_progress')
            return (
              <Box flexDirection="column" marginBottom={1}>
                <Box flexDirection="row" gap={1}>
                  <Lane ui={ui} board={card.board} now={now} />
                  <Button
                    key={`open-${card.id}`}
                    plain
                    label={`${isOpen ? '▾' : '▸'} ${titleOf(card)}`}
                    onPress={() => onOpen(card.id)}
                  />
                </Box>
                {card.board.goal !== undefined && (
                  <Text dimColor wrap="truncate-end">
                    目的: {plainLine(card.board.goal.text, 120)}
                  </Text>
                )}
                <PlanBar ui={ui} steps={card.board.steps} label="計画" asCount />
                {step !== undefined && (
                  <Text color="blue" wrap="truncate-end">
                    ◐ {step.content}
                  </Text>
                )}
                <Text>{summaryOf(card.board)}</Text>
                {isOpen && (
                  <Box marginTop={1}>
                    <BoardView
                      ui={ui}
                      board={card.board}
                      place={shortPath(card.cwd, home)}
                      toggleKey={`all-${card.id}`}
                      onToggle={() => onToggleAll(card.id)}
                    />
                  </Box>
                )}
              </Box>
            )
          })}
        </Section>
      )}
    </Box>
  )
}
