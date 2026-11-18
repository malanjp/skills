// 投稿の直前に、語句の検査 (tools/lint.js) と読み手の検査 (reader-lib.js) と規約のレビュー (review-lib.js) をまとめて判定する。
// PR の hooks/pr-lint.js と Linear の hooks/linear-lint.js が使う。
//
// すべての指摘を 1 つの理由にまとめて返し、書き手が 1 回の書き直しで直せるようにする。
// 読み手とレビュアーのモデルは並行して呼び、待ち時間を長い方の 1 回分に抑える。
//
// モデルの指摘は、同じ本文に対して 1 回だけ止める。
// モデルの指摘には誤りが混ざるため、同じ本文の再投稿は書き手が確認したものとして通す。
// 読み手の検査は、1 セッションの投稿先ごとに止める回数の上限 (MAX_READER_STOPS) を持つ。
// 規約のレビューは、投稿が通るまでの間に止める回数を MAX_REVIEW_STOPS 回までにする。
// 上限がないと、書き直すたびに別の規則の指摘が付き、止められ続けることがある。
// 投稿が通ったら回数を消し、次の投稿は改めてレビューする。
// 語句の検査は、PR では従来どおり毎回止める (`TIRED_DEV_PR_LINT=off` で外せる)。
// Linear には環境変数を付ける手段がないため、語句の検査も 1 回だけ止める。

const {
  MAX_READER_STOPS,
  stopCount,
  addStop,
  clearStops,
  runReader,
  formatReaderFindings,
  contentKey,
  wasSeen,
  markSeen,
} = require('./reader-lib');
const { runReview, formatReviewFindings } = require('./review-lib');

const MAX_REVIEW_STOPS = 1;

// 止める場合は理由の文字列を、通す場合は null を返す。
//   parts: 投稿するタイトルや本文の配列
//   lintFindings: 語句の検査の指摘
//   lintLines: 語句の指摘を理由に書く行の配列
//   lintEveryTime: true なら語句の指摘で毎回止める
//   scope: モデルが止めた回数を数える単位 (pr、linear)
//   getChange: PR の差分を返す関数。レビュアーを呼ぶときだけ実行する
async function reviewPost({ sessionId, scope, parts, lintFindings, lintLines, lintEveryTime, getChange, env = process.env }) {
  const texts = parts.filter(Boolean);
  if (texts.length === 0) return null;
  const key = contentKey(sessionId, texts);
  const seen = wasSeen(key, env);

  const reviewScope = `review-${scope}`;
  const readerSkipped = seen || stopCount(sessionId, scope, env) >= MAX_READER_STOPS;
  const reviewSkipped = seen || stopCount(sessionId, reviewScope, env) >= MAX_REVIEW_STOPS;
  const text = texts.join('\n\n');
  let [readerFindings, reviewFindings] = await Promise.all([
    readerSkipped ? [] : runReader(text, env),
    reviewSkipped ? [] : runReview(text, getChange ? getChange() : null, env),
  ]);
  const lintStops = lintFindings.length > 0 && (lintEveryTime || !seen);
  const modelStops = readerFindings.length + reviewFindings.length > 0;
  if (!lintStops && !modelStops) {
    clearStops(sessionId, reviewScope, env);
    return null;
  }

  // 1 回だけ止める指摘は、記録できたときだけ止める。
  const onceFindings = modelStops || (lintStops && !lintEveryTime);
  if (onceFindings && !markSeen(key, env)) {
    readerFindings = [];
    reviewFindings = [];
    if (!lintEveryTime || lintFindings.length === 0) {
      // 投稿を通すので、レビューの回数も消す。残すと次の投稿のレビューを省いてしまう。
      clearStops(sessionId, reviewScope, env);
      return null;
    }
  }

  if (readerFindings.length > 0) addStop(sessionId, scope, env);
  if (reviewFindings.length > 0) addStop(sessionId, reviewScope, env);

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
      ].join('\n')
    );
  }
  if (reviewFindings.length > 0) {
    sections.push(
      [
        `tired-dev: 規約のレビュアーのモデルが、tech-writing 規約への違反を ${reviewFindings.length} 件挙げた。`,
        '指摘の箇所を直してから投稿し直す。',
        '書き直した本文では規約のレビューを省く。読み手の検査と語句の検査は続ける。',
        '',
        ...formatReviewFindings(reviewFindings),
      ].join('\n')
    );
  }
  if (readerFindings.length + reviewFindings.length > 0) {
    sections.push(
      [
        'モデルの指摘は誤りを含む。誤りだと判断した指摘は直さなくてよい。',
        '指摘をすべて確認したうえで同じ内容のまま投稿し直すと、モデルの検査は通る。',
        'その場合は、残した箇所と理由を報告で利用者に伝える。',
      ].join('\n')
    );
  }
  return sections.join('\n\n');
}

module.exports = { reviewPost };
