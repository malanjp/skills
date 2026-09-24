#!/usr/bin/env node
// tired-dev — PreToolUse フック (Bash)
//
// gh pr create / gh pr edit を実行する直前に、タイトルと本文を tools/lint.js で検査する。
// 違反があればコマンドを止め、直す箇所を Claude に返す。
//
// UserPromptSubmit のゲートは利用者のプロンプトしか見ない。
// PR は /to-done のような自動の手順の途中で作られることが多く、
// そのときのプロンプトは Issue の URL だけなので、ゲートが反応しない。
// このフックは PR を投稿する操作そのものを見るため、プロンプトの内容に依存しない。
//
// 次の場合は何もしない。
//   - gh pr create / edit 以外のコマンド
//   - タイトルと本文が確定しない書き方 (変数展開、コマンド置換、読めないファイル)
//   - 環境変数 TIRED_DEV_PR_LINT が off、またはコマンドの前置に TIRED_DEV_PR_LINT=off がある
//   - フック自体の失敗。PR の投稿を妨げないよう、例外はすべて握りつぶして素通しにする

const { readInput } = require('./lib');
const { parsePrCommands } = require('./pr-command');
const { lintText } = require('../tools/lint');

const MAX_FINDINGS = 15;

// 投稿を止める根拠にしない規則。
// parallel-style は、過去の PR 本文で検出した 12 件のうち、確実に正しい検出が 4 件だった。
// 文末のかっこ書きや英語の結果表記 (`pass`) を体言止めと誤判定するため、
// 手動の `tools/lint.js` 実行でだけ使う。
const SKIP_RULES = new Set(['parallel-style']);

function disabled(env = process.env) {
  return /^(off|0|false|no)$/i.test(String(env.TIRED_DEV_PR_LINT ?? '').trim());
}

function lintPr({ title, body }) {
  const findings = [];
  if (title) findings.push(...lintText(title, 'タイトル'));
  if (body) findings.push(...lintText(body, '本文'));
  return findings.filter((f) => !SKIP_RULES.has(f.rule));
}

function formatReason(findings) {
  const shown = findings.slice(0, MAX_FINDINGS).map((f) => {
    const where = f.file === 'タイトル' ? 'タイトル' : `本文 ${f.line} 行目`;
    return `- ${where}: [${f.rule}] ${f.message} (${f.section}) — ${f.found}`;
  });
  const rest = findings.length - shown.length;
  if (rest > 0) shown.push(`- ほか ${rest} 件`);
  return [
    `tired-dev: PR のタイトルと本文に tech-writing 規約の違反が ${findings.length} 件ある。`,
    '直してから同じコマンドを実行し直す。',
    '',
    ...shown,
    '',
    '規約の全文は tired-dev:tech-writing スキルにある。',
    '誤検出だと判断した場合に限り、gh の直前に TIRED_DEV_PR_LINT=off を付けて実行し、',
    '報告で誤検出の内容を利用者に伝える。',
  ].join('\n');
}

function main() {
  if (disabled()) return;
  const input = readInput();
  if (input.tool_name !== 'Bash') return;
  const command = input.tool_input && input.tool_input.command;

  const findings = [];
  for (const pr of parsePrCommands(command, input.cwd)) {
    if (pr.bypass) continue;
    findings.push(...lintPr(pr));
  }
  if (findings.length === 0) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: formatReason(findings),
      },
    })
  );
}

try {
  main();
} catch {
  // 検査の失敗で PR の投稿を止めない。
}
