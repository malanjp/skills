// 事情を知らない読み手のモデルに本文を読ませ、意味の取れない語を返す。
//
// 語彙のブラックリスト (tools/rules.js) は、同じ語が繰り返し出る「版」「効く」を確実に止める。
// 一方で「CAS 敗者」「モック不達」のような造語は書き手ごとに毎回新しく作られ、リストでは追いつかない。
// この検査は造語を拾うために、コードも会話も見ていないモデルへ本文だけを渡す。
// 19 件の過去の PR と Issue で測った結果は README の「読み手の検査」にある。
//
// 子プロセスの claude には利用者の設定、フック、MCP、ツールを読み込ませない。
// 読み込ませると利用者の CLAUDE.md が混ざって「事情を知らない読み手」にならず、
// このプラグインのフックが子プロセスでも動いて再帰する。
//
// 検査の失敗では投稿を止めない。タイムアウトや出力の破損は指摘 0 件として扱う。

const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PROMPT_PATH = path.join(__dirname, 'reader-prompt.md');
const DEFAULT_MODEL = 'opus';
const TIMEOUT_MS = 45_000;
// これより短い本文は定型の PR (日次デプロイなど) なので読ませない。
const MIN_LENGTH = 200;
const MAX_FINDINGS = 10;
// 測定では high がほぼ付かず、low まで含めると誤指摘が大半になった。medium 以上だけを返す。
const KEPT_CONFIDENCE = new Set(['high', 'medium']);

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          term: { type: 'string' },
          kind: { type: 'string', enum: ['metaphor', 'translation', 'coined'] },
          reason: { type: 'string' },
          suggestion: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['term', 'kind', 'reason', 'suggestion', 'confidence'],
      },
    },
  },
  required: ['findings'],
});

function readerDisabled(env = process.env) {
  return /^(off|0|false|no)$/i.test(String(env.TIRED_DEV_READER ?? '').trim());
}

// 本文を読み手のモデルに渡し、medium 以上の指摘を返す。
// TIRED_DEV_READER_CMD はテストで claude の代わりに使うコマンド。
function runReader(text, env = process.env) {
  if (readerDisabled(env) || !text || text.length < MIN_LENGTH) return [];
  const cmd = env.TIRED_DEV_READER_CMD || 'claude';
  const args = [
    '-p', '--model', env.TIRED_DEV_READER_MODEL || DEFAULT_MODEL,
    '--setting-sources', '', '--strict-mcp-config', '--tools', '', '--no-session-persistence',
    '--output-format', 'json', '--json-schema', SCHEMA,
    '--system-prompt', fs.readFileSync(PROMPT_PATH, 'utf8'),
  ];
  // cwd をリポジトリの外に置き、プロジェクトの CLAUDE.md を拾わせない。
  const res = spawnSync(cmd, args, {
    cwd: os.tmpdir(),
    input: `次の本文を読んでください。\n\n<document>\n${text}\n</document>`,
    encoding: 'utf8',
    timeout: Number(env.TIRED_DEV_READER_TIMEOUT_MS) || TIMEOUT_MS,
    maxBuffer: 16 << 20,
    env,
  });
  if (res.error || res.status !== 0) return [];
  try {
    const out = JSON.parse(res.stdout);
    if (out.is_error) return [];
    const findings = out.structured_output?.findings;
    if (!Array.isArray(findings)) return [];
    return findings
      .filter((f) => f && typeof f.term === 'string' && KEPT_CONFIDENCE.has(f.confidence))
      .slice(0, MAX_FINDINGS);
  } catch {
    return [];
  }
}

function formatReaderFindings(findings) {
  return findings.map((f) => `- 「${f.term}」: ${f.reason} 言い換えの例は「${f.suggestion}」です。`);
}

// 読み手の指摘で一度止めた本文を記録する。
// 同じ本文をもう一度投稿したときは、書き手が指摘を確認したうえで残したとみなして通す。
// MCP の投稿には環境変数で検査を外す手段がないため、これが誤検出の回避手段も兼ねる。
function seenDir(env = process.env) {
  const base = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, '.tired-dev-reader-seen');
}

function contentKey(sessionId, parts) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify([sessionId ?? '', ...parts]))
    .digest('hex');
}

function wasSeen(key, env = process.env) {
  return fs.existsSync(path.join(seenDir(env), key));
}

// 記録できたときだけ true を返す。記録できないまま止めると、同じ本文が止まり続ける。
// 7 日より古い記録は、ここで消す。
function markSeen(key, env = process.env) {
  const dir = seenDir(env);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const expired = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).mtimeMs < expired) fs.rmSync(file, { force: true });
    }
    fs.writeFileSync(path.join(dir, key), '');
    return true;
  } catch {
    return false;
  }
}

// 書き直した本文を読ませるたびに、読み手が別の語を挙げて止め続けることがある。
// 同じセッションの同じ投稿先で読み手が止めた回数を数え、上限に達したら読み手の検査を省く。
const MAX_READER_STOPS = 2;

function stopsFile(sessionId, scope, env) {
  return path.join(seenDir(env), `stops-${contentKey(sessionId, [scope])}`);
}

function readerStops(sessionId, scope, env = process.env) {
  try {
    return Number(fs.readFileSync(stopsFile(sessionId, scope, env), 'utf8')) || 0;
  } catch {
    return 0;
  }
}

function addReaderStop(sessionId, scope, env = process.env) {
  try {
    fs.writeFileSync(stopsFile(sessionId, scope, env), String(readerStops(sessionId, scope, env) + 1));
  } catch {
    // 数えられなくても、同じ本文の再投稿は markSeen の記録で通る。
  }
}

module.exports = {
  MAX_READER_STOPS,
  readerStops,
  addReaderStop,
  MIN_LENGTH,
  readerDisabled,
  runReader,
  formatReaderFindings,
  contentKey,
  wasSeen,
  markSeen,
};
