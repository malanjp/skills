// 投稿の直前に、語句の検査 (tools/lint.js) と読み手の検査 (reader-lib.js) をまとめて判定する。
// PR の hooks/pr-lint.js と Linear の hooks/linear-lint.js が使う。
//
// 両方の指摘を 1 つの理由にまとめて返し、書き手が 1 回の書き直しで両方を直せるようにする。
//
// 読み手の指摘は、同じ本文に対して 1 回だけ止める。
// 読み手の指摘には誤りが混ざるため、同じ本文の再投稿は書き手が確認したものとして通す。
// 語句の検査は、PR では従来どおり毎回止める (`TIRED_DEV_PR_LINT=off` で外せる)。
// Linear には環境変数を付ける手段がないため、語句の検査も 1 回だけ止める。

const {
  MAX_READER_STOPS,
  readerStops,
  addReaderStop,
  runReader,
  formatReaderFindings,
  contentKey,
  wasSeen,
  markSeen,
} = require('./reader-lib');

// 止める場合は理由の文字列を、通す場合は null を返す。
//   parts: 投稿するタイトルや本文の配列
//   lintFindings: 語句の検査の指摘
//   lintLines: 語句の指摘を理由に書く行の配列
//   lintEveryTime: true なら語句の指摘で毎回止める
//   scope: 読み手が止めた回数を数える単位 (pr、linear)
function reviewPost({ sessionId, scope, parts, lintFindings, lintLines, lintEveryTime, env = process.env }) {
  const texts = parts.filter(Boolean);
  if (texts.length === 0) return null;
  const key = contentKey(sessionId, texts);
  const seen = wasSeen(key, env);

  const readerSkipped = seen || readerStops(sessionId, scope, env) >= MAX_READER_STOPS;
  let readerFindings = readerSkipped ? [] : runReader(texts.join('\n\n'), env);
  const lintStops = lintFindings.length > 0 && (lintEveryTime || !seen);
  if (!lintStops && readerFindings.length === 0) return null;

  // 1 回だけ止める指摘は、記録できたときだけ止める。
  const onceFindings = readerFindings.length > 0 || (lintStops && !lintEveryTime);
  if (onceFindings && !markSeen(key, env)) {
    readerFindings = [];
    if (!lintEveryTime || lintFindings.length === 0) return null;
  }

  if (readerFindings.length > 0) addReaderStop(sessionId, scope, env);

  const sections = [];
  if (lintStops) sections.push(lintLines.join('\n'));
  if (readerFindings.length > 0) {
    sections.push(
      [
        `tired-dev: 事情を知らない読み手のモデルが、本文だけでは意味が取れない語を ${readerFindings.length} 件挙げた。`,
        '平易な語に直すか、本文で意味を説明してから投稿し直す。',
        '',
        ...formatReaderFindings(readerFindings),
        '',
        '読み手の指摘は誤りを含む。誤りだと判断した語は直さなくてよい。',
        '指摘をすべて確認したうえで同じ内容のまま投稿し直すと、読み手の検査は通る。',
        'その場合は、残した語と理由を報告で利用者に伝える。',
      ].join('\n')
    );
  }
  return sections.join('\n\n');
}

module.exports = { reviewPost };
