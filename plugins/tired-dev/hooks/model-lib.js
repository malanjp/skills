// 投稿前の検査で使うモデルを、子プロセスの claude として呼ぶ。
// 読み手の検査 (reader-lib.js) と規約のレビュー (review-lib.js) が共有する。
//
// 子プロセスの claude には利用者の設定、フック、MCP、ツールを読み込ませない。
// 読み込ませると利用者の CLAUDE.md が混ざり、事情を知らない読み手にならない。
// また、このプラグインのフックが子プロセスでも動いて再帰する。
//
// 2 つの検査を並行して動かすため、spawnSync ではなく spawn を使う。
// 失敗、タイムアウト、出力の破損では null を返し、呼び出し側は指摘 0 件として扱う。

const { spawn } = require('node:child_process');
const os = require('node:os');

// structured_output を返す。失敗した場合は null を返す。
//   cmd: claude の代わりに呼ぶコマンド (テスト用)
function runModel({ cmd = 'claude', model, systemPrompt, schema, input, timeoutMs, env = process.env }) {
  const args = [
    '-p', '--model', model,
    '--setting-sources', '', '--strict-mcp-config', '--tools', '', '--no-session-persistence',
    '--output-format', 'json', '--json-schema', schema,
    '--system-prompt', systemPrompt,
  ];
  return new Promise((resolve) => {
    let child;
    try {
      // cwd をリポジトリの外に置き、プロジェクトの CLAUDE.md を拾わせない。
      child = spawn(cmd, args, { cwd: os.tmpdir(), env, stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      resolve(null);
      return;
    }
    let stdout = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return resolve(null);
      try {
        const out = JSON.parse(stdout);
        resolve(out.is_error ? null : out.structured_output ?? null);
      } catch {
        resolve(null);
      }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

module.exports = { runModel };
