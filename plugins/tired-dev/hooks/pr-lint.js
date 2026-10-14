#!/usr/bin/env node
// tired-dev — PreToolUse フック (Bash)
//
// gh pr create / gh pr edit を実行する直前に、タイトルと本文を tools/lint.js で検査する。
// あわせて、事情を知らない読み手のモデル (reader-lib.js) と、差分と照合して規約全体で本文を見るレビュアーのモデル (review-lib.js) に本文を読ませる。
// 違反や指摘があればコマンドを止め、直す箇所を Claude に返す。
//
// UserPromptSubmit のゲートは利用者のプロンプトしか見ない。
// PR は /to-done のような自動の手順の途中で作られることが多く、
// そのときのプロンプトは Issue の URL だけなので、ゲートが反応しない。
// このフックは PR を投稿する操作そのものを見るため、プロンプトの内容に依存しない。
//
// 語句の検査の内容は pr-lint-lib.js にある。OpenCode プラグインも同じ関数を使う。
// モデルの検査は claude を子プロセスで呼ぶため、Claude Code のこのフックだけで行う。

const { readInput } = require('./lib');
const { parsePrCommands } = require('./pr-command');
const { prLintDisabled, lintPr, formatReason } = require('./pr-lint-lib');
const { reviewPost } = require('./post-review-lib');
const { changeContext } = require('./change-lib');

async function main() {
  const input = readInput();
  if (input.tool_name !== 'Bash') return;
  if (prLintDisabled()) return;
  const command = input.tool_input && input.tool_input.command;

  const prs = parsePrCommands(command, input.cwd).filter((pr) => !pr.bypass);
  if (prs.length === 0) return;
  const lintFindings = prs.flatMap(lintPr);
  const reason = await reviewPost({
    sessionId: input.session_id,
    scope: 'pr',
    parts: prs.flatMap((pr) => [pr.title, pr.body]),
    lintFindings,
    lintLines: [formatReason(lintFindings)],
    lintEveryTime: true,
    getChange: () => prs.map((pr) => changeContext(pr, input.cwd)).filter(Boolean).join('\n\n') || null,
  });
  if (!reason) return;

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })
  );
}

main().catch(() => {
  // 検査の失敗で PR の投稿を止めない。
});
