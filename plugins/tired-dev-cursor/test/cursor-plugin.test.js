// Cursor プラグインが、Claude 用 tired-dev と別パッケージだと分かることを検査する。
// スキル名 tech-writing は変えない。規約本文は tired-dev の正本と一致させる。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PLUGIN_DIR = path.resolve(__dirname, '..');
const CLAUDE_DIR = path.join(REPO_ROOT, 'plugins', 'tired-dev');

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

test('マーケットプレイスは Cursor 用 tired-dev-cursor を 1 件だけ公開する', () => {
  const marketplace = readJson(path.join(REPO_ROOT, '.cursor-plugin', 'marketplace.json'));

  assert.equal(marketplace.name, 'malanjp');
  assert.match(marketplace.name, NAME_PATTERN);
  assert.equal(marketplace.displayName, 'malanjp（Cursor）');
  assert.match(marketplace.metadata.description, /Cursor/);
  assert.equal(marketplace.metadata.pluginRoot, 'plugins');
  assert.equal(marketplace.plugins.length, 1);

  const entry = marketplace.plugins[0];
  assert.equal(entry.name, 'tired-dev-cursor');
  assert.notEqual(entry.name, 'tired-dev');
  assert.match(entry.name, NAME_PATTERN);
  assert.equal(entry.displayName, 'tired-dev（Cursor）');
  assert.match(entry.description, /Cursor/);
  assert.match(entry.description, /tech-writing/);
  assert.equal(entry.source, 'tired-dev-cursor');
  assert.match(entry.version, SEMVER_PATTERN);
  assert.equal(entry.license, 'MIT');
  assert.equal(entry.author.name, 'malanjp');

  const pluginDir = resolveInside(
    REPO_ROOT,
    path.posix.join(marketplace.metadata.pluginRoot, entry.source),
  );
  assert.equal(pluginDir, PLUGIN_DIR);
  assert.ok(fs.existsSync(path.join(pluginDir, '.cursor-plugin', 'plugin.json')));
  assert.equal(fs.existsSync(path.join(CLAUDE_DIR, '.cursor-plugin')), false);
});

test('プラグインマニフェストは Cursor 用だと分かり、スキル名は tech-writing のまま', () => {
  const manifest = readJson(path.join(PLUGIN_DIR, '.cursor-plugin', 'plugin.json'));
  const pkg = readJson(path.join(PLUGIN_DIR, 'package.json'));
  const claudePkg = readJson(path.join(CLAUDE_DIR, 'package.json'));
  const claudeManifest = readJson(path.join(CLAUDE_DIR, '.claude-plugin', 'plugin.json'));

  assert.equal(manifest.name, 'tired-dev-cursor');
  assert.equal(manifest.displayName, 'tired-dev（Cursor）');
  assert.match(manifest.description, /Cursor/);
  assert.match(manifest.name, NAME_PATTERN);
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.version, claudePkg.version);
  assert.match(manifest.version, SEMVER_PATTERN);
  assert.equal(manifest.author.name, 'malanjp');
  assert.equal(manifest.license, 'MIT');
  assert.ok(manifest.keywords.includes('cursor'));

  assert.equal(claudeManifest.name, 'tired-dev');
  assert.ok(Array.isArray(claudeManifest.hooks.SessionStart));
  assert.ok(Array.isArray(claudeManifest.hooks.UserPromptSubmit));

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

  const skillFile = path.join(skillsDir, 'tech-writing', 'SKILL.md');
  const claudeSkill = frontmatter(fs.readFileSync(
    path.join(CLAUDE_DIR, 'skills', 'tech-writing', 'SKILL.md'),
    'utf8',
  ));
  const { fields } = frontmatter(fs.readFileSync(skillFile, 'utf8'));
  assert.equal(fields.name, 'tech-writing');
  assert.equal(fields.description, claudeSkill.fields.description);
  assert.match(fs.readFileSync(skillFile, 'utf8'), /Cursor 用/);

  assert.equal(
    fs.readFileSync(path.join(PLUGIN_DIR, 'SKILL.md'), 'utf8'),
    fs.readFileSync(path.join(CLAUDE_DIR, 'SKILL.md'), 'utf8'),
  );
});

test('Cursor 向け規約の本文は Claude 用の正本と一致する', () => {
  const pairs = [
    ['anchor.md', 'anchor.mdc', 'false'],
    ['chat.md', 'chat.mdc', 'false'],
  ];

  for (const [sourceName, ruleName, alwaysApply] of pairs) {
    const source = fs.readFileSync(path.join(CLAUDE_DIR, 'rules', sourceName), 'utf8');
    const rule = fs.readFileSync(path.join(PLUGIN_DIR, 'rules', ruleName), 'utf8');
    const { fields, body } = frontmatter(rule);

    assert.ok(fields.description.length > 0);
    assert.equal(fields.alwaysApply, alwaysApply);
    assert.deepEqual(Object.keys(fields).sort(), ['alwaysApply', 'description']);
    assert.equal(body, source);
  }
});
