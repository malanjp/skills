---
name: tech-writing
description: 疲れたエンジニアが一読で理解できる日本語の技術文書を書くための規約です。報告、Issue、PR、レビュー指摘、調査結果、設計書、docs/ 配下の推敲に適用します。You MUST invoke this skill BEFORE writing or editing any Japanese text longer than 3 sentences that will be shared with humans (Linear issues/comments, GitHub PRs/reviews, design docs, README, reports). 推敲や校正の依頼（「推敲して」「読みやすくして」proofread / rewrite in Japanese）でも参照してください。リポジトリのテンプレートを優先し、各欄の説明に適用します。です・ます調で書き、結論は目的や概要の欄の冒頭に置きます。テンプレートがない場合は本文の冒頭に置きます。見出しを具体的にし、事実と仮説を分離し、必要な検証手順と完了条件を添えます。短い返答、単文の確認質問、コード出力には不要です。エッセイ等の非技術文には適用しません。
---

# tech-writing (プラグイン入口)

規約の全文はプラグインルートの [`SKILL.md`](../../SKILL.md) にあります。
このファイルは Claude Code プラグインが `skills/` 配下を読むための入口です。
規約の本文をここへ複製しません。
frontmatter の `description` だけは例外で、スキル起動条件としてプラグインルートの `SKILL.md` と同一に保ちます。

直ちにプラグインルートの `SKILL.md` を開き、その規約に従って書いてください。

規約を繰り返し確認するための要約は [`rules/anchor.md`](../../rules/anchor.md) にあります。
フックが注入するのは要約だけです。判断に迷ったら規約の全文を確認してください。
