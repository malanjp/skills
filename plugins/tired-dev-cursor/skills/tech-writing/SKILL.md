---
name: tech-writing
description: 疲れたエンジニアが一読で理解できる日本語の技術文書を書くための規約。報告、タスク仕様、Issue 起票文、コードレビュー指摘、調査結果、PR コメントに適用する。You MUST invoke this skill BEFORE writing or editing any Japanese text longer than 3 sentences that will be shared with humans — Linear の Issue 起票 / コメント / follow-up、GitHub の PR タイトル / description / レビュー返信、docs/ 配下の Markdown、ADR、README、仕様書、調査レポート、障害報告、リリースノートを含む。これらの文書を直す依頼、たとえば「推敲して」「校正して」「読みやすくして」「この文章どう？」proofread / rewrite in Japanese でも、スキル名が明示されなくても必ず参照する。エージェント自身が日本語の報告や指摘を出力する前にも自己適用し、結論を冒頭に置き、見出しを具体的にし、事実と仮説と対応方針を分離し、抽象的な比喩と誇張を避け、定量的に書き、そのまま実行できる検証コマンドと受け入れ条件を添える。お世辞、定型挨拶、実況中継は出さない。短い返答、単文の確認質問、コードやコマンドの出力には不要。エッセイ、小説、SNS 投稿など、技術報告以外の文章には適用しない。
---

# tech-writing（Cursor の入口）

このパッケージは Cursor 用の `tired-dev-cursor` である。
Claude Code 用の `tired-dev` ではない。

規約の正本はプラグインルートの [`SKILL.md`](../../SKILL.md) である。
直ちにそのファイルを開き、その規約に従って書く。

要約は [`rules/anchor.mdc`](../../rules/anchor.mdc) にある。
チャット返答へ語彙だけを適用する任意ルールは [`rules/chat.mdc`](../../rules/chat.mdc) にある。
