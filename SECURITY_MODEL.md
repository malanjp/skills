# malanjp/skills 脅威モデル

## 1. システムの概要と信頼境界

公開マーケットプレイス (`.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`) で配布する、開発者の手元で動くエージェント用プラグイン群。サーバ、アカウント、インフラはない。コードは導入した開発者の権限 (シェル、`gh` / Linear の認証情報、ホームディレクトリ、ターミナル) で動く。

信頼境界:
- プラグインのコード ↔ 外部の人が書ける文字列 (PR のタイトル・本文、CI のチェック名、Issue、Linear のデータ)
- プラグインのコード ↔ 作業中のリポジトリ (cwd、`git` の設定、`--body-file` で読むファイル)
- 開発者 ↔ 同じマシンの別のローカルユーザー (`~/.claude` 配下の共有ファイル)
- フック ↔ 子プロセスの `claude -p` / `$.model.complete` (プロンプトインジェクションで出力が操られうる)

## 2. コンポーネント

| 名前 | 対象のコード | 役割 |
|---|---|---|
| tired-dev hooks | `plugins/tired-dev/hooks/`, `plugins/tired-dev/tools/` | Claude Code のフック。Bash コマンド文字列から `gh pr create/edit` を解析 (`pr-command.js`)、`gh`/`git` を `spawnSync` (`change-lib.js`)、`claude -p` を子プロセスで起動 (`model-lib.js`)、`~/.claude` に状態を書く (`gate.js`, `reader-lib.js`) |
| tired-dev opencode | `plugins/tired-dev/opencode/` | OpenCode V2 プラグイン。シェル実行前の PR 検査とプロンプトへの規約注入 |
| tired-dev rules | `plugins/tired-dev/SKILL.md`, `rules/`, `skills/`, `plugins/tired-dev-cursor/` | エージェントに読み込ませる規約とスキル (Cursor 版を含む) |
| dev-mods pr-status | `plugins/dev-mods/hooks/register.tsx`, `parse.ts`, `views.tsx` | `gh pr view` の結果と Linear MCP の結果をパネルに描画 |
| dev-mods dev-servers | `plugins/dev-mods/hooks/servers.ts` | `ps` / `lsof` で待受プロセスを列挙して表示 |
| agent-timeline | `plugins/agent-timeline/hooks/` | セッションの状態を `~/.claude/agent-board/*.json` に書き、子セッションのカードを読む。haiku で目的とレポートを生成 |
| marketplace | `.claude-plugin/`, `.cursor-plugin/`, 各 `plugin.json` | 配布マニフェストとフックの登録 |

## 3. 入口と到達できる人

- Bash ツールに渡るコマンド文字列 (エージェントが生成。リポジトリやプロンプトの内容に影響される) → tired-dev hooks / opencode
- `gh pr view` の JSON (PR の作者、CI の設定を書ける人) → dev-mods pr-status
- Linear MCP の `get_issue` の結果 → dev-mods pr-status
- `~/.claude/agent-board/` と `~/.claude/.tired-dev-*` のファイル → agent-timeline, tired-dev hooks
- 子 `claude` / haiku の出力 → フックの deny 判定、パネル表示
- 作業中のリポジトリの内容 (`git` の設定や `--body-file` のパス)

## 4. 資産

- 開発者のマシンでのコード実行 (最重要)
- `gh`、Linear、Claude の認証情報と環境変数
- 開発者のファイル (書き込み・漏えい)
- ターミナルの表示の完全性 (制御文字、偽のリンク)
- フックの判定の完全性 (検査の迂回や強制 deny は影響が小さい)

## 5. 重視する攻撃者 (利用者の回答)

利用者は次をすべて重視すると回答した。利用者は公開マーケットプレイスから誰でも導入できる前提を確認した。
- PR・Issue・CI・Linear に細工した文字列を書ける外部の人
- 細工したリポジトリを開発者に開かせる人
- 同じマシンの別のローカルユーザー
- 子プロセスの claude の出力を操るプロンプトインジェクション

## 6. 既存の対策

- `parse.ts` の `clean()` が PR タイトル、チェック名、Linear のデータから制御文字を除く
- `pr-command.js` は変数展開やコマンド置換を含む値を評価せず、シェルを実行しない
- `change-lib.js` は `spawnSync` に引数配列を渡す (シェルを経由しない)
- `model-lib.js` は子 claude を `--tools ''`、`--strict-mcp-config`、`--setting-sources ''`、cwd = tmpdir で起動する
- 検査の失敗は投稿を止めない (fail-open は設計どおり)

## 7. 対象外・許容するリスク (利用者の回答)

- 開発用のスクリプト (`plugins/tired-dev/eval/`, `test/`, `tests/`, `test-fixtures/`, `*.test.*`) は対象外

## 8. 未確定事項

- agent-timeline のカードの `parentId` は他人も書けるディレクトリから読まれうるか (ディレクトリの権限は未確認)
- `gh pr edit` の位置引数や `--repo` が `-` で始まる値のとき、`gh` のオプションとして解釈されるか
