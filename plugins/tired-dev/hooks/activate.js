#!/usr/bin/env node
// tired-dev — SessionStart フック
//
// セッション開始時に、スキルの発火条件だけを短く通知する。
// 規約の全文はここで注入しない。UserPromptSubmit のゲートが命中したときに
// rules/anchor.md を注入し、詳細が要るときだけ SKILL.md を読ませる。
//
// 環境変数 TIRED_DEV_CHAT が有効なときだけ、rules/chat.md も足す。
// 規約は本来チャット返答を対象外とするが、語彙と認知負荷は口調と独立しているため、
// この 2 つに限って持ち込めるようにしてある。

const path = require('path');
const { ROOT, readInput, readRule, chatGateEnabled } = require('./lib');

readInput();

const lines = [
  'tired-dev:tech-writing 有効。日本語の技術文章の記述規約。',
  '',
  '適用対象: 報告、調査結果、Issue 起票文、PR の description とレビュー指摘、',
  'docs 配下の Markdown、ADR、README、仕様書、障害報告、リリースノート。',
  '人が書いた原稿の推敲依頼にも適用する。',
  '',
  '適用しない対象: 短いチャット返答、確認質問、コードとコマンドの出力、',
  'エッセイや SNS 投稿などの技術報告以外の文章。',
  '',
  '上記に該当する文章を書く前に、tired-dev:tech-writing の規約を読んでから書く。',
  'gh pr create と gh pr edit のタイトルと本文は、投稿の直前にフックが規約違反を検査し、違反があれば投稿を止める。',
  `規約の正本: ${path.join(ROOT, 'SKILL.md')}`,
  `要約: ${path.join(ROOT, 'rules', 'anchor.md')}`,
];

if (chatGateEnabled()) {
  const chat = readRule('chat.md');
  if (chat) {
    lines.push(
      '',
      '---',
      '',
      'TIRED_DEV_CHAT が有効。次の 2 つに限り、短いチャット返答にも適用する。',
      '返答の口調と長さは変えない。語彙の置き換えと認知負荷の低減だけを行う。',
      '',
      chat
    );
  }
}

process.stdout.write(lines.join('\n'));
