// 規約のレビュー (review-lib.js) と、PR・Linear の投稿前フックへの組み込みのテスト。
// 実際のモデルは呼ばず、test-fixtures/fake-claude.js が決まった JSON を返す。

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { makeConfigDir, runHook } = require('./helpers');
const { parsePrCommands } = require('../hooks/pr-command');

const FAKE = path.join(__dirname, '..', 'test-fixtures', 'fake-claude.js');
const PARAGRAPH = '公開済みのバージョンが無いワークフローは、status の変更だけでは有効にできないようにします。';
const BODY = `## 目的\n\n${PARAGRAPH.repeat(5)}\n`;

function output(findings) {
  return JSON.stringify({ is_error: false, structured_output: { findings } });
}

const SCOPE = {
  rule: 'summary-scope',
  quote: '付与だけを残します',
  problem: '差分には SA の切替の取り消しも含まれる。',
  fix: 'SA の切替を取り消し、付与だけを残します',
  confidence: 'medium',
};

// 偽の claude を読み手とレビュアーとして使う環境を作る。
function modelEnv({ reader = output([]), review = output([]), extra = {} } = {}) {
  const dir = makeConfigDir();
  const log = path.join(dir, 'model.log');
  const inputLog = path.join(dir, 'review-input.txt');
  const env = {
    TIRED_DEV_READER: '',
    TIRED_DEV_REVIEW: '',
    TIRED_DEV_READER_CMD: FAKE,
    TIRED_DEV_REVIEW_CMD: FAKE,
    FAKE_READER_OUTPUT: reader,
    FAKE_REVIEW_OUTPUT: review,
    FAKE_READER_LOG: log,
    FAKE_REVIEW_INPUT_LOG: inputLog,
    ...extra,
  };
  const calls = (role) =>
    fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter((l) => l === role).length : 0;
  const reviewInput = () => (fs.existsSync(inputLog) ? fs.readFileSync(inputLog, 'utf8') : null);
  return { dir, env, calls, reviewInput };
}

function denyReason(hook, input, ctx) {
  const out = runHook(hook, { session_id: 's1', ...input }, ctx.dir, ctx.env).trim();
  if (!out) return null;
  return JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
}

const prInput = (body, extra = '', cwd) => ({
  tool_name: 'Bash',
  cwd,
  tool_input: { command: `gh pr create --title "fix: 有効化の条件を直す" ${extra} --body-file - <<'EOF'\n${body}EOF` },
});

test('レビュアーの指摘で PR を 1 回止め、同じ本文の再投稿は通す', () => {
  const ctx = modelEnv({ review: output([SCOPE]) });
  const reason = denyReason('pr-lint', prInput(BODY), ctx);
  assert.match(reason, /\[summary-scope\] 「付与だけを残します」/);
  assert.match(reason, /同じ内容のまま投稿し直す/);
  assert.equal(denyReason('pr-lint', prInput(BODY), ctx), null);
  assert.equal(ctx.calls('review'), 1);
  assert.equal(ctx.calls('reader'), 1);
});

test('読み手とレビュアーの指摘を 1 つの理由にまとめる', () => {
  const cas = { term: 'CAS 敗者', kind: 'coined', reason: '何に負けた側かが決まらない。', suggestion: '同時更新で失敗した側', confidence: 'medium' };
  const ctx = modelEnv({ reader: output([cas]), review: output([SCOPE]) });
  const reason = denyReason('pr-lint', prInput(BODY), ctx);
  assert.match(reason, /「CAS 敗者」/);
  assert.match(reason, /\[summary-scope\]/);
});

test('確信度 low だけの指摘とレビュアーの失敗では止めない', () => {
  assert.equal(denyReason('pr-lint', prInput(BODY), modelEnv({ review: output([{ ...SCOPE, confidence: 'low' }]) })), null);
  assert.equal(denyReason('pr-lint', prInput(BODY), modelEnv({ review: '壊れた出力' })), null);
});

test('TIRED_DEV_REVIEW=off ではレビュアーを呼ばない', () => {
  const ctx = modelEnv({ review: output([SCOPE]), extra: { TIRED_DEV_REVIEW: 'off' } });
  assert.equal(denyReason('pr-lint', prInput(BODY), ctx), null);
  assert.equal(ctx.calls('review'), 0);
});

test('gh pr create では base との差分をレビュアーに渡す', () => {
  const repo = fs.mkdtempSync(path.join(makeConfigDir(), 'repo-'));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: repo });
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  fs.writeFileSync(path.join(repo, 'changed-file.ts'), 'export const x = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'feat: x を足す');

  const ctx = modelEnv();
  denyReason('pr-lint', prInput(BODY, '--base main', repo), ctx);
  const input = ctx.reviewInput();
  assert.match(input, /<change>/);
  assert.match(input, /changed-file\.ts/);
  assert.match(input, /feat: x を足す/);
});

test('Linear では差分なしで本文だけをレビュアーに渡す', () => {
  const ctx = modelEnv({ review: output([SCOPE]) });
  const reason = denyReason(
    'linear-lint',
    { tool_name: 'mcp__claude_ai_Linear__save_issue', tool_input: { title: '有効化の条件を直す', description: BODY } },
    ctx
  );
  assert.match(reason, /\[summary-scope\]/);
  assert.doesNotMatch(ctx.reviewInput(), /<change>/);
});

test('gh pr edit の PR 番号と --repo を取り出す', () => {
  const [edit] = parsePrCommands('gh pr edit 5235 --repo owner/repo --body "本文"');
  assert.equal(edit.sub, 'edit');
  assert.equal(edit.selector, '5235');
  assert.equal(edit.repo, 'owner/repo');
  const [create] = parsePrCommands('gh pr create -B develop --title "t" --body "本文"');
  assert.equal(create.sub, 'create');
  assert.equal(create.selector, null);
  assert.equal(create.base, 'develop');
});

test('規約のレビューは止めた回数に上限を設けず、本文が変わるたびに呼ぶ', () => {
  const ctx = modelEnv({ review: output([SCOPE]) });
  for (let i = 0; i < 4; i += 1) {
    assert.match(denyReason('pr-lint', prInput(`${BODY}${i} 回目の追記です。\n`), ctx), /\[summary-scope\]/);
  }
  assert.equal(ctx.calls('review'), 4);
  // レビューだけで止めた回数は、読み手の上限に数えない。
  assert.equal(ctx.calls('reader'), 4);
});

test('読み手が上限に達した後も、規約のレビューは続ける', () => {
  const cas = { term: 'CAS 敗者', kind: 'coined', reason: '何に負けた側かが決まらない。', suggestion: '同時更新で失敗した側', confidence: 'medium' };
  const ctx = modelEnv({ reader: output([cas]), review: output([SCOPE]) });
  for (let i = 0; i < 3; i += 1) denyReason('pr-lint', prInput(`${BODY}${i} 回目の追記です。\n`), ctx);
  assert.equal(ctx.calls('reader'), 2);
  assert.equal(ctx.calls('review'), 3);
});

test('200 文字未満の本文も規約のレビューに渡す', () => {
  const ctx = modelEnv({ review: output([SCOPE]) });
  assert.match(denyReason('pr-lint', prInput('日次デプロイです。\n'), ctx), /\[summary-scope\]/);
  assert.equal(ctx.calls('reader'), 0);
  assert.equal(ctx.calls('review'), 1);
});

test('gh pr edit の PR 番号は、オプションの値を除いた位置引数から取る', () => {
  assert.equal(parsePrCommands('gh pr edit --title "t" 123 --body "本文"')[0].selector, '123');
  assert.equal(parsePrCommands('gh pr edit --add-label bug -R o/r https://github.com/o/r/pull/9 --body "本文"')[0].selector, 'https://github.com/o/r/pull/9');
  assert.equal(parsePrCommands('gh pr edit --title=t --body "本文"')[0].selector, null);
});
