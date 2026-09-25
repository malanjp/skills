// UserPromptSubmit ゲートの判定テスト。
// 共有される文章の作成・推敲依頼で命中し、それ以外では何も出力しないことを確かめる。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { makeConfigDir, runHook, gateHits } = require('./helpers');

const HIT = [
  'リライトして',
  'この文章を清書して',
  '言い回しを直して',
  '議事録まとめて',
  'コミットメッセージ書いて',
  '設計書のドラフト作って',
  'runbook を用意して',
  '要約して',
  'changelog 更新',
  'てにをはだけ直して',
  'Issue を起票して',
  'PR の description を書いて',
  'このレビュー指摘を直して',
  '障害報告を作って',
  '見直し提案を書いて',
  '改善案をまとめて',
];

const MISS = [
  'ls して',
  'テスト通った？',
  'ファイル消して',
  'こんにちは',
  'ビルド直して',
  'この関数どういう意味？',
  'npm install して',
  'git status',
  'quadrilateral の面積を計算して',
  'badrequest の例外処理を追加して',
];

test('共有文章の作成・推敲依頼で命中する', () => {
  const dir = makeConfigDir();
  for (const prompt of HIT) {
    assert.equal(gateHits(prompt, dir), true, `命中しなかった: ${prompt}`);
  }
});

test('作業指示や短い質問では命中しない', () => {
  const dir = makeConfigDir();
  for (const prompt of MISS) {
    assert.equal(gateHits(prompt, dir), false, `誤って命中した: ${prompt}`);
  }
});

test('日本語 200 文字の閾値で切り替わる', () => {
  const dir = makeConfigDir();
  // トリガ語を含まない日本語だけで長さの効果を見る。
  const unit = 'あいうえおかきくけこ';
  assert.equal(gateHits(unit.repeat(19) + 'あいうえおかきくけ', dir), false, '199 文字で命中した');
  assert.equal(gateHits(unit.repeat(20), dir), true, '200 文字で命中しなかった');
});

test('同一セッションの 2 回目はアンカー全文ではなくリマインダになる', () => {
  const dir = makeConfigDir();
  const session = 'same-session';
  const first = runHook('gate', { prompt: '推敲して', session_id: session }, dir);
  const second = runHook('gate', { prompt: '推敲して', session_id: session }, dir);

  assert.ok(first.includes('アンカー'), '1 回目にアンカー全文が出ていない');
  assert.ok(!second.includes('アンカー'), '2 回目にアンカー全文が再掲された');
  assert.ok(second.includes('tech-writing'), '2 回目のリマインダにスキル名がない');
  assert.ok(second.length < first.length, '2 回目が 1 回目より短くなっていない');
});

test('セッションが違えば再びアンカー全文を出す', () => {
  const dir = makeConfigDir();
  const a = runHook('gate', { prompt: '推敲して', session_id: 'sess-a' }, dir);
  const b = runHook('gate', { prompt: '推敲して', session_id: 'sess-b' }, dir);
  assert.ok(a.includes('アンカー'));
  assert.ok(b.includes('アンカー'));
});

test('状態ファイルは CLAUDE_CONFIG_DIR の下にだけ作られる', () => {
  const dir = makeConfigDir();
  runHook('gate', { prompt: '推敲して', session_id: 'state-check' }, dir);
  const statePath = path.join(dir, '.tired-dev-state.json');
  assert.ok(fs.existsSync(statePath), '状態ファイルが指定ディレクトリに作られていない');
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  assert.equal(state['state-check'], 1);
});

test('状態ファイルは直近 20 セッション分に収まる', () => {
  const dir = makeConfigDir();
  for (let i = 0; i < 25; i += 1) {
    runHook('gate', { prompt: '推敲して', session_id: `bulk-${i}` }, dir);
  }
  const state = JSON.parse(
    fs.readFileSync(path.join(dir, '.tired-dev-state.json'), 'utf8')
  );
  assert.ok(Object.keys(state).length <= 20, `セッション数が上限を超えた: ${Object.keys(state).length}`);
});

test('プロンプトが空、または欠落していても落ちない', () => {
  const dir = makeConfigDir();
  assert.equal(runHook('gate', { prompt: '', session_id: 'empty' }, dir), '');
  assert.equal(runHook('gate', { session_id: 'missing' }, dir), '');
  assert.equal(runHook('gate', {}, dir), '');
});

test('SessionStart は適用対象と正本のパスを通知する', () => {
  const dir = makeConfigDir();
  const out = runHook('activate', {}, dir);
  assert.ok(out.startsWith('tired-dev:tech-writing 有効。'), '通知がスキル名から始まっていない');
  assert.ok(out.includes('SKILL.md'), '正本のパスが含まれていない');
  assert.ok(out.includes('anchor.md'), '要約のパスが含まれていない');
});

test('TIRED_DEV_CHAT が無効なら、チャット向けの規則を出さない', () => {
  const dir = makeConfigDir();
  for (const value of ['', '0', 'off', 'false', 'no', 'まる']) {
    const out = runHook('activate', {}, dir, { TIRED_DEV_CHAT: value });
    assert.ok(!out.includes('チャット返答にも適用する規則'), `値 ${JSON.stringify(value)} で注入された`);
  }
});

test('TIRED_DEV_CHAT が有効なら、語彙と認知負荷だけを足す', () => {
  const dir = makeConfigDir();
  for (const value of ['1', 'on', 'true', 'YES', ' On ']) {
    const out = runHook('activate', {}, dir, { TIRED_DEV_CHAT: value });
    assert.ok(out.includes('チャット返答にも適用する規則'), `値 ${JSON.stringify(value)} で注入されなかった`);
  }
  const out = runHook('activate', {}, dir, { TIRED_DEV_CHAT: '1' });
  assert.ok(out.includes('正典'), '語彙の表が含まれていない');
  assert.ok(out.includes('二重否定'), '認知負荷の項目が含まれていない');
  assert.ok(!out.includes('受け入れ条件のチェックボックス'), '文書の形式まで持ち込んでいる');
  assert.ok(out.startsWith('tired-dev:tech-writing 有効。'), '通常の通知が先頭から消えている');
});
