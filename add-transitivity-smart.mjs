import fs from 'node:fs/promises';

// Fallback mapping for cards where type doesn't specify transitivity
const transitivityMap = {
  "応じる": "自",
  "基づく": "自",
  "伴う": null,
  "及ぶ": "自",
  "踏まえる": "他",
  "試みる": "他",
  "兼ねる": "他",
  "関する": "自",
  "至る": "自",
  "占める": "他",
  "迫る": null,
  "抑える": "他",
  "訴える": "他",
  "揃える": "他",
  "誘う": "他",
  "補う": "他",
  "成り立つ": "自",
  "生じる": "自",
  "位置する": "自",
  "該当する": "自",
  "象徴する": "他",
  "要求する": "他",
  "要請する": "他",
  "拒否する": "他",
  "拒絶する": "他",
  "受理する": "他",
  "審査する": "他",
  "取材する": "他",
  "記録する": "他",
  "制限する": "他",
  "取得する": "他",
  "取引する": "他",
  "生産する": "他",
  "消費する": "他",
  "投資する": "他",
  "返済する": "他",
  "貯蓄する": "他",
  "乗り出す": null,
  "乗り込む": "自",
  "持ち込む": "他",
  "持ち上げる": "他",
  "盛り上がる": "自",
  "盛り込む": "他",
  "浮かび上がる": "自",
  "立て直す": "他",
  "立ち向かう": "自",
  "取り立てる": "他",
  "取り除く": "他",
  "取り調べる": "他",
  "引き上げる": null,
  "引き下げる": "他",
  "巻き込む": "他",
  "呼び寄せる": "他",
  "言い換える": "他",
  "言い張る": "他",
  "食い違う": "自",
  "切り出す": "他",
  "切り詰める": "他",
  "滑る": "自",
  "凹む": "自",
  "歪む": "自",
  "剥ぐ": "他",
  "絡む": "自",
  "縫う": "他",
  "裂ける": "自",
  "溶ける": "自",
  "溶かす": "他",
  "凍える": "自",
  "注ぐ": "他",
  "垂らす": "他",
  "汲む": "他",
  "浸す": "他",
  "浸る": "自",
  "煮る": "他",
  "蒸す": "他",
  "炊く": "他",
  "蒸発する": "自",
  "分散する": "自",
  "集中する": null,
  "広がる": "自",
  "広げる": "他",
  "膨らむ": "自",
  "膨らます": "他",
  "縮まる": "自",
  "縮む": "自",
  "縮める": "他",
  "縮小する": "他",
  "拡大する": "他",
  "強調する": "他",
  "強制する": "他",
  "強化する": "他",
  "安定する": "自",
  "固定する": "他",
  "固める": "他",
  "固まる": "自",
  "融合する": "自",
  "分離する": "他",
  "見極める": "他",
  "見分ける": "他",
  "見積もる": "他",
  "見破る": "他",
  "見逃す": "他",
  "見送る": "他",
  "見届ける": "他",
  "推測する": "他",
  "推定する": "他",
  "推進する": "他",
  "推薦する": "他",
  "遠慮する": "自",
  "見倣う": "他",
  "譲る": "他",
  "断る": "他",
  "断念する": "他",
  "辞退する": "他",
  "励ます": "他",
  "励む": "自",
  "尽くす": "他",
  "契約する": "他",
  "解約する": "他",
  "解除する": "他",
  "把握する": "他",
  "確認する": "他",
  "確保する": "他",
  "確立する": "他",
  "維持する": "他",
  "促進する": "他",
  "促す": "他",
  "導く": "他",
  "導入する": "他",
  "展開する": "他",
  "提示する": "他",
  "提唱する": "他",
  "提供する": "他",
  "提案する": "他",
  "主張する": "他",
  "表現する": "他",
  "表明する": "他",
  "示す": "他",
  "指摘する": "他",
  "指定する": "他",
  "指示する": "他",
  "判断する": "他",
  "判明する": "自",
  "察する": "他",
  "感じ取る": "他",
  "捉える": "他",
  "比較する": "他",
  "評価する": "他",
  "対応する": "自",
  "対処する": "他",
  "適応する": "自",
  "向上する": "自",
  "上昇する": "自",
  "低下する": "自",
  "減少する": "自",
  "増加する": "自",
  "変化する": "自",
  "変更する": "他",
  "変換する": "他",
  "変革する": "他",
  "改善する": "他",
  "改正する": "他",
  "修正する": "他",
  "調整する": "他",
  "調査する": "他",
  "調べる": "他",
  "検討する": "他",
  "検査する": "他",
  "検証する": "他",
  "実施する": "他",
  "実現する": "他",
  "実行する": "他",
  "実感する": "他",
  "完成する": "自",
  "完了する": "自",
  "達成する": "他",
  "達する": "自",
  "成功する": "自",
  "成立する": "自",
  "失敗する": "自",
  "解決する": "他",
  "反映する": "他",
  "関連する": "自",
  "連携する": "自",
  "協力する": "自",
  "協議する": "他",
  "協調する": "自",
  "交渉する": "他",
  "議論する": "他",
  "同意する": "自",
  "賛成する": "自",
  "反対する": "自",
  "批判する": "他",
  "否定する": "他",
  "肯定する": "他",
  "受け入れる": "他",
  "受け付ける": "他",
  "申し込む": "他",
  "申し出る": "他",
  "申請する": "他",
};

function extractTransitivityFromType(typeField) {
  if (!typeField || typeof typeField !== 'string') {
    return null;
  }

  if (typeField.includes('他動詞') || typeField.includes('他動')) {
    return "他";
  } else if (typeField.includes('自動詞') || typeField.includes('自動')) {
    return "自";
  }

  return null;
}

const filePath = 'data/cards-n2.json';

async function addTransitivity() {
  const content = await fs.readFile(filePath, 'utf8');
  const data = JSON.parse(content);

  let counts = { 他: 0, 自: 0, null: 0, unmapped: 0 };
  const unmappedVerbs = new Set();

  data.cards = data.cards.map(card => {
    const word = card.word;

    // First try to extract from type field
    let transitivity = extractTransitivityFromType(card.type);

    // If not found, use fallback map
    if (transitivity === null) {
      transitivity = transitivityMap[word];

      if (transitivity === undefined) {
        unmappedVerbs.add(word);
        counts.unmapped++;
        transitivity = null;
      }
    }

    if (transitivity === "他") {
      counts["他"]++;
    } else if (transitivity === "自") {
      counts["自"]++;
    } else if (transitivity === null) {
      counts["null"]++;
    }

    // Add transitivity field right after type
    const { type, ...rest } = card;
    return {
      ...rest,
      type,
      transitivity,
    };
  });

  // Write back to file
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');

  console.log('✓ Transitivity field added successfully!');
  console.log(`  Total cards: ${data.cards.length}`);
  console.log(`  他 (transitive): ${counts["他"]}`);
  console.log(`  自 (intransitive): ${counts["自"]}`);
  console.log(`  null (ambiguous): ${counts["null"]}`);
  console.log(`  Unmapped verbs: ${counts.unmapped}`);

  if (unmappedVerbs.size > 0) {
    console.log('\n  Unmapped verbs (assigned null):');
    Array.from(unmappedVerbs).sort().forEach(v => console.log(`    - ${v}`));
  }
}

await addTransitivity();
