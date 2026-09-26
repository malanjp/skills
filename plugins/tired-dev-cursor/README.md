# tired-dev-cursor

Cursor で、日本語の技術文書を作成・推敲するためのプラグインです。
収録スキル `tech-writing` を使い、読者が結論から根拠、次の行動へ進める文章に整えます。

## Cursor に追加して呼び出します

1. Dashboard の Plugins から Team Marketplaces を開きます。
2. Add Marketplace の Import from Repo に `https://github.com/malanjp/skills` を指定します。
3. `tired-dev-cursor` を追加します。

導入後は `/tech-writing` を呼び出し、原稿と、読者に判断・実行してほしいことを渡してください。
Cloud Agents に常時配布する場合は、配布設定を Required にします。
Customize から追加する場合は、From GitHub Repository に同じ URL を指定します。

## スキルと要約ルールを提供します

規約の全文とテンプレートは、このパッケージの [`SKILL.md`](SKILL.md) にあります。
Issue、PR、レビュー指摘、調査報告、技術提案に使えます。

- [`rules/anchor.mdc`](rules/anchor.mdc) は、共有する技術文書向けの要約です。
- [`rules/chat.mdc`](rules/chat.mdc) は、チャットにも語彙と認知負荷の規則を適用したい場合に参照する任意ルールです。

両ルールの `alwaysApply` は `false` です。
Cursor 版には、シェルでの PR 投稿を止めるフックは含まれません。

## 規約を変更するときは管理元と同期します

規約の管理元は [`tired-dev/SKILL.md`](../tired-dev/SKILL.md) です。
このパッケージには同じ本文を収録し、単独で導入しても読めるようにしています。
本文と要約の一致はテストで確認します。

Node.js と pnpm を用意し、`plugins/tired-dev-cursor` で実行してください。

```bash
pnpm test
pnpm lint
```

## ライセンス

MIT
