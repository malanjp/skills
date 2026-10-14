// PR の本文と照合するため、PR に含まれる変更の差分を集める。
//
// gh pr edit は、既存の PR の差分を gh pr diff で取る。
// 別のリポジトリの PR を --repo で直す場合もあるため、手元の git は使わない。
// gh pr create は、まだ PR が無いので手元の git で base との差分を取る。
//
// 差分を取れない場合は null を返し、レビュアーは要約と差分の照合を省く。

const { spawnSync } = require('node:child_process');

// 差分の取得全体で使える時間。レビュー (最大 90 秒) と合わせてフックの制限時間 120 秒に収める。
const BUDGET_MS = 20_000;
// 長い差分はモデルの処理時間を延ばすため、先頭だけを渡す。
const MAX_CHARS = 40_000;

// deadline を過ぎていれば呼ばずに null を返す。
function run(cmd, args, cwd, deadline) {
  const timeout = deadline - Date.now();
  if (timeout <= 0) return null;
  const res = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, maxBuffer: 64 << 20 });
  if (res.error || res.status !== 0) return null;
  return res.stdout;
}

function truncate(text) {
  if (text.length <= MAX_CHARS) return text;
  return `${text.slice(0, MAX_CHARS)}\n\n(差分は ${text.length} 文字のうち先頭 ${MAX_CHARS} 文字だけを渡しています)`;
}

function editDiff(pr, cwd, deadline) {
  const args = ['pr', 'diff'];
  if (pr.selector) args.push(pr.selector);
  if (pr.repo) args.push('--repo', pr.repo);
  return run('gh', args, cwd, deadline);
}

// fork から upstream へ出す PR や --head の指定は考慮しない。
// 差分を誤った場合も、レビューの照合が外れるだけで投稿は止めない。
function createDiff(pr, cwd, deadline) {
  const base = pr.base
    ? `origin/${pr.base}`
    : run('git', ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd, deadline)?.trim();
  if (!base) return null;
  const log = run('git', ['log', '--oneline', `${base}..HEAD`], cwd, deadline);
  const diff = run('git', ['diff', `${base}...HEAD`], cwd, deadline);
  if (diff === null) return null;
  return `## コミット\n\n${log ?? ''}\n## 差分\n\n${diff}`;
}

// gh pr create / edit の 1 回の呼び出しについて、差分の文字列か null を返す。
function changeContext(pr, cwd) {
  try {
    const deadline = Date.now() + BUDGET_MS;
    const text = pr.sub === 'edit' ? editDiff(pr, cwd, deadline) : createDiff(pr, cwd, deadline);
    return text && text.trim() ? truncate(text) : null;
  } catch {
    return null;
  }
}

module.exports = { changeContext };
