// テスト共通のヘルパ。
// フックを子プロセスで実行し、標準出力を返す。
// CLAUDE_CONFIG_DIR を一時ディレクトリへ向け、利用者の ~/.claude を汚さない。

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

// テストごとに独立した状態ディレクトリを作る。
// gate.js はここに .tired-dev-state.json を書く。
function makeConfigDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tired-dev-test-'));
}

function runHook(hookName, input, configDir, env = {}) {
  const script = path.join(PLUGIN_ROOT, 'hooks', `${hookName}.js`);
  return execFileSync(process.execPath, [script], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    // TIRED_DEV_CHAT は呼び出し側の環境に左右させない。テストで明示的に渡す。
    // 読み手の検査は実際のモデルを呼ぶため、既定で無効にする。有効にするテストは偽のコマンドを渡す。
    env: { ...process.env, TIRED_DEV_CHAT: '', TIRED_DEV_READER: 'off', CLAUDE_CONFIG_DIR: configDir, ...env },
  });
}

// ゲートが命中したかどうかだけを見る。
function gateHits(prompt, configDir, sessionId = `s-${Math.random()}`) {
  const out = runHook('gate', { prompt, session_id: sessionId }, configDir);
  return out.trim().length > 0;
}

module.exports = { PLUGIN_ROOT, makeConfigDir, runHook, gateHits };
