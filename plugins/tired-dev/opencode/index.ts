// tired-dev を OpenCode V2 で使うためのプラグイン。
//
// Claude Code のフックを OpenCode のフックへ対応させる。
//   SessionStart      → なし。スキル登録で代替する
//   UserPromptSubmit  → session.hook("prompt")
//   PreToolUse(Bash)  → tool.hook("execute.before")
//
// 判定は hooks/gate-lib.js と hooks/pr-lint-lib.js が持つ。Claude Code 側と同じ関数を
// 使うため、規則を二重に持たない。スキル本体も SKILL.md から読み込んで登録するので、
// スキルディレクトリへ手動で置く必要はない。
//
// @opencode/plugin はローカルプラグインには供給されないため import しない。
// 既定エクスポートに id と setup を置く方式にする。
//
// 読み込み方: opencode.json(c) の "plugins" にこのディレクトリの絶対パスを追加する。
//   { "plugins": ["/absolute/path/to/plugins/tired-dev/opencode"] }

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import lib from "../hooks/lib.js"
import gate from "../hooks/gate-lib.js"
import prLint from "../hooks/pr-lint-lib.js"

const SKILL_ID = "tech-writing"
const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url))

// frontmatter を取り除き、本文だけを返す。OpenCode は本文だけを会話へ読み込む。
function skillBody(text) {
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return match ? text.slice(match[0].length) : text
}

// frontmatter から description を 1 行だけ取り出す。無ければ undefined。
function skillDescription(text) {
  const front = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!front) return undefined
  const line = front[1].split(/\r?\n/).find((row) => row.startsWith("description:"))
  return line ? line.slice("description:".length).trim() : undefined
}

// shell ツールの入力からコマンドと作業ディレクトリを取り出す。
function shellCommand(input) {
  if (!input || typeof input !== "object") return null
  const record = input
  if (typeof record.command !== "string" || record.command.length === 0) return null
  const cwd =
    typeof record.workdir === "string"
      ? record.workdir
      : typeof record.cwd === "string"
        ? record.cwd
        : null
  return { command: record.command, cwd }
}

export default {
  id: "tired-dev",
  // V1 ローダーは server() を要求する。V2 は setup() を使う。
  server() {
    return {}
  },
  async setup(ctx) {
    // スキル tech-writing を登録する。SKILL.md が正本で、ここから読む。
    const skillPath = path.join(PLUGIN_DIR, "..", "SKILL.md")
    const rawSkill = fs.readFileSync(skillPath, "utf8")
    const skill = {
      id: SKILL_ID,
      name: SKILL_ID,
      description: skillDescription(rawSkill),
      autoinvoke: true,
      path: skillPath,
      content: skillBody(rawSkill),
    }
    await ctx.skill.transform((editor) => {
      if (editor.get(SKILL_ID)) editor.update(SKILL_ID, (current) => Object.assign(current, skill))
      else editor.add(skill)
    })

    // PreToolUse 相当。gh pr create / edit のタイトルと本文を検査し、違反があれば止める。
    await ctx.tool.hook("execute.before", (event) => {
      if (event.tool !== "shell" && event.tool !== "bash") return
      const target = shellCommand(event.input)
      if (!target) return
      const findings = prLint.findPrFindings({
        command: target.command,
        cwd: target.cwd ?? ctx.location.directory,
        env: process.env,
      })
      if (findings.length > 0) throw new Error(prLint.formatReason(findings))
    })

    // UserPromptSubmit 相当。共有文章の作成・推敲依頼のときだけ規約を注入する。
    await ctx.session.hook("prompt", async (event) => {
      const prompt = event.prompt
      const text = typeof prompt.text === "string" ? prompt.text : ""
      if (!gate.isGateHit(text)) return

      const key = `hit/${event.sessionID}`
      const previous = await ctx.storage.get(key)
      const count = (typeof previous === "number" ? previous : 0) + 1
      await ctx.storage.set(key, count)

      const injection = count > 1 ? gate.reminderLine() : gate.firstHitInjection()
      let next = injection ? `${text}\n\n${injection}` : text
      if (lib.chatGateEnabled(process.env)) {
        const chat = lib.readRule("chat.md")
        if (chat) next += `\n\n${chat}`
      }
      prompt.text = next
    })
  },
}
