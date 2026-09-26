#!/usr/bin/env node
// tired-dev — UserPromptSubmit フック
//
// プロンプトが日本語の共有文章を書く依頼に該当するときだけ、
// rules/anchor.md を注入する。該当しないプロンプトでは何も出力せず、
// チャット返答の口調には干渉しない。
//
// 同一セッションでの 2 回目以降は、アンカー全文ではなく 1 行のリマインダに切り替える。
// アンカーは注入済みで会話履歴に残っているため、再掲はトークンの無駄になる。
//
// 判定と注入文の組み立ては gate-lib.js にある。OpenCode プラグインも同じ関数を使う。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readInput } = require('./lib');
const { isGateHit, reminderLine, firstHitInjection } = require('./gate-lib');

function statePath() {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(dir, '.tired-dev-state.json');
}

// セッションごとの命中回数を記録する。読み書きに失敗しても本処理は止めない。
function bumpHitCount(sessionId) {
  if (!sessionId) return 1;
  const file = statePath();
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    state = {};
  }
  const next = (state[sessionId] || 0) + 1;
  // 現在のセッションを末尾へ置き直してから切り詰める。
  // 先に切り詰めると、追加した 1 件が上限を 1 つ超えて残る。
  delete state[sessionId];
  state[sessionId] = next;
  const entries = Object.entries(state);
  // 状態ファイルが無限に育たないよう、直近 20 セッション分だけ残す。
  const trimmed = entries.length > 20 ? Object.fromEntries(entries.slice(-20)) : state;
  try {
    fs.writeFileSync(file, JSON.stringify(trimmed), 'utf8');
  } catch {
    // 書き込み不可でも注入は継続する。
  }
  return next;
}

function main() {
  const input = readInput();
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!isGateHit(prompt)) return;

  const count = bumpHitCount(input.session_id);
  const output = count > 1 ? reminderLine() : firstHitInjection();
  if (output) process.stdout.write(output);
}

main();
