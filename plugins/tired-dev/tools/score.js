#!/usr/bin/env node
// 規約が要求する要素が文書に含まれているかを測る。
//
// tools/lint.js が「書いてはいけないもの」を減点で見るのに対し、
// ここは「書いてあるべきもの」を加点で見る。
// 生成物どうしを比べるとき、違反件数だけでは差が出ないことがあるため両方を使う。
//
// 使い方:
//   node tools/score.js <file> --expect bluf,file-ref,run-command
//   node tools/score.js <file> --expect ... --json

const fs = require('node:fs');

// コードブロックの中身も見る。検証コマンドや diff はブロックの中にあるため。
const checks = {
  bluf: {
    label: '冒頭の結論',
    test: (text) => {
      const lines = text.split('\n').filter((l) => l.trim());
      const head = lines.slice(0, 4).join('\n');
      return /結論|要約|BLUF|判定|件$|件[。、]|Critical|Warning|保留|問題なし/m.test(head);
    },
  },
  'file-ref': {
    label: 'ファイルと行番号の明記',
    test: (text) => /[\w./@-]+\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|sql|md):\d+/.test(text),
  },
  'run-command': {
    label: 'そのまま実行できる検証コマンド',
    test: (text) => /```(?:bash|sh|shell|console)\n[\s\S]*?\n```/.test(text),
  },
  acceptance: {
    label: '受け入れ条件のチェックボックス',
    test: (text) => /^\s*-\s*\[[ x]\]\s+\S/m.test(text),
  },
  severity: {
    label: '重大度ラベル',
    test: (text) => /Critical|Warning|Suggestion|Nitpick|重大度|重要度/.test(text),
  },
  'diff-block': {
    label: '最小差分の提示',
    test: (text) => /```diff\n[\s\S]*?\n```/.test(text),
  },
  'blast-radius': {
    label: '影響範囲への言及',
    test: (text) => /影響範囲|Blast Radius|呼び出し元|波及|依存(?:先|元)/.test(text),
  },
  'out-of-scope': {
    label: 'スコープ外の明示',
    test: (text) => /スコープ外|Out of Scope|対象外|やらないこと|今回は対応しない/.test(text),
  },
  'fact-vs-hypothesis': {
    label: '事実と仮説の分離',
    test: (text) => /未確認|裏取り|仮説|可能性がある|未検証/.test(text) && /事実|観測|確認した|判明/.test(text),
  },
  'next-steps': {
    label: '次にとる行動',
    test: (text) => /対応方針|Next steps|次の(?:手|一手|ステップ)|恒久対応|暫定対応|修正案/.test(text),
  },
  table: {
    label: '属性のテーブル化',
    // 区切り行は列数ぶん `|---|` が並ぶ。1 列でも複数列でも一致させる。
    test: (text) => /^\s*\|.+\|\s*$/m.test(text) && /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/m.test(text),
  },
  quantified: {
    label: '定量的な記述',
    test: (text) => /\d+\s*(?:件|箇所|行|%|ms|秒|分|人|MB|GB)/.test(text),
  },
  mermaid: {
    label: '通信・処理フローの図解',
    test: (text) => /```mermaid\n[\s\S]*?\n```/.test(text),
  },
  decision: {
    label: '判断事項と推奨方針の対比',
    test: (text) => /判断(?:事項|してほしい)|推奨(?:方針|案)/.test(text),
  },
  'verification-plan': {
    label: '未検証事項と検証計画',
    test: (text) => /検証計画|確認項目|検証手順|フォールバック|成立しない場合/.test(text),
  },
};

function scoreText(text, expected) {
  const ids = expected.filter((id) => checks[id]);
  const present = ids.filter((id) => checks[id].test(text));
  const missing = ids.filter((id) => !present.includes(id));
  return {
    present,
    missing,
    rate: ids.length === 0 ? 1 : present.length / ids.length,
    count: present.length,
    of: ids.length,
  };
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  const expectArg = argv.includes('--expect') ? argv[argv.indexOf('--expect') + 1] : '';
  const asJson = argv.includes('--json');
  if (!file || !expectArg) {
    process.stderr.write('使い方: node tools/score.js <file> --expect id1,id2 [--json]\n');
    process.stderr.write(`要素の id: ${Object.keys(checks).join(', ')}\n`);
    return 2;
  }
  const text = fs.readFileSync(file, 'utf8');
  const result = scoreText(text, expectArg.split(',').map((s) => s.trim()));
  if (asJson) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    process.stdout.write(`充足 ${result.count}/${result.of}\n`);
    for (const id of result.present) process.stdout.write(`  ある: ${checks[id].label}\n`);
    for (const id of result.missing) process.stdout.write(`  ない: ${checks[id].label}\n`);
  }
  return result.missing.length > 0 ? 1 : 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { checks, scoreText };
