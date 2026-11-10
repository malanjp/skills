#!/usr/bin/env node
// tired-dev — Stop フック
//
// ターンの最後の応答が英語のとき、同じ内容を日本語で書き直させる。
// コードブロック、インラインコード、URL を除いた本文が 80 字以上で、
// 日本語の文字が英字の 1 割未満なら、日本語で応答していないとみなす。
// 短い相づちを毎回止めないため下限を置き、比率で見るのは英文に
// 日本語の Issue 名などが混ざる応答を拾わないため。
//
// 書き直しの直後 (stop_hook_active) は止めない。
// TIRED_DEV_JA_OUTPUT を off などにすると、このフックは動かない。

const fs = require('fs');
const { jaOutputDisabled, readInput } = require('./lib');

const MIN_BODY_CHARS = 80;
const JA_MIN_RATIO = 0.1;
const JA_PATTERN = /[\u3040-\u30ff\u4e00-\u9fff]/g;
const EN_PATTERN = /[A-Za-z]/g;
const NOISE_PATTERN = /```[\s\S]*?```|`[^`]*`|https?:\/\/\S+/g;

const REASON = '直前の応答が英語でした。同じ内容を日本語で書き直してください。ツールは呼ばず、本文だけを書き直します。';

// 現在のターンの本文は last_assistant_message から取る。
// トランスクリプトは非同期に書かれるため、古い応答が入っていることがある。
function lastAssistantText(input) {
  if (typeof input.last_assistant_message === 'string' && input.last_assistant_message.trim()) {
    return input.last_assistant_message;
  }
  const file = typeof input.transcript_path === 'string' ? input.transcript_path : '';
  if (!file) return '';
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n').slice(-300);
  } catch {
    return '';
  }
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (!entry || entry.type !== 'assistant' || entry.isSidechain) continue;
    const content = entry.message && Array.isArray(entry.message.content) ? entry.message.content : [];
    const text = content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('');
    if (text.trim()) return text;
  }
  return '';
}

function main() {
  const input = readInput();
  if (jaOutputDisabled() || input.stop_hook_active) return;

  const body = lastAssistantText(input).replace(NOISE_PATTERN, '');
  if (body.trim().length < MIN_BODY_CHARS) return;

  const ja = (body.match(JA_PATTERN) || []).length;
  const en = (body.match(EN_PATTERN) || []).length;
  if (ja >= en * JA_MIN_RATIO) return;

  process.stdout.write(JSON.stringify({ decision: 'block', reason: REASON }));
}

main();
