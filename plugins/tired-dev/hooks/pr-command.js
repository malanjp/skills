// Bash コマンド文字列から gh pr create / gh pr edit のタイトルと本文を取り出す。
//
// シェルを完全には解釈しない。過去のセッションで使われていた次の書き方だけを扱う。
//   --title "..." / -t / --title=...
//   --body "..." / -b / --body=...
//   --body "$(cat <<'EOF' ... EOF)"
//   cat > path <<'EOF' ... EOF のあとに --body-file path
//   --body-file - <<'EOF' ... EOF
//   --body-file path (ディスク上の既存ファイル)
// 変数展開やコマンド置換を含む値は中身が確定しないため、検査の対象から外す。

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const MARK = '\u0000';
const PLACEHOLDER = /\u0000H(\d+)\u0000/;

// ヒアドキュメントの本文を取り出し、プレースホルダに置き換える。
// 本文に含まれる引用符が、後段の引用符の解釈を壊さないようにするため。
function extractHeredocs(command) {
  const docs = [];
  let text = command;
  let from = 0;
  const opener = /<<(-?)[ \t]*(['"]?)([A-Za-z_]\w*)\2/g;
  for (;;) {
    opener.lastIndex = from;
    const m = opener.exec(text);
    if (!m) break;
    const bodyStart = text.indexOf('\n', m.index + m[0].length);
    if (bodyStart === -1) break;
    const lines = text.slice(bodyStart + 1).split('\n');
    const strip = m[1] === '-';
    const end = lines.findIndex((line) => (strip ? line.trim() : line.replace(/[ \t]+$/, '')) === m[3]);
    if (end === -1) break;
    const body = lines.slice(0, end).join('\n');
    const consumed = lines.slice(0, end + 1).join('\n').length + 1;
    const mark = `${MARK}H${docs.length}${MARK}`;
    docs.push(body);
    // 開始行の残り (例: `)"`) はヒアドキュメントの後ろに回す。
    const lineRest = text.slice(m.index + m[0].length, bodyStart);
    text = text.slice(0, m.index + m[0].length) + mark + lineRest + text.slice(bodyStart + consumed);
    from = m.index + m[0].length + mark.length;
  }
  return { text, docs };
}

// 引用符を外しながら単語に分け、制御演算子で単純コマンドに区切る。
function splitCommands(text) {
  const commands = [];
  let words = [];
  let word = '';
  let inWord = false;
  const pushWord = () => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const pushCommand = () => {
    pushWord();
    if (words.length) commands.push(words);
    words = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "'") {
      const close = text.indexOf("'", i + 1);
      const stop = close === -1 ? text.length : close;
      word += text.slice(i + 1, stop);
      inWord = true;
      i = stop;
    } else if (c === '"') {
      inWord = true;
      for (i += 1; i < text.length && text[i] !== '"'; i += 1) {
        if (text[i] === '\\' && '"\\$`'.includes(text[i + 1])) i += 1;
        word += text[i];
      }
    } else if (c === '\\') {
      word += text[i + 1] ?? '';
      inWord = true;
      i += 1;
    } else if (c === ';' || c === '\n' || c === '|' || c === '&' || c === '(' || c === ')') {
      // `2>&1` の `&` も区切りになるが、gh の引数の解釈には影響しない。
      pushCommand();
    } else if (/\s/.test(c)) {
      pushWord();
    } else {
      word += c;
      inWord = true;
    }
  }
  pushCommand();
  return commands;
}

// 値がヒアドキュメントそのものなら本文を返す。変数やコマンド置換を含むなら null を返す。
function resolveValue(value, docs) {
  const m = value.match(PLACEHOLDER);
  if (m) return docs[Number(m[1])];
  if (/\$[({A-Za-z_]|`/.test(value)) return null;
  return value;
}

function optionValue(args, longName, shortName) {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === longName || a === shortName) return args[i + 1] ?? null;
    if (a.startsWith(`${longName}=`)) return a.slice(longName.length + 1);
  }
  return null;
}

// `S=/tmp/x; ... --body-file $S/pr.md` のように、同じコマンドで代入した変数だけを展開する。
// 代入していない変数が残る場合は中身が確定しないので null を返す。
function expandVars(value, vars) {
  const expanded = value.replace(/\$\{?([A-Za-z_]\w*)\}?/g, (all, name) => (vars.has(name) ? vars.get(name) : all));
  return /\$|`/.test(expanded) ? null : expanded;
}

function readBodyFile(file, cwd, vars) {
  const resolved = expandVars(file, vars);
  if (resolved === null) return null;
  const expanded = resolved.replace(/^~(?=\/|$)/, os.homedir());
  try {
    return fs.readFileSync(path.resolve(cwd || process.cwd(), expanded), 'utf8');
  } catch {
    return null;
  }
}

// gh pr create / edit の呼び出しごとに { title, body, bypass } を返す。
// 値を確定できない項目は null にする。
function parsePrCommands(command, cwd) {
  if (typeof command !== 'string' || !/\bgh\b/.test(command)) return [];
  const { text, docs } = extractHeredocs(command);
  const commands = splitCommands(text);

  // 代入だけの単純コマンド (`S=/tmp/x`) を覚える。値に変数を含む代入は覚えない。
  const vars = new Map();
  for (const words of commands) {
    if (!words.every((w) => /^[A-Za-z_]\w*=/.test(w))) continue;
    for (const w of words) {
      const [name, ...rest] = w.split('=');
      const value = expandVars(rest.join('='), vars);
      if (value === null) vars.delete(name);
      else vars.set(name, value);
    }
  }

  // cat > path <<'EOF' で書き出したファイルの中身を、パスをキーにして覚える。
  const written = new Map();
  for (const words of commands) {
    const redirect = words.findIndex((w) => w === '>' || (w.startsWith('>') && w.length > 1));
    const doc = words.map((w) => w.match(PLACEHOLDER)).find(Boolean);
    if (redirect === -1 || !doc) continue;
    const target = words[redirect] === '>' ? words[redirect + 1] : words[redirect].slice(1);
    if (target) written.set(expandVars(target, vars) ?? target, docs[Number(doc[1])]);
  }

  const found = [];
  for (const words of commands) {
    // `FOO=1 gh pr create` のような環境変数の前置を読み飛ばす。
    let start = 0;
    while (start < words.length && /^[A-Za-z_]\w*=/.test(words[start])) start += 1;
    const [gh, pr, sub] = words.slice(start, start + 3);
    if (gh !== 'gh' || pr !== 'pr' || (sub !== 'create' && sub !== 'edit')) continue;

    const args = words.slice(start + 3);
    const bypass = words.slice(0, start).some((w) => /^TIRED_DEV_PR_LINT=(off|0|false|no)$/i.test(w));
    const rawTitle = optionValue(args, '--title', '-t');
    const rawBody = optionValue(args, '--body', '-b');
    const rawFile = optionValue(args, '--body-file', '-F');

    let body = rawBody === null ? null : resolveValue(rawBody, docs);
    if (rawFile === '-') {
      const doc = args.map((w) => w.match(PLACEHOLDER)).find(Boolean);
      body = doc ? docs[Number(doc[1])] : null;
    } else if (rawFile !== null) {
      const key = expandVars(rawFile, vars) ?? rawFile;
      body = written.has(key) ? written.get(key) : readBodyFile(rawFile, cwd, vars);
    }
    const title = rawTitle === null ? null : resolveValue(rawTitle, docs);
    found.push({ title, body, bypass });
  }
  return found;
}

module.exports = { parsePrCommands, extractHeredocs, splitCommands };
