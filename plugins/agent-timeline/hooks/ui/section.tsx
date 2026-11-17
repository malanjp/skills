import type { ElementTable, RenderChildren } from 'claude-code'

/** A section: a bold title with a mark, an optional dim note, the body indented. */
export function Section({ ui, title, note, children }: { ui: ElementTable; title: string; note?: string; children?: RenderChildren }) {
  const { Box, Text } = ui
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold color="cyan">
          ▍{title}
        </Text>
        {note !== undefined && <Text dimColor>{note}</Text>}
      </Box>
      <Box flexDirection="column" paddingLeft={2}>
        {children}
      </Box>
    </Box>
  )
}
