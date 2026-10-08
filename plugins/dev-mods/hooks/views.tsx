import type { EngineInterface } from 'claude-code'

import type { Check, DevServerInfo, PrInfo } from '../types'
import { NO_SERVERS } from './servers'

// $ はインポート先へ渡せないので、描画は $.ui.resolve の結果だけを受け取る
type Ui = ReturnType<EngineInterface['ui']['resolve']>

const ICON: Record<Check['result'], string> = { pass: '✓', fail: '✗', pending: '…', skip: '-' }

export function prStatusView({ Box, Text, Link }: Ui, v: PrInfo, rows: number) {
  const count = (k: Check['result']) => v.checks.filter(c => c.result === k).length
  const failed = v.checks.filter(c => c.result === 'fail')
  const pending = v.checks.filter(c => c.result === 'pending')
  const room = Math.max(1, rows - 8)

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
}

export function devServersView({ Box, Text, Link }: Ui, v: DevServerInfo) {
  return (
    <Box flexDirection="column">
      {v.error && <Text color="red">エラー: {v.error}</Text>}
      {!v.error && v.list.length === 0 && <Text dimColor>{NO_SERVERS}</Text>}
      {v.list.map(s => (
        <Box flexDirection="column">
          <Text>
            {s.ports.map(p => (
              <Link href={`http://localhost:${p}`} label={`:${p} `} />
            ))}
            <Text bold>{s.name}</Text>
            <Text dimColor> pid {s.pid}</Text>
          </Text>
          <Text dimColor wrap="truncate-end">
            {'  '}
            {s.command}
          </Text>
        </Box>
      ))}
      <Text dimColor>更新 {v.updatedAt}</Text>
    </Box>
  )
}
