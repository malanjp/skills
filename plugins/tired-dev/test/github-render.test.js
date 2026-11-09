// GitHub のレンダラで、規約が示す記法が意図どおり表示されるかを検査する。
//
// Markdown の見え方は、書き手の想定とずれる。`[!WARNING]` と同じ行に文言を続けると、
// 警告の枠にならず、記号がそのまま本文に表示される。
// このずれは文字列を読むだけの検査では見つからないため、規約が示す記法を
// GitHub の /markdown API に通し、返る HTML を確かめる。
//
// このテストは gh の認証とネットワークを使う。
// 確認そのものを省かないよう、gh が無い場合や認証が切れている場合は失敗させる。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const SKILL_FILES = [
  path.join(PLUGIN_ROOT, 'SKILL.md'),
  path.join(PLUGIN_ROOT, '..', 'tired-dev-cursor', 'SKILL.md'),
];

const ALERT_TYPES = 'NOTE|TIP|IMPORTANT|WARNING|CAUTION';
const ALERT_MARKER = new RegExp(`\\[!(?:${ALERT_TYPES})\\]`);
const ALERT_LINE = new RegExp(`^> \\[!(?:${ALERT_TYPES})\\]$`);

// 規約に載せた markdown 例のうち、アラートを含むものだけを取り出す。
// 例の外の説明文で記法に触れる箇所は、読み手に表示されないため対象外にする。
function alertExamples(file) {
  const text = fs.readFileSync(file, 'utf8');
  const examples = [];
  for (const match of text.matchAll(/`{3,}markdown\n([\s\S]*?)`{3,}/g)) {
    if (ALERT_MARKER.test(match[1])) examples.push(match[1].trimEnd());
  }
  return examples;
}

function renderOnGitHub(markdown) {
  const input = JSON.stringify({ mode: 'gfm', text: markdown });
  try {
    return execFileSync('gh', ['api', '-X', 'POST', '/markdown', '--input', '-'], {
      input,
      encoding: 'utf8',
      timeout: 20000,
    });
  } catch (error) {
    const detail = String(error.stderr || error.message).trim();
    throw new Error(
      `GitHub のレンダラで確認できませんでした。gh auth login を済ませてください。${detail ? `\n${detail}` : ''}`,
    );
  }
}

// コードブロックの外に記号が残っていたら、アラートとして解釈されていない。
function withoutCodeBlocks(html) {
  return html.replace(/<pre>[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');
}

test('規約のアラート例は記号だけを 1 行に書いている', () => {
  for (const file of SKILL_FILES) {
    const examples = alertExamples(file);
    assert.ok(examples.length > 0, `${file} にアラートの例がある`);
    for (const example of examples) {
      for (const line of example.split('\n')) {
        if (!ALERT_MARKER.test(line)) continue;
        assert.match(line, ALERT_LINE, `${file} のアラートは記号だけを 1 行に書く: ${line}`);
      }
    }
  }
});

test('規約のアラート例は GitHub で警告として表示される', { timeout: 30000 }, () => {
  const examples = new Set();
  for (const file of SKILL_FILES) {
    for (const example of alertExamples(file)) examples.add(example);
  }
  assert.ok(examples.size > 0, 'アラートの例がある');

  for (const example of examples) {
    const html = renderOnGitHub(example);
    assert.match(html, /markdown-alert-warning/, '警告の枠として表示される');
    assert.doesNotMatch(withoutCodeBlocks(html), /\[!/, '記号が本文に残っていない');
  }
});
