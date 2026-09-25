// 加点チェッカのうち table 判定のテスト。
// 区切り行の正規表現が列数で取りこぼさないことを固定する。
// 偽陰性は採点を過小評価するため、検出する側のバリエーションを厚くする。

const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreText } = require('../tools/score');

function has(text, id) {
  return scoreText(text, [id]).present.includes(id);
}

test('複数列のテーブルを検出する', () => {
  assert.ok(has('| 項目 | 値 |\n|---|---|\n| 件数 | 3 |', 'table'));
  assert.ok(has('| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |', 'table'));
});

test('1 列のテーブルを検出する', () => {
  assert.ok(has('| 項目 |\n|---|\n| 件数 |', 'table'));
});

test('揃え指定つきの区切り行を検出する', () => {
  assert.ok(has('| 項目 | 値 |\n|:---|---:|\n| 件数 | 3 |', 'table'));
});

test('区切り行のないパイプ行はテーブルとみなさない', () => {
  assert.ok(!has('| a | b |\n| 1 | 2 |', 'table'));
});

test('ハイフンのない行は区切り行とみなさない', () => {
  // GFM は区切りセルにハイフン 1 個以上を要求する。
  assert.ok(!has('| a | b |\n|   |   |\n| 1 | 2 |', 'table'));
  assert.ok(!has('| a | b |\n| : | : |\n| 1 | 2 |', 'table'));
});

test('テーブルのない文書では検出しない', () => {
  assert.ok(!has('対象は 3 件である。\n呼び出し元は 2 箇所。', 'table'));
  // 行頭がパイプでない行は 1 本目の正規表現で落ちる。
  assert.ok(!has('コマンドは `ls | grep foo` である。', 'table'));
});

test('mermaid ブロックを検出する', () => {
  assert.ok(has('```mermaid\nsequenceDiagram\n  A->>B: hi\n```', 'mermaid'));
  assert.ok(!has('```bash\nls -la\n```', 'mermaid'));
});

test('判断事項の対比を検出する', () => {
  assert.ok(has('| 判断事項 | 推奨方針 | 理由 |', 'decision'));
  assert.ok(has('判断してほしい事項は 3 件。推奨案は次のとおり。', 'decision'));
});

test('未検証事項と検証計画を検出する', () => {
  assert.ok(has('検証計画: 確認項目と検証手順を定める', 'verification-plan'));
  assert.ok(has('成立しない場合の対応方針 (フォールバック) を明記する', 'verification-plan'));
});

