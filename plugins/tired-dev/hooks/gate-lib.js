// ゲート判定と注入文の組み立て。
// Claude Code の hooks/gate.js と OpenCode の opencode/index.ts が共有する。
// 判定ロジックを二重に持たないため、注入処理ではなくここに置く。

const path = require('path');
const { ROOT, readRule } = require('./lib');

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

function isGateHit(prompt) {
  if (typeof prompt !== 'string' || prompt.length === 0) return false;
  const jaLength = (prompt.match(JA_CHAR) || []).length;
  return TRIGGER.test(prompt) || jaLength >= JA_THRESHOLD;
}

// 同一セッションの 2 回目以降に出す 1 行のリマインダ。
function reminderLine() {
  return (
    '共有される文章を書く場合は tired-dev:tech-writing の規約を適用する。結論を冒頭に置き、' +
    '事実と仮説と対応方針を分け、定量的に書き、そのまま実行できる検証コマンドと' +
    `受け入れ条件を添える。詳細は ${path.join(ROOT, 'SKILL.md')} にある。`
  );
}

// 同一セッションの 1 回目に出す、要約の全文つきの導入。
function firstHitInjection() {
  const anchor = readRule('anchor.md');
  if (!anchor) return '';
  return (
    'このプロンプトは日本語の文章作成または推敲を含む可能性がある。\n' +
    'Issue、PR、docs、レビュー指摘、調査レポートなど共有される本文を書く場合は、\n' +
    '以下の規約を適用する。短いチャット返答には適用しない。\n' +
    `規約の正本は ${path.join(ROOT, 'SKILL.md')} にある。\n\n` +
    anchor
  );
}

module.exports = { TRIGGER, JA_THRESHOLD, isGateHit, reminderLine, firstHitInjection };
