// 投稿前に、規約全体を基準に本文をレビューするモデルを呼ぶ。
//
// 読み手の検査 (reader-lib.js) は語の選び方だけを見る。
// 要約が変更をすべて覆っているか、同じ対象の呼び名が揺れていないかのような構成の問題は、語句の検査でも読み手の検査でも見つからない。
// この検査は review-prompt.md の規則で本文を読ませ、PR では差分も渡して要約と照合させる。
// 投稿前に必ずレビューを挟むため、読み手の検査と違って短い本文も読ませる。
//
// 検査の失敗では投稿を止めない。タイムアウトや出力の破損は指摘 0 件として扱う。

const fs = require('node:fs');
const path = require('node:path');
const { runModel } = require('./model-lib');

const PROMPT_PATH = path.join(__dirname, 'review-prompt.md');
// Haiku は予告と一覧が離れた箇所を 3 回とも見落とし、直した本文にも 3〜6 件の誤った指摘を出した。
// 処理時間も Sonnet の 2 倍以上かかったため、Sonnet を使う。
const DEFAULT_MODEL = 'claude-sonnet-5-5';
// 差分を読むため、読み手の検査より長く待つ。
// 差分の取得 (最大 20 秒) と合わせて、plugin.json のフックの制限時間 120 秒に収める。
const TIMEOUT_MS = 90_000;
const MAX_FINDINGS = 10;
const KEPT_CONFIDENCE = new Set(['high', 'medium']);

const SCHEMA = JSON.stringify({
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          rule: { type: 'string' },
          quote: { type: 'string' },
          problem: { type: 'string' },
          fix: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['rule', 'quote', 'problem', 'fix', 'confidence'],
      },
    },
  },
  required: ['findings'],
});

function reviewDisabled(env = process.env) {
  return /^(off|0|false|no)$/i.test(String(env.TIRED_DEV_REVIEW ?? '').trim());
}

// 本文と、あれば変更の差分をレビュアーのモデルに渡し、medium 以上の指摘を返す。
// TIRED_DEV_REVIEW_CMD はテストで claude の代わりに使うコマンド。
async function runReview(text, change, env = process.env) {
  if (reviewDisabled(env) || !text || !text.trim()) return [];
  const changeBlock = change ? `\n\n<change>\n${change}\n</change>` : '';
  const out = await runModel({
    cmd: env.TIRED_DEV_REVIEW_CMD || 'claude',
    model: env.TIRED_DEV_REVIEW_MODEL || DEFAULT_MODEL,
    systemPrompt: fs.readFileSync(PROMPT_PATH, 'utf8'),
    schema: SCHEMA,
    input: `次の本文をレビューしてください。\n\n<document>\n${text}\n</document>${changeBlock}`,
    timeoutMs: Number(env.TIRED_DEV_REVIEW_TIMEOUT_MS) || TIMEOUT_MS,
    env,
  });
  const findings = out?.findings;
  if (!Array.isArray(findings)) return [];
  return findings
    .filter((f) => f && typeof f.quote === 'string' && KEPT_CONFIDENCE.has(f.confidence))
    .slice(0, MAX_FINDINGS);
}

function formatReviewFindings(findings) {
  return findings.map((f) => `- [${f.rule}] 「${f.quote}」: ${f.problem} 直した例は「${f.fix}」です。`);
}

module.exports = { reviewDisabled, runReview, formatReviewFindings };
