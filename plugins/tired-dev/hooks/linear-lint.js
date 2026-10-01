#!/usr/bin/env node
// tired-dev — PreToolUse フック (Linear の MCP ツール)
//
// Linear の Issue、コメント、ドキュメントを保存する直前に、本文を検査する。
// 検査の内容は PR と同じで、語句の検査 (tools/lint.js) と読み手の検査 (reader-lib.js) を行う。
//
// MCP サーバー名は接続方法ごとに違う (claude_ai_Linear、plugin_productivity_linear、UUID)。
// plugin.json の matcher はツール名の末尾で絞り、ここではツールの引数の形で本文を取り出す。
//
// MCP の呼び出しには環境変数を付ける手段がないため、指摘は同じ本文に対して 1 回だけ止める。

const { readInput } = require('./lib');
const { lintText } = require('../tools/lint');
const { SKIP_RULES, prLintDisabled, findingLines } = require('./pr-lint-lib');
const { reviewPost } = require('./post-review-lib');

const LINEAR_TOOL = /^mcp__.*__save_(issue|comment|document)$/;

// 部分更新 (patch) は、追加される文字列だけを取り出す。
function patchTexts(patch) {
  if (!Array.isArray(patch)) return [];
  return patch.map((op) => op && (op.new_string ?? op.text)).filter((t) => typeof t === 'string');
}

// ツールの引数から、検査する文字列を [ラベル, 文字列] の配列で返す。
function extractTexts(toolName, toolInput = {}) {
  const kind = LINEAR_TOOL.exec(toolName || '')?.[1];
  if (!kind) return [];
  const pick = (label, value) => (typeof value === 'string' && value.trim() ? [[label, value]] : []);
  const patches = patchTexts(toolInput.patch).map((t) => ['本文', t]);
  if (kind === 'issue') return [...pick('タイトル', toolInput.title), ...pick('本文', toolInput.description), ...patches];
  if (kind === 'comment') return pick('本文', toolInput.body);
  return [...pick('タイトル', toolInput.title), ...pick('本文', toolInput.content), ...patches];
}

function formatLint(findings) {
  return [
    `tired-dev: Linear に保存する文章に tech-writing 規約の違反が ${findings.length} 件ある。`,
    '直してから保存し直す。',
    '',
    ...findingLines(findings),
    '',
    '誤検出だと判断した場合に限り、同じ内容のまま保存し直すと通る。',
    'その場合は、誤検出の内容を報告で利用者に伝える。',
  ];
}

function main() {
  const input = readInput();
  if (prLintDisabled()) return;
  const texts = extractTexts(input.tool_name, input.tool_input);
  if (texts.length === 0) return;

  const lintFindings = texts
    .flatMap(([label, text]) => lintText(text, label))
    .filter((f) => !SKIP_RULES.has(f.rule));
  const reason = reviewPost({
    sessionId: input.session_id,
    scope: 'linear',
    parts: texts.map(([, text]) => text),
    lintFindings,
    lintLines: formatLint(lintFindings),
    lintEveryTime: false,
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

if (require.main === module) {
  try {
    main();
  } catch {
    // 検査の失敗で Linear への保存を止めない。
  }
}

module.exports = { extractTexts };
