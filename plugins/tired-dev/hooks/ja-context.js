#!/usr/bin/env node
// tired-dev — SessionStart フック (compact / resume / fork)
//
// コンパクションで会話の要約が英語になると、その続きを英語で書き始める。
// 再開のたびに、応答を日本語で書く指示を文脈へ注入する。
// TIRED_DEV_JA_OUTPUT を off などにすると、Stop フックと一緒に動かなくなる。

const { jaOutputDisabled, readInput } = require('./lib');

const CONTEXT =
  'このセッションのユーザー向けの応答は日本語で書きます。コンパクション後の応答も日本語です。要約やツールの出力が英語でも、説明と結論は日本語にします。';

readInput();

if (jaOutputDisabled()) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: CONTEXT,
    },
  })
);
