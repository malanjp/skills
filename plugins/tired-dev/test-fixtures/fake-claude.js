#!/usr/bin/env node
// 投稿前のモデルの検査のテストで claude の代わりに呼ぶコマンド。
// システムプロンプトで読み手とレビュアーを見分ける。
// 読み手には FAKE_READER_OUTPUT、レビュアーには FAKE_REVIEW_OUTPUT をそのまま標準出力へ書く。
// FAKE_READER_LOG があれば、呼ばれた役割を 1 行ずつ記録する。
// FAKE_REVIEW_INPUT_LOG があれば、レビュアーが受け取った入力を書き出す。
const fs = require('node:fs');

const input = fs.readFileSync(0, 'utf8');
const prompt = process.argv[process.argv.indexOf('--system-prompt') + 1] || '';
const role = prompt.includes('規約のレビュアー') ? 'review' : 'reader';
if (process.env.FAKE_READER_LOG) fs.appendFileSync(process.env.FAKE_READER_LOG, `${role}\n`);
if (role === 'review' && process.env.FAKE_REVIEW_INPUT_LOG) fs.writeFileSync(process.env.FAKE_REVIEW_INPUT_LOG, input);
if (process.env.FAKE_READER_EXIT) process.exit(Number(process.env.FAKE_READER_EXIT));
const output = role === 'review' ? process.env.FAKE_REVIEW_OUTPUT : process.env.FAKE_READER_OUTPUT;
process.stdout.write(output ?? JSON.stringify({ is_error: false, structured_output: { findings: [] } }));
