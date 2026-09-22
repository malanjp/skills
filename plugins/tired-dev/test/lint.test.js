// 規約チェッカのテスト。
// 各規則について、違反する文と違反しない文の両方を置く。
// 偽陽性は信号を殺すため、陰性ケースのほうを厚くする。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lintText, summarize } = require('../tools/lint');

const PLUGIN_ROOT = path.resolve(__dirname, '..');

function ruleIds(text) {
  return lintText(text).map((f) => f.rule);
}

test('語彙表の禁止語を検出する', () => {
  assert.ok(ruleIds('設定が全プロジェクトに効く。').includes('jargon'));
  assert.ok(ruleIds('フックを効かせる。').includes('jargon'));
  assert.ok(ruleIds('包括的なテストを書く。').includes('jargon'));
  assert.ok(ruleIds('追補チケットを作成する。').includes('jargon'));
  assert.deepEqual(lintText('追加の対応チケットを作成する。'), []);
  assert.deepEqual(lintText('別途対応する課題として登録する。'), []);
  assert.deepEqual(lintText('「追補チケット」は使わない。'), []);
  assert.ok(ruleIds('直下流を即 skip しない。').includes('jargon'));
  assert.deepEqual(lintText('直接つながる次のステップを、その場でスキップしない。'), []);
  assert.deepEqual(lintText('「直下流」は使わない。'), []);
  // 「効」を含む別語を巻き込まない。
  assert.ok(!ruleIds('規約の効果を測る。').includes('jargon'));
  assert.ok(!ruleIds('設定を有効にする。').includes('jargon'));
  assert.ok(!ruleIds('処理を無効にする。').includes('jargon'));
  assert.ok(!ruleIds('効率を上げる。').includes('jargon'));
  // 禁止語を引用して説明する文は違反にしない。
  assert.ok(!ruleIds('「効く」は使わず「適用する」と書く。').includes('jargon'));
});

test('曖昧な数量詞を検出する', () => {
  assert.ok(ruleIds('多くのテストが失敗した。').includes('vague-quantifier'));
  assert.ok(!ruleIds('12 件のテストが失敗した。').includes('vague-quantifier'));
});

test('抽象的な警告を検出する', () => {
  assert.ok(ruleIds('このままだと保守性が下がる。').includes('vague-why'));
  assert.ok(!ruleIds('呼び出し元 3 箇所で型が合わなくなる。').includes('vague-why'));
});

test('規約にない項目は検出しない', () => {
  // 全角かっこは CLAUDE.md の表記ルールであって、規約 (SKILL.md) の規則ではない。
  assert.deepEqual(lintText('対象は 3 件（未確認）である。'), []);
});

test('漢字の連結を検出する', () => {
  assert.ok(ruleIds('認証情報取得処理実行時に落ちる。').includes('kanji-run'));
  assert.ok(!ruleIds('認証情報を取得する処理で落ちる。').includes('kanji-run'));
});

test('二重否定を検出する', () => {
  assert.ok(ruleIds('検証されていないわけではない。').includes('double-negative'));
  assert.ok(!ruleIds('検証済みである。').includes('double-negative'));
});

test('長い文を検出する', () => {
  const long = `${'この処理は入力を検証してから保存する'.repeat(8)}。`;
  assert.ok(ruleIds(long).includes('long-sentence'));
  assert.ok(!ruleIds('この処理は入力を検証してから保存する。').includes('long-sentence'));
});

test('後方参照を検出する', () => {
  assert.ok(ruleIds('上記の関数で落ちる。').includes('back-reference'));
  assert.ok(ruleIds('前述のとおり再現する。').includes('back-reference'));
  assert.ok(!ruleIds('`parseOrgId()` で落ちる。').includes('back-reference'));
});

test('並列する項目の文末の混在を検出する', () => {
  const mixed = ['- 入力を検証する', '- 保存する', '- 結果の通知'].join('\n');
  const allSentence = ['- 入力を検証する', '- 保存する', '- 結果を通知する'].join('\n');
  const allNoun = ['- 入力の検証', '- 保存', '- 結果の通知'].join('\n');
  assert.ok(ruleIds(mixed).includes('parallel-style'));
  assert.ok(!ruleIds(allSentence).includes('parallel-style'));
  assert.ok(!ruleIds(allNoun).includes('parallel-style'));
});

test('ラベル付きの属性リストは文末の混在を見ない', () => {
  const labelled = [
    '- **契機**: 障害の調査 (2026-09-10 発生)',
    '- **事実**: `catch` 節が `return null` だけを実行する。',
    '- **対応方針**: 例外を呼び出し元へ伝える。',
  ].join('\\n');
  assert.ok(!ruleIds(labelled).includes('parallel-style'));
});

test('2 項目だけの並びは文末の混在を見ない', () => {
  const twoItems = ['- 入力を検証する', '- 結果の通知'].join('\n');
  assert.ok(!ruleIds(twoItems).includes('parallel-style'));
});

test('句点で終わる項目と動詞で終わる項目は同じ文末止めとみなす', () => {
  const mixedButSame = ['- 入力を検証する。', '- 保存する', '- 結果を通知する。'].join('\n');
  assert.ok(!ruleIds(mixedButSame).includes('parallel-style'));
});

test('インデントが違う箇条書きは別の並びとして数える', () => {
  const nested = ['- 検証する', '  - 入力の形式', '  - 値の範囲', '  - 権限の確認', '- 保存する'].join('\n');
  assert.ok(!ruleIds(nested).includes('parallel-style'));
});

test('箇条書きの 3 階層目を検出する', () => {
  const deep = ['- 一階層', '  - 二階層', '    - 三階層'].join('\n');
  const shallow = ['- 一階層', '  - 二階層'].join('\n');
  assert.ok(ruleIds(deep).includes('list-depth'));
  assert.ok(!ruleIds(shallow).includes('list-depth'));
});

test('接続詞の連鎖を検出する', () => {
  const chained = ['また、A を直す。', 'なお、B も直す。', 'さらに、C も直す。'].join('\n');
  assert.ok(ruleIds(chained).includes('conjunction-chain'));
  const twice = ['また、A を直す。', 'なお、B も直す。'].join('\n');
  assert.ok(!ruleIds(twice).includes('conjunction-chain'));
});

test('要約の欠落を検出する', () => {
  const noBluf = ['# 調査結果', '', '## 背景', '', '調査した。'].join('\n');
  const withBluf = ['# 調査結果', '', '結論は 3 件の不整合である。', '', '## 背景'].join('\n');
  assert.ok(ruleIds(noBluf).includes('bluf-missing'));
  assert.ok(!ruleIds(withBluf).includes('bluf-missing'));
});

test('コードブロックの中は判定しない', () => {
  const text = ['```bash', '# 多くの場合はこれで足りる（例）', 'echo hi', '```'].join('\n');
  assert.deepEqual(lintText(text), []);
});

test('frontmatter の中は判定しない', () => {
  const text = ['---', 'description: 多くの場合に適用する（例）', '---', '', '本文。'].join('\n');
  assert.deepEqual(lintText(text), []);
});

test('引用された禁止語は著者の表現として数えない', () => {
  assert.deepEqual(lintText('「多くの」を使わず件数で書く。'), []);
  assert.deepEqual(lintText('`foo.ts:10 ←` のような走り書きをやめる。'), []);
});

test('表と引用行は判定しない', () => {
  assert.deepEqual(lintText('| 用語 | 多くの | 保守性が下がる |'), []);
  assert.deepEqual(lintText('> 多くの環境で再現する（未確認）'), []);
});

test('summarize は規則ごとの件数を返す', () => {
  const findings = lintText('多くの環境で再現する。かなり遅い。');
  const { total, byRule } = summarize(findings);
  assert.equal(total, findings.length);
  assert.equal(byRule['vague-quantifier'], 2);
});

test('規約本体は自身のチェックを通る', () => {
  for (const rel of ['SKILL.md', 'rules/anchor.md', 'README.md']) {
    const text = fs.readFileSync(path.join(PLUGIN_ROOT, rel), 'utf8');
    const findings = lintText(text, rel);
    assert.deepEqual(
      findings.map((f) => `${f.file}:${f.line} ${f.rule}`),
      [],
      `${rel} が自身の規約に違反している`
    );
  }
});
