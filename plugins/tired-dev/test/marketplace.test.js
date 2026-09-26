// 複数ファイルに重複する版番号とスキル説明文が、互いにずれていないことを検査する。
//
// 版番号は package.json、プラグインマニフェスト、マーケットプレイスの 3 種に現れる。
// マーケットプレイスの版だけ古いまま残ると、導入時に古い版が配られる。
// スキル説明文は正本 SKILL.md と各パッケージの入口 SKILL.md に現れる。
// 説明文がずれると、スキルの起動条件がパッケージごとに変わる。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const CLAUDE_DIR = path.join(REPO_ROOT, 'plugins', 'tired-dev');
const CURSOR_DIR = path.join(REPO_ROOT, 'plugins', 'tired-dev-cursor');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// frontmatter の 1 フィールドを読む。値は 1 行である前提を置く。
function frontmatterField(file, field) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, `${file} は YAML frontmatter で始まる`);
  const line = match[1].split(/\r?\n/).find((l) => l.startsWith(`${field}:`));
  assert.ok(line, `${file} に ${field} がある`);
  return line.slice(field.length + 1).trim();
}

test('版番号は package.json とプラグインマニフェストとマーケットプレイスで一致する', () => {
  const cases = [
    {
      label: 'Claude Code 用 tired-dev',
      dir: CLAUDE_DIR,
      manifest: ['.claude-plugin', 'plugin.json'],
      marketplace: ['.claude-plugin', 'marketplace.json'],
      pluginName: 'tired-dev',
    },
    {
      label: 'Cursor 用 tired-dev-cursor',
      dir: CURSOR_DIR,
      manifest: ['.cursor-plugin', 'plugin.json'],
      marketplace: ['.cursor-plugin', 'marketplace.json'],
      pluginName: 'tired-dev-cursor',
    },
  ];

  for (const { label, dir, manifest, marketplace, pluginName } of cases) {
    const pkg = readJson(path.join(dir, 'package.json'));
    const manifestJson = readJson(path.join(dir, ...manifest));
    const marketplaceJson = readJson(path.join(REPO_ROOT, ...marketplace));
    const entry = marketplaceJson.plugins.find((p) => p.name === pluginName);

    assert.ok(entry, `${label}: マーケットプレイスに ${pluginName} がある`);
    assert.equal(pkg.version, manifestJson.version, `${label}: package.json と plugin.json の版が違う`);
    assert.equal(pkg.version, entry.version, `${label}: package.json と marketplace.json の版が違う`);
  }
});

test('スキル説明文は正本 SKILL.md と各入口で一致する', () => {
  const canonical = frontmatterField(path.join(CLAUDE_DIR, 'SKILL.md'), 'description');
  const entries = [
    path.join(CLAUDE_DIR, 'skills', 'tech-writing', 'SKILL.md'),
    path.join(CURSOR_DIR, 'skills', 'tech-writing', 'SKILL.md'),
  ];

  for (const entry of entries) {
    assert.equal(frontmatterField(entry, 'description'), canonical, `${entry} の description が正本と違う`);
  }
});
