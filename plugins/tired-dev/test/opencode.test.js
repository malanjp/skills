// OpenCode V2 対応のテスト。
// プラグインが使う共有ライブラリ (gate-lib / pr-lint-lib) の判定を確かめる。
// プラグイン本体 (opencode/index.ts) は OpenCode のランタイムで動く薄い層なので、
// 判定を持つライブラリをここで固定する。

const test = require('node:test');
const assert = require('node:assert/strict');
const { findPrFindings } = require('../hooks/pr-lint-lib');
const { isGateHit } = require('../hooks/gate-lib');

const BAD_TITLE = 'fix: 正典で検証する';
const GOOD_TITLE = 'fix: 共通スキーマで検証する';
const GOOD_BODY = '## 目的\n\n抽出側の設定を共通スキーマで検証する。\n';

test('OpenCode の PR 検査は規約違反のタイトルを止める', () => {
  const findings = findPrFindings({
    command: `gh pr create --title "${BAD_TITLE}" --body "${GOOD_BODY}"`,
    cwd: process.cwd(),
    env: {},
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].rule, 'jargon');
  assert.match(findings[0].found, /正典/);
});

test('OpenCode の PR 検査は違反がなければ空になる', () => {
  const findings = findPrFindings({
    command: `gh pr create --title "${GOOD_TITLE}" --body "${GOOD_BODY}"`,
    cwd: process.cwd(),
    env: {},
  });
  assert.deepEqual(findings, []);
});

test('OpenCode の PR 検査は TIRED_DEV_PR_LINT=off で止まる', () => {
  const findings = findPrFindings({
    command: `gh pr create --title "${BAD_TITLE}"`,
    env: { TIRED_DEV_PR_LINT: 'off' },
  });
  assert.deepEqual(findings, []);
});

test('OpenCode の PR 検査は前置の bypass を尊重する', () => {
  const findings = findPrFindings({
    command: `TIRED_DEV_PR_LINT=off gh pr create --title "${BAD_TITLE}"`,
    env: {},
  });
  assert.deepEqual(findings, []);
});

test('OpenCode の PR 検査は parallel-style だけでは止めない', () => {
  const body = '## 確認\n\n- 単体テストが通ることを確認した\n- lint の実行\n- 型検査が通る\n';
  const findings = findPrFindings({
    command: `gh pr create --title "${GOOD_TITLE}" --body "${body}"`,
    env: {},
  });
  assert.deepEqual(findings, []);
});

test('OpenCode のゲートは Claude 版と同じ入力を命中にする', () => {
  for (const prompt of ['リライトして', 'PR の description を書いて', '議事録まとめて']) {
    assert.equal(isGateHit(prompt), true, `命中しなかった: ${prompt}`);
  }
  for (const prompt of ['ls して', 'git status', 'テスト通った？']) {
    assert.equal(isGateHit(prompt), false, `誤って命中した: ${prompt}`);
  }
  assert.equal(isGateHit(''), false);
  assert.equal(isGateHit(undefined), false);
});
