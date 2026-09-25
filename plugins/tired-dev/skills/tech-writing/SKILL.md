---
name: tech-writing
description: 疲れたエンジニアが一読で理解できる日本語の技術文書を書くための規約。報告、Issue、PR、レビュー指摘、調査結果、設計書、docs/ 配下の推敲に適用する。You MUST invoke this skill BEFORE writing or editing any Japanese text longer than 3 sentences that will be shared with humans (Linear issues/comments, GitHub PRs/reviews, design docs, README, reports). 推敲や校正の依頼（「推敲して」「読みやすくして」proofread / rewrite in Japanese）でも参照する。出力前に結論を冒頭に置き、見出しを具体的にし、事実と仮説を分離し、検証コマンドと受け入れ条件を添える。短い返答、単文の確認質問、コード出力には不要。エッセイ等の非技術文には適用しない。
---

# tech-writing (プラグイン入口)

規約の正本はプラグインルートの [`SKILL.md`](../../SKILL.md) である。
このファイルは Claude Code プラグインが `skills/` 配下を読むための入口にすぎない。
規約の本文をここへ複製しない。

直ちにプラグインルートの `SKILL.md` を開き、その規約に従って書く。

ドリフト防止用の要約は [`rules/anchor.md`](../../rules/anchor.md) にある。
フックが注入するのは要約だけで、正本の代わりにはならない。
