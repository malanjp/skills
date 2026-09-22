// 規約のうち、正規表現で決定論的に判定できる項目だけを規則として持つ。
//
// 受動態の判別、事実と仮説の分離、見出しの具体性、「なぜ問題か」がメカニズムで
// 書かれているかは、正規表現では偽陽性が多くなるため意図的に入れていない。
// それらは人のレビューか、生成物どうしの比較で見る。
//
// 規約 (SKILL.md) に書かれていない項目も置かない。
// かつて全角かっこの検出を置いていたが、規約に対応する規則がなく、
// 違反件数の 9 割をこの 1 項目が占めて、規約の効果を測れなくしていた。

// 本文行だけを見る規則が使う判定。コードブロックと表と引用は対象外にする。
const SKIP_LINE = /^(\s*\||\s*>|\s*```)/;

// 著者自身の表現だけを見るため、判定の前に次を取り除く。
//   インラインコード: `foo.ts` — 識別子を漢字連結や矢印として数えない
//   カギかっこ: 「多くの」 — 禁止語を引用して説明する文を違反にしない
function stripQuoted(line) {
  return line.replace(/`[^`]*`/g, ' ').replace(/[「『][^」』]*[」』]/g, ' ');
}

const KANJI = '\\u4e00-\\u9fff';

const rules = [
  {
    id: 'jargon',
    section: '2-①',
    message: '抽象的な比喩や英語直訳を使わず、平易な語で書く',
    // 語彙表 (規約 2-①) に挙げた語だけを見る。
    // 「効く」は動詞形だけを拾う。「効果」「効率」「有効」「無効」は別語である。
    test: (line) =>
      matchAll(
        line,
        /正典|写経|追補チケット|直下流|バイト一致|ゲートなし|透過合成|退避する|ラチェット|楞|包括的|堅牢|シームレス|効か[せすなれ]|効[きくけ]/g,
      ),
  },
  {
    id: 'vague-quantifier',
    section: '3-①',
    message: '曖昧な数量詞を使わず、件数や割合で書く',
    test: (line) => matchAll(line, /多くの|大幅に|かなり|さまざまな|様々な|いくつかの|ある程度/g),
  },
  {
    id: 'vague-why',
    section: '3-②',
    message: '抽象的な警告で止めず、どう壊れるかをメカニズムで書く',
    test: (line) => matchAll(line, /保守性が下がる|可読性が下がる|パフォーマンスに悪影響|品質が低下/g),
  },
  {
    id: 'kanji-run',
    section: '5-⑤',
    message: '漢字が 6 文字以上続く複合語を分解する',
    test: (line) => matchAll(line, new RegExp(`[${KANJI}]{6,}`, 'g')),
  },
  {
    id: 'no-chain',
    section: '5-⑤',
    // 規約の目安は「の」が 3 つ。並列の列挙も 3 つで引っかかるため、
    // 機械判定では 4 つ以上だけを違反とする。
    message: '「の」が 4 つ以上続く修飾を分解する',
    test: (line) => matchAll(line, /(?:[^\s、。]{1,8}の){4,}/g),
  },
  {
    id: 'back-reference',
    section: '5-③',
    message: '「上記」「前述」等を使わず、対象を再掲する',
    test: (line) => matchAll(line, /上記|下記|前述|後述|上述|先述|前掲/g),
  },
  {
    id: 'double-negative',
    section: '5-⑦',
    message: '二重否定を肯定形に直す',
    test: (line) => matchAll(line, /ない(?:わけ|こと)ではない|なくはない|ないことはない|なくもない/g),
  },
  {
    id: 'long-sentence',
    section: '2-②',
    message: '1 文が長い。「。」で切って 1 文 1 メッセージにする',
    // 規約の目安は 1 文 50〜60 文字。その 2 倍を超えたものだけを違反とし、
    // 列挙を含む文が毎回引っかかるのを避ける。
    test: (line) => {
      const hits = [];
      for (const sentence of splitSentences(line)) {
        if (sentence.trim().length > 120) hits.push(sentence.trim().slice(0, 24));
      }
      return hits;
    },
  },
  {
    id: 'arrow-note',
    section: '2-⑤',
    message: '矢印の走り書きをやめ、完全な文にする',
    test: (line) => matchAll(line, /[^\s`]+\.[a-z]{2,4}(?::\d+)?\s*[←→]/g),
  },
];

// 文書全体を見る規則。行単位では判定できないものを置く。
const documentRules = [
  {
    id: 'parallel-style',
    section: '5-⑥',
    message: '並列する項目で体言止めと文末止めを混ぜない',
    test: (lines) => {
      const hits = [];
      for (const block of listBlocks(lines)) {
        // 2 項目だけの並びは偶然の混在が多いため、3 項目以上だけを見る。
        if (block.length < 3) continue;
        // ラベル付きの属性リストは並列の列挙ではないため、文末を揃える対象から外す。
        if (block.filter((item) => LABELLED.test(item.text)).length * 2 >= block.length) continue;
        const styles = new Set(block.map((item) => endingStyle(item.text)));
        styles.delete('unknown');
        if (styles.size > 1) {
          hits.push({ line: block[0].no, found: `${block.length} 項目で文末が揃っていない` });
        }
      }
      return hits;
    },
  },
  {
    id: 'list-depth',
    section: '1-③',
    message: '箇条書きのネストは 2 階層まで',
    test: (lines) => {
      const hits = [];
      lines.forEach(({ text, no, inCode }) => {
        if (inCode) return;
        const m = text.match(/^(\s+)[-*+] /);
        if (m && m[1].length >= 4) hits.push({ line: no, found: text.trim().slice(0, 24) });
      });
      return hits;
    },
  },
  {
    id: 'conjunction-chain',
    section: '5-⑧',
    message: '接続詞で 3 つ以上続けてつながない。見出しかテーブルに昇格させる',
    test: (lines) => {
      const hits = [];
      let run = 0;
      let start = null;
      for (const { text, no, inCode } of lines) {
        if (inCode || !text.trim()) continue;
        if (/^(?:また|なお|さらに|そして|加えて)[、。]/.test(text.trim())) {
          run += 1;
          if (run === 1) start = no;
          if (run >= 3) hits.push({ line: start, found: '接続詞が 3 回続く' });
        } else {
          run = 0;
        }
      }
      return hits;
    },
  },
  {
    id: 'bluf-missing',
    section: '1-①',
    message: '冒頭に結論を置く。H1 の直後 3 行以内に本文がない',
    test: (lines) => {
      const body = lines.filter((l) => !l.inCode);
      const h1 = body.findIndex((l) => /^# /.test(l.text));
      if (h1 === -1) return [];
      const after = body.slice(h1 + 1, h1 + 5).filter((l) => l.text.trim());
      if (after.length === 0) return [{ line: body[h1].no, found: '本文なし' }];
      const first = after[0].text.trim();
      if (/^#{2,}/.test(first)) return [{ line: after[0].no, found: first.slice(0, 24) }];
      return [];
    },
  },
];

function matchAll(line, re) {
  return (line.match(re) || []).map((s) => s.slice(0, 24));
}

// 「**事実**: 〜」のように、ラベルと値を並べた項目を見分ける。
// 規約 1-④ が求める情報種別の分離はこの形になるため、文末の統一は求めない。
const LABELLED = /^\*\*[^*]+\*\*\s*[:：]/;

// 同じインデント幅で続く箇条書きを 1 つの並びとして取り出す。
// 空行、見出し、コードブロックで区切る。子リストは別の並びとして扱う。
function listBlocks(lines) {
  const blocks = [];
  const open = new Map();
  const close = (indent) => {
    if (open.has(indent)) {
      blocks.push(open.get(indent));
      open.delete(indent);
    }
  };
  for (const { text, no, inCode } of lines) {
    if (inCode || /^#{1,6} /.test(text) || !text.trim()) {
      for (const indent of [...open.keys()]) close(indent);
      continue;
    }
    const m = text.match(/^(\s*)(?:[-*+]|\d+\.) (.+)$/);
    if (!m) continue;
    const indent = m[1].length;
    if (!open.has(indent)) open.set(indent, []);
    open.get(indent).push({ text: m[2].trim(), no });
  }
  for (const indent of [...open.keys()]) close(indent);
  return blocks;
}

// 項目の終わり方を、文末止めと体言止めの 2 つに分ける。
// 句点があるか、動詞や形容詞で終われば文末止め、名詞で終われば体言止めとする。
function endingStyle(text) {
  // 末尾のインラインコードは中身を見ずに 1 語として扱う。
  const body = text.replace(/`[^`]*`/g, 'X').replace(/\s+$/, '');
  if (/[。]$/.test(body)) return 'sentence';
  // 句点がない場合、動詞の終止形はウ段のかなで終わる。形容詞は「い」で終わる。
  if (/[うくぐすずつづぬふぶぷむる]$/.test(body)) return 'sentence';
  if (/(?:ない|よい|らしい|しい|だ|た)$/.test(body)) return 'sentence';
  // 助詞や読点で終わる行は、項目として完結していないので判定しない。
  if (/[:：|、はがをにでとも]$/.test(body)) return 'unknown';
  if (/[぀-ゟ]$/.test(body)) return 'unknown';
  return 'noun';
}

// 「。」で切る。ただしコード中のピリオドは対象外なので全角句点だけを見る。
function splitSentences(line) {
  return line.split('。');
}

module.exports = { rules, documentRules, SKIP_LINE, stripQuoted };
