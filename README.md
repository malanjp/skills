# malanjp/skills

malanjp が使うエージェント用のプラグインとスキルを置くリポジトリ。
Claude Code 用と Cursor 用は別のディレクトリである。

## 収録プラグイン

| プラグイン | 対象 | 収録スキル | 内容 |
|---|---|---|---|
| [`tired-dev`](plugins/tired-dev/) | Claude Code, OpenCode | `tech-writing` | 疲れたエンジニアが一読で理解できる日本語の技術文書を書くための規約 |
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

## OpenCode に導入する

OpenCode V2 はスキルとプラグインを別々に読み込む。
`tired-dev` は両方を提供する。
プラグイン [`plugins/tired-dev/opencode`](plugins/tired-dev/opencode/) が、スキルの登録、共有文章の作成依頼の検出、`gh pr create` と `gh pr edit` の投稿前検査を行う。

`~/.config/opencode/opencode.json` の `plugins` にこのディレクトリの絶対パスを追加する。

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/path/to/skills/plugins/tired-dev/opencode"]
}
```

V2 の設定キーは `plugins` である。
V1 から引き継いだ設定が `plugin`（単数形）を使っている場合は、その配列に足してもよい。
追加したら OpenCode を再起動するか `opencode reload` を実行する。
プラグインが `SKILL.md` からスキルを登録するため、スキルディレクトリへ別途コピーしなくてよい。

スキルだけを使う場合は、[`plugins/tired-dev/SKILL.md`](plugins/tired-dev/SKILL.md) を `~/.config/opencode/skills/tech-writing/SKILL.md` へコピーする。

Claude Code の `SessionStart` に相当する通知はない。
それ以外のゲートと PR 検査は Claude Code と同じ判定を使う。
環境変数 `TIRED_DEV_PR_LINT` と `TIRED_DEV_CHAT` も同じ意味で働く。

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
