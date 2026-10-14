// A/B 評価の集計と表示。
// 採点そのものは tools/lint.js と tools/score.js が行い、ここは並べ方だけを持つ。
//
// 各条件の値は試行ごとの配列で渡る。生成はぶれるため、平均ではなく
// 中央値と最小 - 最大で示す。1 回だけ外れた試行に引きずられないようにする。

const { checks } = require('../tools/score');

const CONDITIONS = ['without-rules', 'with-rules'];

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmt(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// 中央値と範囲を「3 (1-6)」の形にする。ぶれがなければ範囲を省く。
function spread(values) {
  if (values.length === 0) return '未生成';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const mid = fmt(median(values));
  return min === max ? mid : `${mid} (${min}-${max})`;
}

function violations(runs) {
  return runs.map((r) => r.total);
}

function coverage(runs) {
  return runs.map((r) => r.coverage.count);
}

function writeViolations(rows) {
  process.stdout.write('\n違反件数 (中央値と最小 - 最大。少ないほど規約に沿っている)\n\n');
  process.stdout.write('| 課題 | 規約なし | 規約あり |\n|---|---|---|\n');
  const allWithout = [];
  const allWith = [];
  for (const row of rows) {
    const a = violations(row['without-rules']);
    const b = violations(row['with-rules']);
    allWithout.push(...a);
    allWith.push(...b);
    process.stdout.write(`| ${row.id} | ${spread(a)} | ${spread(b)} |\n`);
  }
  const sum = (xs) => xs.reduce((acc, x) => acc + x, 0);
  process.stdout.write(
    `| **全試行の合計** | **${sum(allWithout)}** | **${sum(allWith)}** |\n`
  );
}

function writeCoverage(rows) {
  process.stdout.write('\n要素の充足 (中央値と最小 - 最大。多いほど規約が求める形になっている)\n\n');
  process.stdout.write('| 課題 | 満点 | 規約なし | 規約あり |\n|---|---|---|---|\n');
  for (const row of rows) {
    const a = coverage(row['without-rules']);
    const b = coverage(row['with-rules']);
    const of = row['with-rules'][0]?.coverage.of ?? row['without-rules'][0]?.coverage.of ?? '-';
    process.stdout.write(`| ${row.id} | ${of} | ${spread(a)} | ${spread(b)} |\n`);
  }
}

// 規約が文章を膨らませていないかを見る。要素の充足が同じなら短いほうがよい。
function writeLength(rows) {
  process.stdout.write('\n文字数 (中央値と最小 - 最大。要素の充足が同じなら少ないほど簡潔)\n\n');
  process.stdout.write('| 課題 | 規約なし | 規約あり |\n|---|---|---|\n');
  for (const row of rows) {
    const a = row['without-rules'].map((r) => r.chars);
    const b = row['with-rules'].map((r) => r.chars);
    process.stdout.write(`| ${row.id} | ${spread(a)} | ${spread(b)} |\n`);
  }
}

// 要素ごとに、何回の試行で出現したかを数える。
// 毎回出る要素と、たまたま 1 回出ただけの要素を区別する。
function writeElementStability(rows, runs) {
  const counts = {};
  for (const row of rows) {
    for (const c of CONDITIONS) {
      for (const r of row[c]) {
        for (const id of r.coverage.present) {
          counts[id] = counts[id] || { 'without-rules': 0, 'with-rules': 0 };
          counts[id][c] += 1;
        }
      }
    }
  }
  const ids = Object.keys(counts).sort();
  if (ids.length === 0) return;

  // 各要素を期待している課題の数から、試行あたりの母数を出す。
  const denom = {};
  for (const row of rows) {
    for (const id of row.expect) denom[id] = (denom[id] || 0) + runs;
  }

  process.stdout.write('\n要素ごとの出現回数 (分母は その要素を期待する課題数 × 試行数)\n\n');
  process.stdout.write('| 要素 | 規約なし | 規約あり |\n|---|---|---|\n');
  for (const id of ids) {
    const of = denom[id] || 0;
    const label = checks[id] ? checks[id].label : id;
    process.stdout.write(
      `| ${label} | ${counts[id]['without-rules']}/${of} | ${counts[id]['with-rules']}/${of} |\n`
    );
  }
}

function writeRuleBreakdown(rows) {
  const byRule = {};
  for (const row of rows) {
    for (const c of CONDITIONS) {
      for (const r of row[c]) {
        for (const [rule, n] of Object.entries(r.byRule)) {
          byRule[rule] = byRule[rule] || { 'without-rules': 0, 'with-rules': 0 };
          byRule[rule][c] += n;
        }
      }
    }
  }
  const rules = Object.keys(byRule).sort();
  if (rules.length === 0) return;
  process.stdout.write('\n規則ごとの内訳 (全試行の合計)\n\n| 規則 | 規約なし | 規約あり |\n|---|---|---|\n');
  for (const rule of rules) {
    process.stdout.write(`| ${rule} | ${byRule[rule]['without-rules']} | ${byRule[rule]['with-rules']} |\n`);
  }
}

function report(rows, runs = 1) {
  process.stdout.write(`\n課題 ${rows.length} 本、各条件 ${runs} 回の生成\n`);
  writeViolations(rows);
  writeCoverage(rows);
  writeLength(rows);
  writeElementStability(rows, runs);
  writeRuleBreakdown(rows);
}

module.exports = { report, CONDITIONS, median, spread };
