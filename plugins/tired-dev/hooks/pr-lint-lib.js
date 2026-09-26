// PR のタイトルと本文の検査。
// Claude Code の hooks/pr-lint.js と OpenCode の opencode/index.ts が共有する。
// 検査の対象と除外規則を二重に持たないため、フック本体ではなくここに置く。

const { parsePrCommands } = require('./pr-command');
const { lintText } = require('../tools/lint');

const MAX_FINDINGS = 15;

// 投稿を止める根拠にしない規則。
// parallel-style は、過去の PR 本文で検出した 12 件のうち、確実に正しい検出が 4 件だった。
// 文末のかっこ書きや英語の結果表記 (`pass`) を体言止めと誤判定するため、
// 手動の `tools/lint.js` 実行でだけ使う。
const SKIP_RULES = new Set(['parallel-style']);

function prLintDisabled(env = process.env) {
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

// コマンド文字列から gh pr create / edit を取り出し、投稿を止める違反だけを返す。
// 値が確定しない書き方と、規則で除外した項目は含めない。
function findPrFindings({ command, cwd, env = process.env } = {}) {
  if (prLintDisabled(env)) return [];
  const findings = [];
  for (const pr of parsePrCommands(command, cwd)) {
    if (pr.bypass) continue;
    findings.push(...lintPr(pr));
  }
  return findings;
}

module.exports = { MAX_FINDINGS, SKIP_RULES, prLintDisabled, lintPr, formatReason, findPrFindings };
