// 応答を日本語に保つフックの判定テスト。
// 英語のままの応答だけを止め、日本語の応答、短い応答、書き直しの直後は止めない。

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { PLUGIN_ROOT, makeConfigDir, runHook } = require('./helpers');

const ENGLISH =
  'The change replaces the CDKTF binary with OpenTofu. The plan and apply steps now download tofu from GitHub Releases and verify the SHA-256 before using it. The install also moved to the repository root, so run pnpm install there.';
const JAPANESE =
  'plan と apply は OpenTofu で実行するように変更しました。ダウンロードしたバイナリの SHA-256 を照合してから使います。依存はリポジトリルートの install で入ります。';

// Stop フックを実行し、止める場合だけ decision を返す。
function stopDecision(input, env = {}) {
  const out = runHook('ja-stop', input, makeConfigDir(), env).trim();
  return out ? JSON.parse(out) : null;
}

test('英語のままの長い応答は日本語で書き直させる', () => {
  const decision = stopDecision({ last_assistant_message: ENGLISH });
  assert.equal(decision.decision, 'block');
  assert.match(decision.reason, /日本語/);
});

test('日本語の応答は止めない', () => {
  assert.equal(stopDecision({ last_assistant_message: JAPANESE }), null);
});

test('80 字未満の英語は止めない', () => {
  assert.equal(stopDecision({ last_assistant_message: 'The build passed.' }), null);
});

test('書き直しの直後 (stop_hook_active) は止めない', () => {
  assert.equal(stopDecision({ last_assistant_message: ENGLISH, stop_hook_active: true }), null);
});

test('TIRED_DEV_JA_OUTPUT を off にすると止めない', () => {
  assert.equal(stopDecision({ last_assistant_message: ENGLISH }, { TIRED_DEV_JA_OUTPUT: 'off' }), null);
});

test('コードブロックと URL だけの応答は止めない', () => {
  const code = '```bash\n' + 'echo hello\n'.repeat(20) + '```\nhttps://example.com/docs';
  assert.equal(stopDecision({ last_assistant_message: code }), null);
});

test('last_assistant_message が無ければトランスクリプトから読む', () => {
  const configDir = makeConfigDir();
  const transcript = path.join(configDir, 'transcript.jsonl');
  fs.writeFileSync(
    transcript,
    [
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: '直して' }] } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: ENGLISH }] } }),
    ].join('\n') + '\n'
  );
  const out = runHook('ja-stop', { transcript_path: transcript }, configDir).trim();
  assert.equal(JSON.parse(out).decision, 'block');
});

test('トランスクリプトが読めなくても落ちない', () => {
  assert.equal(stopDecision({ transcript_path: '/nonexistent/transcript.jsonl' }), null);
});

test('JSON でない入力でも落ちない', () => {
  const script = path.join(PLUGIN_ROOT, 'hooks', 'ja-stop.js');
  const out = execFileSync(process.execPath, [script], {
    input: 'not json',
    encoding: 'utf8',
    env: { ...process.env, TIRED_DEV_JA_OUTPUT: '' },
  });
  assert.equal(out, '');
});

test('SessionStart フックは日本語で書く指示を返す', () => {
  const out = runHook('ja-context', { hook_event_name: 'SessionStart', source: 'compact' }, makeConfigDir()).trim();
  const payload = JSON.parse(out);
  assert.equal(payload.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(payload.hookSpecificOutput.additionalContext, /日本語/);
});

test('TIRED_DEV_JA_OUTPUT を off にすると SessionStart も注入しない', () => {
  const out = runHook(
    'ja-context',
    { hook_event_name: 'SessionStart', source: 'compact' },
    makeConfigDir(),
    { TIRED_DEV_JA_OUTPUT: 'off' }
  );
  assert.equal(out, '');
});

test('プラグインは Stop と compact 用の SessionStart を登録する', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(PLUGIN_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const stop = manifest.hooks.Stop.flatMap((group) => group.hooks);
  assert.ok(stop.some((hook) => hook.command.includes('ja-stop.js')));

  const restart = manifest.hooks.SessionStart.filter((group) => (group.matcher ?? '').includes('compact'));
  const commands = restart.flatMap((group) => group.hooks);
  assert.ok(commands.some((hook) => hook.command.includes('ja-context.js')));
});
