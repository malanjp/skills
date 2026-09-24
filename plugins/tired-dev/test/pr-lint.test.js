// PreToolUse フック (pr-lint) のテスト。
// gh pr create / edit のタイトルと本文を取り出し、規約違反があるときだけ止めることを確かめる。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeConfigDir, runHook } = require('./helpers');
const { parsePrCommands } = require('../hooks/pr-command');

const BAD_TITLE = 'fix: 正典で検証する';
const GOOD_TITLE = 'fix: 共通スキーマで検証する';
const BAD_BODY = '## 目的\n\n抽出側の設定を正典で検証する。\n';
const GOOD_BODY = '## 目的\n\n抽出側の設定を共通スキーマで検証する。\n';

function bash(command, extra = {}) {
  return { tool_name: 'Bash', tool_input: { command }, ...extra };
}

// フックを実行し、拒否した場合は理由を、素通しの場合は null を返す。
function denyReason(input, env = {}) {
  const out = runHook('pr-lint', input, makeConfigDir(), env).trim();
  if (!out) return null;
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'deny');
  return parsed.hookSpecificOutput.permissionDecisionReason;
}

test('本文をヒアドキュメントで渡す形から本文を取り出す', () => {
  const command = `gh pr create --title "${GOOD_TITLE}" --body "$(cat <<'EOF'\n${BAD_BODY}"引用符" も含む\nEOF\n)"`;
  const [pr] = parsePrCommands(command);
  assert.equal(pr.title, GOOD_TITLE);
  assert.equal(pr.body, `${BAD_BODY}"引用符" も含む`);
});

test('同じコマンド内で書き出したファイルを --body-file で渡す形を読む', () => {
  const command = `cat > $SCR/pr.md <<'EOF'\n${BAD_BODY}EOF\ngh pr create --title '${GOOD_TITLE}' --body-file $SCR/pr.md`;
  const [pr] = parsePrCommands(command);
  assert.equal(pr.body, BAD_BODY.trimEnd());
});

test('--body-file - と標準入力のヒアドキュメントを読む', () => {
  const command = `gh pr edit 12 --body-file - <<'EOF'\n${BAD_BODY}EOF`;
  const [pr] = parsePrCommands(command);
  assert.equal(pr.title, null);
  assert.equal(pr.body, BAD_BODY.trimEnd());
});

test('ディスク上の既存ファイルを cwd 基準で読む', () => {
  const dir = makeConfigDir();
  fs.writeFileSync(path.join(dir, 'body.md'), BAD_BODY);
  const [pr] = parsePrCommands(`gh pr create -t "${GOOD_TITLE}" -F body.md`, dir);
  assert.equal(pr.body, BAD_BODY);
});

test('同じコマンドで代入した変数を --body-file のパスで展開する', () => {
  const dir = makeConfigDir();
  fs.writeFileSync(path.join(dir, 'pr-body.md'), BAD_BODY);
  const [pr] = parsePrCommands(`S=${dir}; gh pr create -t "${GOOD_TITLE}" --body-file $S/pr-body.md`);
  assert.equal(pr.body, BAD_BODY);
});

test('書き出し先と --body-file で変数の書き方が違っても同じファイルとみなす', () => {
  const command = `S=/tmp/x\ncat > "$S/pr.md" <<'EOF'\n${BAD_BODY}EOF\ngh pr create --body-file \${S}/pr.md`;
  const [pr] = parsePrCommands(command);
  assert.equal(pr.body, BAD_BODY.trimEnd());
});

test('--title= と --body= の形を読む', () => {
  const [pr] = parsePrCommands(`gh pr edit --title="${GOOD_TITLE}" --body='${GOOD_BODY}'`);
  assert.equal(pr.title, GOOD_TITLE);
  assert.equal(pr.body, GOOD_BODY);
});

test('変数やコマンド置換を含む値は検査しない', () => {
  const [pr] = parsePrCommands('gh pr create --title "deploy: $(date +%F)" --body "$BODY" --body-file "$F"');
  assert.equal(pr.title, null);
  assert.equal(pr.body, null);
});

test('gh pr create を文字列として含むだけのコマンドは対象にしない', () => {
  assert.deepEqual(parsePrCommands('rg -n "gh pr create|--title" steps.md'), []);
  assert.deepEqual(parsePrCommands('gh pr view 12 --json title'), []);
});

test('規約違反のタイトルでは拒否し、理由に該当箇所を含める', () => {
  const reason = denyReason(bash(`gh pr create --title "${BAD_TITLE}" --body "${GOOD_BODY}"`));
  assert.match(reason, /タイトル: \[jargon\].*正典/);
});

test('規約違反の本文では行番号付きで拒否する', () => {
  const command = `cd repo && gh pr create --title "${GOOD_TITLE}" --body "$(cat <<'EOF'\n${BAD_BODY}EOF\n)"`;
  const reason = denyReason(bash(command));
  assert.match(reason, /本文 3 行目: \[jargon\]/);
});

test('違反がなければ何も出力しない', () => {
  assert.equal(denyReason(bash(`gh pr create --title "${GOOD_TITLE}" --body "${GOOD_BODY}"`)), null);
});

test('parallel-style の違反だけでは投稿を止めない', () => {
  const body = '## 確認\n\n- 単体テストが通ることを確認した\n- lint の実行\n- 型検査が通る\n';
  assert.equal(denyReason(bash(`gh pr create --title "${GOOD_TITLE}" --body "${body}"`)), null);
});

test('Bash 以外のツールと PR 以外のコマンドでは何も出力しない', () => {
  assert.equal(denyReason({ tool_name: 'Write', tool_input: { content: BAD_BODY } }), null);
  assert.equal(denyReason(bash(`git commit -m "${BAD_TITLE}"`)), null);
});

test('前置の TIRED_DEV_PR_LINT=off で検査を飛ばす', () => {
  const command = `TIRED_DEV_PR_LINT=off gh pr create --title "${BAD_TITLE}" --body "${BAD_BODY}"`;
  assert.equal(denyReason(bash(command)), null);
});

test('環境変数 TIRED_DEV_PR_LINT=off で検査を止める', () => {
  const input = bash(`gh pr create --title "${BAD_TITLE}"`);
  assert.equal(denyReason(input, { TIRED_DEV_PR_LINT: 'off' }), null);
});

test('壊れた入力でも例外を出さず素通しにする', () => {
  const script = path.join(__dirname, '..', 'hooks', 'pr-lint.js');
  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, [script], { input: '{not json', encoding: 'utf8' });
  assert.equal(out, '');
});
