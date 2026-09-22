// Cursor プラグインのマニフェストが、公開ドキュメントの制約を満たすかを検査する。
// スキーマ外の項目はここでは足さない。公式テンプレートが使っている displayName だけを許す。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PLUGIN_DIR = path.resolve(__dirname, '..');

const NAME_PATTERN = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertRelativePath(spec) {
  assert.equal(typeof spec, 'string');
  assert.ok(!path.isAbsolute(spec), `${spec} は相対パスである`);
  const parts = spec.split(/[/\\]/).filter((part) => part && part !== '.');
  assert.ok(!parts.includes('..'), `${spec} に .. を含めない`);
  return parts;
}

function resolveInside(root, spec) {
  return path.join(root, ...assertRelativePath(spec));
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.ok(match, 'YAML frontmatter で始まる');
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const sep = line.indexOf(':');
    assert.ok(sep > 0, `frontmatter の行を読める: ${line}`);
    fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  return { fields, body: match[2].replace(/^\n/, '') };
}

test('マーケットプレイスが tired-dev を 1 件だけ公開する', () => {
  const file = path.join(REPO_ROOT, '.cursor-plugin', 'marketplace.json');
  const marketplace = readJson(file);

  assert.equal(marketplace.name, 'malanjp');
  assert.match(marketplace.name, NAME_PATTERN);
  assert.equal(marketplace.owner.name, 'malanjp');
  assert.equal(marketplace.metadata.pluginRoot, 'plugins');
  assert.equal(marketplace.plugins.length, 1);

  const entry = marketplace.plugins[0];
  assert.equal(entry.name, 'tired-dev');
  assert.match(entry.name, NAME_PATTERN);
  assert.equal(entry.source, 'tired-dev');
  assert.match(entry.version, SEMVER_PATTERN);
  assert.equal(entry.license, 'MIT');
  assert.equal(entry.author.name, 'malanjp');

  const pluginDir = resolveInside(
    REPO_ROOT,
    path.posix.join(marketplace.metadata.pluginRoot, entry.source),
  );
  assert.equal(pluginDir, PLUGIN_DIR);
  assert.ok(fs.existsSync(path.join(pluginDir, '.cursor-plugin', 'plugin.json')));
});

test('プラグインマニフェストがスキルと規約だけを参照する', () => {
  const manifest = readJson(path.join(PLUGIN_DIR, '.cursor-plugin', 'plugin.json'));
  const pkg = readJson(path.join(PLUGIN_DIR, 'package.json'));

  assert.equal(manifest.name, 'tired-dev');
  assert.match(manifest.name, NAME_PATTERN);
  assert.equal(manifest.version, pkg.version);
  assert.match(manifest.version, SEMVER_PATTERN);
  assert.equal(manifest.author.name, 'malanjp');
  assert.equal(manifest.license, 'MIT');
  assert.equal(typeof manifest.description, 'string');
  assert.ok(manifest.description.length > 0);
  assert.ok(Array.isArray(manifest.keywords));

  assert.equal(manifest.skills, './skills');
  assert.deepEqual(manifest.rules, ['./rules/anchor.mdc', './rules/chat.mdc']);
  assert.equal(manifest.agents, undefined);
  assert.equal(manifest.commands, undefined);
  assert.equal(manifest.hooks, undefined);
  assert.equal(manifest.mcpServers, undefined);

  const skillsDir = resolveInside(PLUGIN_DIR, manifest.skills);
  const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());
  assert.deepEqual(skillDirs.map((entry) => entry.name), ['tech-writing']);

  for (const entry of skillDirs) {
    const skillFile = path.join(skillsDir, entry.name, 'SKILL.md');
    const { fields } = frontmatter(fs.readFileSync(skillFile, 'utf8'));
    assert.equal(fields.name, 'tech-writing');
    assert.match(fields.name, NAME_PATTERN);
    assert.ok(fields.description.length > 0);
  }
});

test('Cursor 向け規約は frontmatter を持ち、本文は既存の正本と一致する', () => {
  const pairs = [
    ['anchor.md', 'anchor.mdc', 'false'],
    ['chat.md', 'chat.mdc', 'false'],
  ];

  for (const [sourceName, ruleName, alwaysApply] of pairs) {
    const source = fs.readFileSync(path.join(PLUGIN_DIR, 'rules', sourceName), 'utf8');
    const rule = fs.readFileSync(path.join(PLUGIN_DIR, 'rules', ruleName), 'utf8');
    const { fields, body } = frontmatter(rule);

    assert.ok(fields.description.length > 0);
    assert.equal(fields.alwaysApply, alwaysApply);
    assert.deepEqual(Object.keys(fields).sort(), ['alwaysApply', 'description']);
    assert.equal(body, source);
  }
});
