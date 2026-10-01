// 読み手の検査 (reader-lib.js) と、PR・Linear の投稿前フックへの組み込みのテスト。
// 実際のモデルは呼ばず、test-fixtures/fake-claude.js が決まった JSON を返す。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeConfigDir, runHook } = require('./helpers');
const { extractTexts } = require('../hooks/linear-lint');

const FAKE = path.join(__dirname, '..', 'test-fixtures', 'fake-claude.js');
const PARAGRAPH = '公開済みのバージョンが無いワークフローは、status の変更だけでは有効にできないようにします。';
const BODY = `## 目的\n\n${PARAGRAPH.repeat(5)}\n`;
const LINT_BODY = `## 目的\n\n${PARAGRAPH.repeat(5)}\n規約の正本を参照してください。\n`;

function output(findings) {
  return JSON.stringify({ is_error: false, structured_output: { findings } });
}

const CAS = { term: 'CAS 敗者', kind: 'coined', reason: '何に負けた側かが本文から決まらない。', suggestion: '同時更新で失敗した側', confidence: 'medium' };

// 偽の claude を読み手として使う環境を作る。呼ばれた回数は log ファイルの行数で数える。
function readerEnv(fakeOutput, extra = {}) {
  const dir = makeConfigDir();
  const log = path.join(dir, 'reader.log');
  const env = {
    TIRED_DEV_READER: '',
    TIRED_DEV_READER_CMD: FAKE,
    FAKE_READER_OUTPUT: fakeOutput,
    FAKE_READER_LOG: log,
    ...extra,
  };
  const calls = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0);
  return { dir, env, calls };
}

function denyReason(hook, input, ctx) {
  const out = runHook(hook, { session_id: 's1', ...input }, ctx.dir, ctx.env).trim();
  if (!out) return null;
  return JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
}

const prInput = (body) => ({
  tool_name: 'Bash',
  tool_input: { command: `gh pr create --title "fix: 有効化の条件を直す" --body-file - <<'EOF'\n${body}EOF` },
});
const issueInput = (description) => ({
  tool_name: 'mcp__claude_ai_Linear__save_issue',
  tool_input: { title: '有効化の条件を直す', description },
});

test('読み手の指摘で PR を 1 回止め、同じ本文の再投稿は通す', () => {
  const ctx = readerEnv(output([CAS]));
  const reason = denyReason('pr-lint', prInput(BODY), ctx);
  assert.match(reason, /「CAS 敗者」/);
  assert.match(reason, /同じ内容のまま投稿し直す/);
  assert.equal(denyReason('pr-lint', prInput(BODY), ctx), null);
  assert.equal(ctx.calls(), 1);
});

test('本文を変えた再投稿は読み手がもう一度読む', () => {
  const ctx = readerEnv(output([CAS]));
  assert.ok(denyReason('pr-lint', prInput(BODY), ctx));
  assert.ok(denyReason('pr-lint', prInput(`${BODY}追記です。\n`), ctx));
  assert.equal(ctx.calls(), 2);
});

test('同じセッションで読み手が 2 回止めた後は、本文を変えても読み手を呼ばない', () => {
  const ctx = readerEnv(output([CAS]));
  assert.ok(denyReason('pr-lint', prInput(BODY), ctx));
  assert.ok(denyReason('pr-lint', prInput(`${BODY}1 回目の追記です。\n`), ctx));
  assert.equal(denyReason('pr-lint', prInput(`${BODY}2 回目の追記です。\n`), ctx), null);
  assert.equal(ctx.calls(), 2);
  // 回数は投稿先ごとに数える。Linear の保存では読み手がまだ読む。
  assert.ok(denyReason('linear-lint', issueInput(BODY), ctx));
});

test('確信度 low だけの指摘では止めない', () => {
  const ctx = readerEnv(output([{ ...CAS, confidence: 'low' }]));
  assert.equal(denyReason('pr-lint', prInput(BODY), ctx), null);
});

test('読み手の失敗では投稿を止めない', () => {
  assert.equal(denyReason('pr-lint', prInput(BODY), readerEnv(output([CAS]), { FAKE_READER_EXIT: '1' })), null);
  assert.equal(denyReason('pr-lint', prInput(BODY), readerEnv('壊れた出力')), null);
  assert.equal(denyReason('pr-lint', prInput(BODY), readerEnv(JSON.stringify({ is_error: true }))), null);
});

test('短い本文と TIRED_DEV_READER=off では読み手を呼ばない', () => {
  const short = readerEnv(output([CAS]));
  assert.equal(denyReason('pr-lint', prInput('日次デプロイです。\n'), short), null);
  assert.equal(short.calls(), 0);
  const off = readerEnv(output([CAS]), { TIRED_DEV_READER: 'off' });
  assert.equal(denyReason('pr-lint', prInput(BODY), off), null);
  assert.equal(off.calls(), 0);
});

test('PR では語句の違反と読み手の指摘を 1 つの理由にまとめ、語句の違反は再投稿でも止める', () => {
  const ctx = readerEnv(output([CAS]));
  const first = denyReason('pr-lint', prInput(LINT_BODY), ctx);
  assert.match(first, /\[jargon\]/);
  assert.match(first, /「CAS 敗者」/);
  const second = denyReason('pr-lint', prInput(LINT_BODY), ctx);
  assert.match(second, /\[jargon\]/);
  assert.doesNotMatch(second, /CAS 敗者/);
});

test('Linear では語句の違反も 1 回だけ止める', () => {
  const ctx = readerEnv(output([]));
  assert.match(denyReason('linear-lint', issueInput(LINT_BODY), ctx), /\[jargon\]/);
  assert.equal(denyReason('linear-lint', issueInput(LINT_BODY), ctx), null);
});

test('Linear の読み手の指摘で 1 回止める', () => {
  const ctx = readerEnv(output([CAS]));
  assert.match(denyReason('linear-lint', issueInput(BODY), ctx), /「CAS 敗者」/);
  assert.equal(denyReason('linear-lint', issueInput(BODY), ctx), null);
});

test('Linear 以外の保存ツールと本文の無い呼び出しでは何もしない', () => {
  const ctx = readerEnv(output([CAS]));
  assert.equal(denyReason('linear-lint', { tool_name: 'mcp__claude_ai_Linear__get_issue', tool_input: { id: 'X-1' } }, ctx), null);
  assert.equal(denyReason('linear-lint', { tool_name: 'mcp__claude_ai_Linear__save_issue', tool_input: { id: 'X-1', state: 'Done' } }, ctx), null);
  assert.equal(ctx.calls(), 0);
});

test('Linear のツールごとに検査する文字列を取り出す', () => {
  assert.deepEqual(extractTexts('mcp__claude_ai_Linear__save_issue', { title: 'T', description: 'D' }), [['タイトル', 'T'], ['本文', 'D']]);
  assert.deepEqual(extractTexts('mcp__c1389e33__save_comment', { body: 'B', issueId: 'X-1' }), [['本文', 'B']]);
  assert.deepEqual(extractTexts('mcp__plugin_productivity_linear__save_document', { title: 'T', content: 'C' }), [['タイトル', 'T'], ['本文', 'C']]);
  assert.deepEqual(
    extractTexts('mcp__claude_ai_Linear__save_issue', {
      id: 'X-1',
      patch: [{ op: 'replace', old_string: 'a', new_string: 'N' }, { op: 'append', text: 'A' }],
    }),
    [['本文', 'N'], ['本文', 'A']]
  );
  assert.deepEqual(extractTexts('Bash', { command: 'ls' }), []);
});
