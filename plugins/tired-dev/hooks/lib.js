// tired-dev フック共通処理
// stdin の JSON 読み取りと、規則ファイルの読み込みを提供する。

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ANCHOR_PATH = path.join(ROOT, 'rules', 'anchor.md');

// Claude Code はフック入力を JSON で stdin に渡す。
// TTY 実行や空入力でも落とさず、空オブジェクトを返す。
function readInput() {
  try {
    if (process.stdin.isTTY) return {};
    const raw = fs.readFileSync(0, 'utf8');
    if (!raw.trim()) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// rules/ 配下のファイルを読む。無ければ null を返し、フックは通知を続ける。
function readRule(name) {
  try {
    return fs.readFileSync(path.join(ROOT, 'rules', name), 'utf8').trim();
  } catch {
    return null;
  }
}

function readAnchor() {
  return readRule('anchor.md');
}

// チャット返答にも語彙と認知負荷を適用するかどうか。
// 既定は無効で、環境変数を明示的に有効な値にしたときだけ有効になる。
function chatGateEnabled(env = process.env) {
  const value = String(env.TIRED_DEV_CHAT ?? '').trim().toLowerCase();
  return ['1', 'on', 'true', 'yes'].includes(value);
}

// 応答を日本語に保つ Stop と SessionStart のフックを動かすかどうか。
// 既定は有効で、環境変数を明示的に無効な値にしたときだけ止める。
function jaOutputDisabled(env = process.env) {
  const value = String(env.TIRED_DEV_JA_OUTPUT ?? '').trim().toLowerCase();
  return ['0', 'off', 'false', 'no'].includes(value);
}

module.exports = { ROOT, ANCHOR_PATH, readInput, readRule, readAnchor, chatGateEnabled, jaOutputDisabled };
