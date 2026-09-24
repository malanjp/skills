# tired-dev

疲れたエンジニアが一読で理解できる日本語の技術文書を書くための規約。
報告、タスク仕様、Issue 起票文、コードレビュー指摘、調査結果、PR コメントに適用する。
AI エージェントが出力する文章と、人が書いた原稿の推敲の両方が対象である。

判断の基準は一つだけ置く。
疲れているエンジニアが一読で理解でき、迷わず安全に次の行動に移せる文章かどうか。

規則の全文と標準出力フォーマットは `SKILL.md` にある。
README に規則を複製しない。

## Cursor 用パッケージ

Cursor で使うパッケージは [`tired-dev-cursor`](../tired-dev-cursor/) である。
このディレクトリは Claude Code 用である。

## インストール

[skills CLI](https://github.com/vercel-labs/skills) を使う。
`-g` を付けるとユーザー全体のスキルディレクトリに入り、すべてのプロジェクトで使える。
`-a` には使用するエージェントを指定する。

```bash
npx skills add malanjp/skills -g -a claude-code
```

CLI を使わない場合は、エージェントがスキルを読むディレクトリへ直接配置してもよい。
配置後、エージェントを再起動すると読み込まれる。

```bash
git clone git@github.com:malanjp/skills.git /tmp/malanjp-skills
cp -r /tmp/malanjp-skills/plugins/tired-dev ~/.claude/skills/tech-writing
```

## Claude Code のセッション全体に適用する

スキルはモデルが必要と判断したときだけ読み込まれる。
セッションの後半でドリフトさせたくない場合は、プラグインとして導入する。
`SessionStart` フックが適用対象を通知し、`UserPromptSubmit` フックが共有文章の作成・推敲依頼を検出したときだけ `rules/anchor.md` を注入する。

```
/plugin marketplace add malanjp/skills
/plugin install tired-dev@malanjp
```

チャット返答の口調には干渉しない。
ゲートに該当しないプロンプトでは何も注入しないため、通常の会話のトークンは増えない。

## PR のタイトルと本文を投稿前に検査する

プラグインとして導入すると、`PreToolUse` フックが `gh pr create` と `gh pr edit` の実行直前に動く。
タイトルと本文を `tools/lint.js` で検査し、違反があればコマンドを止めて、直す箇所を Claude に返す。
PR は自動の手順の途中で作られることが多く、プロンプトを見る `UserPromptSubmit` のゲートでは規約を注入できないため、投稿の操作そのものを検査する。

検査するのは、値がコマンドの中で確定している場合だけである。
`--title` と `--body` の文字列、ヒアドキュメント、同じコマンドで書き出したファイルや既存ファイルを渡す `--body-file` を読む。
変数展開やコマンド置換を含む値は検査しない。

誤検出で止まった場合は、`gh` の直前に `TIRED_DEV_PR_LINT=off` を付けるとその 1 回だけ検査を飛ばす。
常に止めたい場合は、`settings.json` の `env` に `"TIRED_DEV_PR_LINT": "off"` を書く。

## チャット返答にも語彙と認知負荷を適用する

規約は短いチャット返答を対象外とする。
ただし語彙の禁止と認知負荷の低減は、文の長さや口調と独立しており、短く書いても守れる。
この 2 つだけを返答にも適用したい場合は、環境変数 `TIRED_DEV_CHAT` を設定する。
`1`、`on`、`true`、`yes` のいずれかで有効になる。
設定しなければ無効で、フックの出力は変わらない。

設定する方法は `settings.json` に書くか、シェルで `export` するかの 2 つである。
すべてのプロジェクトで常に適用するなら `settings.json` を勧める。
IDE 拡張やデスクトップアプリから起動した Claude Code にも、フックが規則を適用するためである。

`~/.claude/settings.json` に書く。

```json
{
  "env": {
    "TIRED_DEV_CHAT": "1"
  }
}
```

シェルの設定ファイルに書く方法もある。
この場合、フックが規則を適用するのは、そのシェルから起動した Claude Code だけである。

```bash
export TIRED_DEV_CHAT=1
```

リポジトリごとに切り替えるなら、そのリポジトリの `.claude/settings.json` に同じ `env` を書く。
チームに共有せず自分だけで使うなら `.claude/settings.local.json` に書く。

有効にすると `SessionStart` が `rules/chat.md` を追加で注入する。
持ち込むのは語彙と認知負荷だけで、要約、見出し、テーブル、検証コマンド、受け入れ条件は持ち込まない。
これらは文書の形式であり、チャットの返答形式を定める別の設定と競合する。

## 使い方

報告、Issue 起票、レビュー指摘、推敲を依頼すると自動で参照される。
スキル名を明示する必要はない。
明示するときは `/tired-dev:tech-writing` と呼ぶ。

## 検証

規約が守られているかを 3 つの層で確かめる。依存パッケージは追加していない。

```bash
# 前提: plugins/tired-dev で実行
pnpm test         # フックの判定と規約チェッカのテスト
pnpm lint         # 規約本体が自身の規約を満たすかの検査
```

`tools/lint.js` は書いてはいけない表現を検出する。
曖昧な数量詞、漢字の連結、二重否定、後方参照、接続詞の連鎖、並列する項目の文末の混在などを指摘する。
規約に書かれていない項目は置かない。
受動態の判別や事実と仮説の分離は正規表現では偽陽性が多いため、意図的に対象から外してある。

`tools/score.js` は書いてあるべき要素の充足を測る。
冒頭の結論、ファイルと行番号、実行できる検証コマンド、受け入れ条件、影響範囲などを見る。

```bash
node tools/lint.js draft.md
node tools/score.js draft.md --expect bluf,file-ref,run-command
```

## 規約の効果を測る

`eval/` は同じ課題を規約あり / なしの 2 条件で書かせ、上の 2 つで採点する。

```bash
# 前提: plugins/tired-dev で実行。claude CLI と課金が必要
node eval/run.js --runs 5 --model sonnet   # 各条件 5 回ずつ生成する
node eval/run.js --report                  # 生成済みの出力を採点し直す
```

生成は毎回ぶれる。1 回の実行では差が逆転することもあるため、`--runs` で試行を重ね、
中央値と最小 - 最大で読む。同時実行数は `--concurrency` で変える。初期値は 4 である。

判断には違反件数より「要素ごとの出現回数」を見る。
違反件数は表記の統一が大半を占め、文章の質を代表しない。

生成は必ずリポジトリの外の一時ディレクトリで走らせる。
同じ作業ツリーで走らせると、このリポジトリ向けのフックを子プロセスの `claude` が読み込み、
ブロックメッセージが生成物に混ざって、文章ではなく実行環境を測ることになる。

## ライセンス

MIT
