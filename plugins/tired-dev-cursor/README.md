# tired-dev-cursor

Cursor 用のパッケージである。
Claude Code 用の [`tired-dev`](../tired-dev/) ではない。

規約の中身は `tired-dev` と同じである。
スキル名は `tech-writing` のままである。
呼び出すときは `/tech-writing` とする。

正本は Claude Code 用の [`../tired-dev/SKILL.md`](../tired-dev/SKILL.md) にある。
このパッケージの [`SKILL.md`](SKILL.md) は正本と同一に保つ。
要約は [`rules/anchor.mdc`](rules/anchor.mdc) にある。

## Cursor に入れる

リポジトリを Cursor のマーケットプレイスとして入れる。
入れるプラグイン名は `tired-dev-cursor` である。

1. Dashboard の Plugins で Team Marketplaces を開く
2. Add Marketplace の Import from Repo に `https://github.com/malanjp/skills` を貼る
3. `tired-dev-cursor` を追加する
4. Cloud Agents へ常時入れる場合は、配布を Required にする

Customize から入れる場合は、From GitHub Repository で同じ URL を指定する。
