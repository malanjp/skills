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
// 検査の内容は pr-lint-lib.js にある。OpenCode プラグインも同じ関数を使う。

const { readInput } = require('./lib');
const { findPrFindings, formatReason } = require('./pr-lint-lib');

function main() {
  const input = readInput();
  if (input.tool_name !== 'Bash') return;
  const command = input.tool_input && input.tool_input.command;

  const findings = findPrFindings({ command, cwd: input.cwd });
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
