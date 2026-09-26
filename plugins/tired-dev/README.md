# tired-dev

`tired-dev` は、日本語の技術文書を読む負担を減らすプラグインです。
収録スキル `tech-writing` が、結論から根拠、判断・行動へ進む文章の組み立て方を定めます。

Issue、PR、レビュー指摘、調査報告、設計書の作成と推敲に使えます。
[規約と5種類のテンプレート](SKILL.md)、[レビュー指摘と技術提案の記入例](eval/template-examples.md)を参照してください。

## プラグインを導入して使います

### Claude Code はマーケットプレイスから追加します

Claude Code で次を実行します。

```text
/plugin marketplace add malanjp/skills
/plugin install tired-dev@malanjp
```

報告の作成や原稿の推敲を依頼すると、エージェントがスキルの利用を判断します。
確実に参照させたい場合は、`/tired-dev:tech-writing` を呼び出して依頼を渡してください。

プラグインはセッション開始時に規約の適用対象を伝えます。
文章作成の依頼を検出したときは規約の要約を提示し、同じセッションの2回目以降は短いリマインダに切り替えます。

### OpenCode V2 はローカルのプラグインを登録します

[リポジトリルートの導入手順](../../README.md#opencode-v2)に従い、`opencode/` の絶対パスを設定してください。
プラグインがこのディレクトリの `SKILL.md` を読み、`tech-writing` を登録します。

OpenCode 版は、文章作成の依頼を検出したときに規約を提示します。
Claude Code 版のセッション開始時の通知は行いません。
依頼の判定と PR の検査には、Claude Code 版と同じ共有ライブラリを使っています。

### Cursor は専用パッケージを使います

[tired-dev-cursor](../tired-dev-cursor/)を導入し、`/tech-writing` で呼び出します。
Cursor 版は同じ規約のコピーを収録しており、スキルと要約ルールを提供します。

## スキルだけを導入することもできます

規約だけを使う場合は、プラグインの代わりに `SKILL.md` をスキルディレクトリへ配置します。
この方法では、依頼に応じた規約の提示や PR の投稿前検査は追加されません。

Claude Code 向けには [skills CLI](https://github.com/vercel-labs/skills) も使えます。
任意のディレクトリで実行し、導入するスキルを選択します。`-g` はユーザー全体、`-a` はエージェントの指定です。

```bash
npx skills add malanjp/skills -g -a claude-code
```

手動で配置する場合は、リポジトリルートで、使うエージェントのコマンドを実行します。
配置先に同名のスキルがある場合は、内容を確認してから更新してください。

Claude Code の配置先は次のとおりです。

```bash
mkdir -p ~/.claude/skills/tech-writing
cp plugins/tired-dev/SKILL.md ~/.claude/skills/tech-writing/SKILL.md
```

OpenCode の配置先は次のとおりです。

```bash
mkdir -p ~/.config/opencode/skills/tech-writing
cp plugins/tired-dev/SKILL.md ~/.config/opencode/skills/tech-writing/SKILL.md
```

配置後はエージェントを再起動します。手動コピーした規約は、リポジトリを更新しても自動では更新されません。

## PR の投稿前にタイトルと本文を検査します

Claude Code と OpenCode のプラグインは、シェルでの `gh pr create` と `gh pr edit` を実行前に検査します。
規約違反を検出すると、コマンドを止めるためのエラーと修正箇所をエージェントに返します。
文章作成の依頼を検出できなかった場合にも、投稿する操作を対象に検査します。

検査できるのは、コマンドから値を読み取れるタイトルと本文です。
文字列、ヒアドキュメント、`--body-file` で指定した既存ファイルや同じコマンドで書き出すファイルを扱います。
値を確定できない変数展開やコマンド置換は対象外です。Web 画面など、シェル以外からの投稿も検査しません。

誤検出の場合は、元のコマンドの `gh` の直前に `TIRED_DEV_PR_LINT=off` を付けると、その1回だけ検査を省略できます。
常時無効にする場合は、プラグインが動く環境で `TIRED_DEV_PR_LINT=off` を設定します。
Claude Code では、`settings.json` の `env` に指定できます。

## 短いチャットにも語彙の規則を適用できます

通常、短いチャット返答は規約の対象外です。
語彙と認知負荷に関する規則だけを適用したい場合は、`TIRED_DEV_CHAT` を有効にします。
`1`、`on`、`true`、`yes` のいずれかで有効になり、未設定なら無効です。

### Claude Code はセッション開始時に読み込みます

すべてのプロジェクトで使う場合は、`~/.claude/settings.json` の `env` に追加します。
既存の設定がある場合は、キーを追加してください。

```json
{
  "env": {
    "TIRED_DEV_CHAT": "1"
  }
}
```

プロジェクトごとに設定する場合は `.claude/settings.json`、自分だけで使う場合は `.claude/settings.local.json` に書きます。
設定ファイルを使うと、IDE 拡張やデスクトップアプリから起動した場合にも適用できます。

シェルから起動する場合は、起動前に次を実行する方法もあります。

```bash
export TIRED_DEV_CHAT=1
```

Claude Code はセッション開始時に `rules/chat.md` を追加で読み込ませます。
チャットへ適用するのは語彙と認知負荷の規則であり、見出しや受け入れ条件などの文書形式は含めません。

### OpenCode は文章作成の依頼を検出したときに読み込みます

OpenCode では、プラグインが動くプロセスに `TIRED_DEV_CHAT=1` を設定します。
現在の実装は、文章作成の依頼を検出したときだけ `rules/chat.md` を追加します。
通常の短い質問だけでは、この規則の読み込みは始まりません。

## 規約と生成した文章をチェックします

Node.js と pnpm を用意し、`plugins/tired-dev` で実行します。

```bash
pnpm test
pnpm lint
```

テストはフックや規約チェッカの判定を確認し、lint は規約と README の表現を検査します。
原稿を確認する場合は、同じディレクトリで次を実行します。`draft.md` は原稿のパスに置き換えてください。

```bash
node tools/lint.js draft.md
node tools/score.js draft.md --expect bluf,file-ref,run-command
```

`tools/lint.js` は曖昧な数量詞、漢字の連結、二重否定、後方参照などを検出します。
`tools/score.js` は冒頭の結論、ファイル参照、検証コマンドなど、指定した要素があるかを確認します。

これらの結果だけでは、読みやすさや技術的な正しさを判定できません。
事実と仮説の区別、説明のつながり、読み返しの必要があるかは、本文を読んで確認してください。

## 規約あり・なしの生成結果を比較します

`eval/` は、同じ課題を規約あり・なしで書かせ、生成した文章を保存して採点します。
`plugins/tired-dev` で実行します。生成には認証済みの `claude` CLI と利用料金が必要です。

```bash
node eval/run.js --runs 5 --model sonnet
```

各条件で5回ずつ生成します。結果は毎回変わるため、中央値と最小・最大を比較します。
同時実行数は `--concurrency` で指定でき、初期値は4です。

保存済みの結果だけを採点し直す場合は、次を実行します。

```bash
node eval/run.js --report
```

スクリプトは子プロセスをリポジトリ外の一時ディレクトリで動かします。
このリポジトリのフックや設定が生成内容に混ざるのを避けるためです。

比較では、違反件数だけでなく必要な要素の出現回数と実際の文章を確認してください。
表記の違反が減っても、疲れた読者が理解しやすくなったとは限りません。

## ライセンス

MIT
