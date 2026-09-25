#!/usr/bin/env node
// tired-dev — UserPromptSubmit フック
//
// プロンプトが日本語の共有文章を書く依頼に該当するときだけ、
// rules/anchor.md を注入する。該当しないプロンプトでは何も出力せず、
// チャット返答の口調には干渉しない。
//
// 同一セッションでの 2 回目以降は、アンカー全文ではなく 1 行のリマインダに切り替える。
// アンカーは注入済みで会話履歴に残っているため、再掲はトークンの無駄になる。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT } = require('./lib');
const { readInput, readAnchor } = require('./lib');

// 共有される文章を書く、または直す依頼を示す語。
// カテゴリごとに分け、追加時にどの軸の語かを判断できるようにする。
const TRIGGER = new RegExp(
  [
    // 報告・調査
    '報告', 'レポート', '調査結果', '障害', 'ポストモーテム', '\\bpostmortem\\b',
    '要約', 'サマリ', 'まとめて',
    // 提案・計画
    '提案', '見直し', '改善案', '方針案', '\\bproposal\\b',
    // Issue・PR
    '\\bissue\\b', 'イシュー', '起票', 'チケット',
    '\\bpr\\b', 'プルリク', 'プルリクエスト', 'レビュー', '\\breview\\b',
    '受け入れ条件', 'acceptance criteria',
    // ドキュメント種別
    '\\breadme\\b', '\\badr\\b', '\\brfc\\b', '仕様書', '設計書', 'デザインドック', 'design doc',
    '手順書', '\\brunbook\\b', 'ランブック', '議事録', 'ドキュメント', 'docs/',
    'リリースノート', '\\bchangelog\\b', 'コミットメッセージ', 'commit message',
    // 編集・推敲の依頼
    '推敲', '校正', '添削', '清書', '読みやすく', '書き直', 'リライト',
    '言い回し', 'てにをは', '文章', '文面', '本文', '原稿',
    '\\bproofread\\b', '\\brewrite\\b', '\\bpolish\\b', '\\bdraft\\b', '下書き',
  ].join('|'),
  'i'
);

// 日本語の長文そのものも対象にする。推敲対象の原稿が貼られた場合を拾う。
const JA_CHAR = /[぀-ヿ一-鿿]/g;
const JA_THRESHOLD = 200;

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
  if (!prompt) return;

  const jaLength = (prompt.match(JA_CHAR) || []).length;
  const hit = TRIGGER.test(prompt) || jaLength >= JA_THRESHOLD;
  if (!hit) return;

  const count = bumpHitCount(input.session_id);
  if (count > 1) {
    process.stdout.write(
      '共有される文章を書く場合は tired-dev:tech-writing の規約を適用する。結論を冒頭に置き、' +
        '事実と仮説と対応方針を分け、定量的に書き、そのまま実行できる検証コマンドと' +
        `受け入れ条件を添える。詳細は ${path.join(ROOT, 'SKILL.md')} にある。`
    );
    return;
  }

  const anchor = readAnchor();
  if (!anchor) return;
  process.stdout.write(
    'このプロンプトは日本語の文章作成または推敲を含む可能性がある。\n' +
      'Issue、PR、docs、レビュー指摘、調査レポートなど共有される本文を書く場合は、\n' +
      '以下の規約を適用する。短いチャット返答には適用しない。\n' +
      `規約の正本は ${path.join(ROOT, 'SKILL.md')} にある。\n\n` +
      anchor
  );
}

main();
