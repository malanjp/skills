import { describe, expect, test } from 'claude-code/testing'

import { bashDescendants, parseLsof, parsePs, portOf, toServers } from './servers'

const RUN = {
  command: 'dev-servers',
  args: '',
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 120 },
} as const

const res = (exitCode: number, stdout: string, stderr = '') => ({
  value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false },
})

// 100 がエンジン。200 は Bash ツールのシェル、300 は MCP サーバ
const PS = [
  '  100     1 /path/to/claude',
  '  200   100 /bin/zsh -c source ~/.claude/shell-snapshots/x.sh && eval pnpm dev',
  '  201   200 node /repo/node_modules/.bin/vite',
  '  202   201 esbuild --service',
  '  300   100 uv tool uvx serena',
  '  301   300 python serena start-mcp-server',
  '  400     1 node other-server.js',
].join('\n')

const LSOF = ['p201', 'cnode', 'f20', 'n127.0.0.1:5173', 'f21', 'n[::1]:5173', 'f22', 'n*:24678', ''].join('\n')

describe('bashDescendants', () => {
  test('エンジン直下のシェルの子孫だけを集め、MCP サーバの配下と無関係なプロセスを除く', () => {
    expect([...bashDescendants(parsePs(PS), 100).keys()].sort()).toEqual([200, 201, 202])
  })
  test('エンジンの子が無ければ空', () => {
    expect(bashDescendants(parsePs(PS), 999).size).toBe(0)
  })
})

describe('parseLsof と toServers', () => {
  test('同じ pid の待受を 1 件にまとめ、ポートを重複なしの昇順で返す', () => {
    const commands = bashDescendants(parsePs(PS), 100)
    expect(toServers(commands, parseLsof(LSOF))).toEqual([
      { pid: 201, name: 'node', command: 'node /repo/node_modules/.bin/vite', ports: [5173, 24678] },
    ])
  })
  test('対象外の pid の待受は含めない', () => {
    expect(toServers(new Map(), parseLsof(LSOF))).toEqual([])
  })
  test('コマンドとプロセス名の制御文字を除く', () => {
    const listens = parseLsof('p1\ncev\u001bil\nn*:3000\n')
    expect(toServers(new Map([[1, 'a\u001b[2Jb']]), listens)).toEqual([{ pid: 1, name: 'evil', command: 'a[2Jb', ports: [3000] }])
  })
})

describe('portOf', () => {
  test('IPv4、IPv6、ワイルドカードの各形式からポートを取る', () => {
    expect(portOf('127.0.0.1:3000')).toBe(3000)
    expect(portOf('[::1]:8080')).toBe(8080)
    expect(portOf('*:5173')).toBe(5173)
    expect(portOf('garbage')).toBeNull()
  })
})

describe('/dev-servers', () => {
  test('このセッションのシェル配下で待受しているサーバを返す', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', async (_$, e) => {
      if (e.argv[0] === 'sh') return res(0, '100\n')
      if (e.argv[0] === 'ps') return res(0, PS)
      return res(0, LSOF)
    })
    const { text } = await $.command.run(RUN)
    expect(text).toBe(':5173 :24678 node (pid 201)')
  })

  test('待受が無ければ lsof の終了コード 1 をエラーにしない', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', async (_$, e) => {
      if (e.argv[0] === 'sh') return res(0, '100\n')
      if (e.argv[0] === 'ps') return res(0, PS)
      return res(1, '')
    })
    const { text } = await $.command.run(RUN)
    expect(text).toBe('このセッションで起動した開発サーバはありません')
  })

  test('ps が失敗したらエラーとして返す', async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('process.run', async (_$, e) => (e.argv[0] === 'sh' ? res(0, '100\n') : res(1, '', 'ps: denied')))
    const { text } = await $.command.run(RUN)
    expect(text).toBe('取得失敗: ps: denied')
  })
})
