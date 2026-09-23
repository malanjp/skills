# malanjp/skills

malanjp が使うエージェント用のプラグインとスキルを置くリポジトリ。
Claude Code 用と Cursor 用は別のディレクトリである。

## 収録プラグイン

| プラグイン | 対象 | 収録スキル | 内容 |
|---|---|---|---|
| [`tired-dev`](plugins/tired-dev/) | Claude Code | `tech-writing` | 疲れたエンジニアが一読で理解できる日本語の技術文書を書くための規約 |
| [`tired-dev-cursor`](plugins/tired-dev-cursor/) | Cursor | `tech-writing` | 同じ規約の Cursor 用パッケージ。スキル名は `tech-writing` のまま |

## Claude Code に導入する

マーケットプレイスとして追加し、使うプラグインだけを個別に入れる。

```
/plugin marketplace add malanjp/skills
/plugin install tired-dev@malanjp
```

各プラグインの詳細と、プラグインを使わずスキルとして導入する手順は、
それぞれのディレクトリの README に書いてある。

## Cursor に導入する

Cursor 用のプラグイン名は `tired-dev-cursor` である。
Claude Code 用の `tired-dev` ではない。
スキル名は `tech-writing`。呼び出すときは `/tech-writing` とする。

Dashboard の Plugins で Team Marketplaces を開き、Import from Repo にこのリポジトリを指定する。
追加するプラグインは `tired-dev-cursor` である。
Cloud Agents へ常時入れる場合は、配布を Required にする。

Customize から入れる場合は、From GitHub Repository で同じリポジトリを指定する。

## 開発

pnpm のワークスペースとして管理する。
ルートで実行すると `plugins/` 配下の全プラグインに適用される。

```bash
pnpm install
pnpm test    # 全プラグインのテスト
pnpm lint    # 全プラグインの規約チェック
```

個別のプラグインだけを動かす場合は、そのディレクトリへ移動して同じコマンドを実行する。

## ライセンス

MIT
