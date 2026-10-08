# malanjp/skills

疲れ切った同僚が、読み返さずに理解して次の行動を選べる技術文書を目指すスキル集です。
日本語の Issue・PR・レビュー指摘・調査報告を書くための `tech-writing` と、PR と CI の状態や開発サーバの一覧を表示する mod 集 `dev-mods` を収録しています。

新しい文書の作成にも、既存の原稿の推敲にも使えます。
[規約とテンプレート](plugins/tired-dev/SKILL.md)、[記入例](plugins/tired-dev/eval/template-examples.md)で、文章の組み立て方を確認できます。

## 使うエージェントに合わせて導入します

文章の規約は共通です。
規約を読み込ませる仕組みと、PR の投稿前検査は環境によって異なります。

| 環境 | 導入するもの | 利用できる機能 |
|---|---|---|
| Claude Code | `tired-dev` プラグイン | スキル、文章作成の依頼に応じた規約の提示、PR と Linear の投稿前検査、読み手の検査 |
| OpenCode V2 | `tired-dev` のローカルプラグイン | スキルの登録、文章作成の依頼に応じた規約の提示、PR の投稿前検査 |
| Cursor | `tired-dev-cursor` プラグイン | スキルと規約の要約 |

### Claude Code

Claude Code で、マーケットプレイスとプラグインを追加します。

```text
/plugin marketplace add malanjp/skills
/plugin install tired-dev@malanjp
```

明示的に使う場合は、`/tired-dev:tech-writing` を呼び出して原稿や依頼を渡します。
[スキルだけの導入や動作の設定](plugins/tired-dev/README.md)も選べます。

### OpenCode V2

このリポジトリをローカルに置き、`plugins/tired-dev/opencode` の絶対パスを設定します。
プラグインはリポジトリの規約を直接読むため、配置したディレクトリを残して使います。

任意の作業ディレクトリで実行します。
取得済みの場合は、そのリポジトリを使えます。

```bash
git clone https://github.com/malanjp/skills.git
cd skills
pwd
```

`~/.config/opencode/opencode.json` の `plugins` 配列にパスを追加します。
次の `/absolute/path/to/skills` は、`pwd` が表示したパスに置き換えてください。
既存の設定やプラグインは残します。

```json
{
  "plugins": ["/absolute/path/to/skills/plugins/tired-dev/opencode"]
}
```

V1 形式の設定を引き継ぎ、`plugin`（単数形）を使っている場合は、その配列に追加します。
追加後に OpenCode を再起動するか、次を実行します。

```bash
opencode reload
opencode plugin list
```

一覧に `tired-dev` が表示されることを確認してください。
プラグインが `tech-writing` を登録するため、スキルの手動コピーは不要です。
[動作と環境変数の説明](plugins/tired-dev/README.md)に、Claude Code 版との違いを記載しています。

### Cursor

Cursor には `tired-dev-cursor` を追加します。

1. Dashboard の Plugins から Team Marketplaces を開きます。
2. Import from Repo に `https://github.com/malanjp/skills` を指定します。
3. `tired-dev-cursor` を追加します。

導入後は `/tech-writing` で呼び出せます。
Customize から追加する方法や Cloud Agents への配布は、[Cursor 版の README](plugins/tired-dev-cursor/README.md)を参照してください。

## 原稿と、読者にしてほしいことを渡します

たとえば、次のように依頼します。

```text
この調査報告を、担当者が次の確認に着手できる形に推敲してください。
確認済みの事実と仮説を分け、判断に必要な根拠を近くに置いてください。

［原稿を貼る］
```

対象は、仕事で共有する技術文書です。
短いチャット返答や、記事・エッセイには文書の形式を強制しません。

## PR と CI の状態をパネルに表示します

`dev-mods` の `pr-status` は、現在のブランチの PR、CI の結果、関連する GitHub Issue と Linear Issue を Claude Code のパネルに表示する mod です。
Claude Code のターミナルで次を実行して導入します。

```text
/plugin marketplace add malanjp/skills
/plugin install dev-mods@malanjp
```

パネルは 10 秒ごとに `gh pr view` の結果で更新されるため、`gh` へのログインが必要です。
`/pr-status` を実行すると、パネルを開いて即座に更新します。
`claude.ai Linear` の MCP サーバーが接続されている場合は、Linear Issue のタイトルと状態も表示します。

## セッション内で起動した開発サーバを一覧表示します

`dev-mods` の `dev-servers` は、Claude Code の Bash ツールが起動したプロセスのうち、TCP ポートで待ち受けているものをパネルに表示します。
ポートは `http://localhost:<port>` へのリンクになり、ステータス行にも `dev :3000 :5173` の形で表示します。
一覧は 10 秒ごとに `ps` と `lsof` の結果で更新し、`/dev-servers` を実行すると即座に更新します。

MCP サーバーなど Bash ツール以外の子プロセスと、別のターミナルで起動したサーバは表示しません。
`nohup` や `setsid` で親プロセスから切り離したサーバも、親子関係をたどれないため表示しません。

## 変更後にテストと規約チェックを実行します

Node.js と pnpm を用意し、リポジトリルートで実行します。

```bash
pnpm install
pnpm test
pnpm lint
```

ルートのコマンドは、全パッケージのテストと規約チェックを実行します。
`dev-mods` のテストと検査には `claude` コマンドを使います。
個別に確認する場合は、対象の `plugins/` 配下へ移動して同じコマンドを使います。

文章の読み心地は自動チェックだけでは判定できません。
[記入例](plugins/tired-dev/eval/template-examples.md)を読み、結論・根拠・確認方法を探して戻る箇所がないか確認してください。
[生成結果を比較する手順](plugins/tired-dev/README.md#規約ありなしの生成結果を比較します)も用意しています。

## ライセンス

MIT
