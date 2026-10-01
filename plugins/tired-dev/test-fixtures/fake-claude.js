#!/usr/bin/env node
// 読み手の検査のテストで claude の代わりに呼ぶコマンド。
// FAKE_READER_OUTPUT の内容をそのまま標準出力へ書き、FAKE_READER_LOG があれば呼ばれた回数を記録する。
const fs = require('node:fs');

fs.readFileSync(0, 'utf8');
if (process.env.FAKE_READER_LOG) fs.appendFileSync(process.env.FAKE_READER_LOG, 'called\n');
if (process.env.FAKE_READER_EXIT) process.exit(Number(process.env.FAKE_READER_EXIT));
process.stdout.write(process.env.FAKE_READER_OUTPUT ?? '');
