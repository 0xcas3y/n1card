// plan.js — 纯函数模块，可在 Node 和浏览器中使用
// 不读写 storage、不碰 DOM

// 批数：累计打卡每满 10 天 +1 批；上限 3 批
export function computeBatchesAllowed(totalDays) {
  const t = Math.max(0, totalDays | 0);
  return Math.min(1 + Math.floor(t / 10), 3);
}

// 配额：批数 × 每批词数
// 学新：baseGroup=30 → 30 / 60 / 90
// 洗脑：baseGroup=60 → 60 / 120 / 180
export function computeQuota(totalDays, baseGroup = 30) {
  return baseGroup * computeBatchesAllowed(totalDays);
}

export function computeLearnQueue(cards, progress, quota) {
  const sorted = [...cards].sort((a, b) => a.id - b.id);
  const queue = [];
  for (const c of sorted) {
    const st = progress[c.id]?.status;
    if (st === 'known' || st === 'unknown') continue;
    queue.push(c);
    if (queue.length >= quota) break;
  }
  return queue;
}

// YYYY-MM-DD → Date (local)
function _parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Date → YYYY-MM-DD (local)
function _fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function _shiftDays(dateStr, delta) {
  const d = _parseDate(dateStr);
  d.setDate(d.getDate() + delta);
  return _fmtDate(d);
}

export function computeMorningPool(cohorts, progress, todayStr) {
  const yesterday = _shiftDays(todayStr, -1);
  const dayBefore = _shiftDays(todayStr, -2);
  const ids = new Set();
  for (const key of [yesterday, dayBefore]) {
    const co = cohorts[key];
    if (!co) continue;
    for (const id of co.cardIds) ids.add(id);
  }
  return [...ids].filter(id => progress[id]?.status === 'unknown');
}

export function pruneOldCohorts(cohorts, todayStr) {
  const keep = new Set([
    todayStr,
    _shiftDays(todayStr, -1),
    _shiftDays(todayStr, -2)
  ]);
  const out = {};
  for (const k of Object.keys(cohorts)) if (keep.has(k)) out[k] = cohorts[k];
  return out;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function computeWeeklyDue(progress, now) {
  const due = [];
  for (const id in progress) {
    const p = progress[id];
    if (p.status !== 'known') continue;
    const last = p.lastWeeklyReviewAt || p.masteredAt;
    if (!last) continue;
    if (now - last >= WEEK_MS) due.push(parseInt(id, 10));
  }
  return due;
}

export function pickDistractors(correct, pool, count = 3) {
  const candidates = pool.map(c => c.kana).filter(k => k && k !== correct);
  const unique = [...new Set(candidates)];
  // Fisher–Yates partial shuffle
  for (let i = unique.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unique[i], unique[j]] = [unique[j], unique[i]];
  }
  return unique.slice(0, count);
}

export function aggregateCheckIns(checkIns, dateStr) {
  const c = checkIns?.[dateStr];
  if (!c) return 'none';
  if (c.morning && c.evening) return 'gold';
  if (c.morning || c.evening) return 'half';
  return 'none';
}

// 学习窗口：本地时间 20:00–00:59（含）
export function isLearnWindowOpen(now = new Date()) {
  const h = now.getHours();
  return h >= 20 || h < 1;
}

// 一般复习：全部"学过"的词（known/unknown），按简化遗忘曲线权重加权随机不放回抽样
// unknown 固定权重 5；known 权重随距上次复习天数增长，封顶 4、保底 0.5
export function computeGeneralReviewPool(cards, progress, now, size = 20) {
  const DAY_MS = 86400000;
  const weighted = [];
  for (const c of cards) {
    const p = progress[c.id];
    if (!p || !p.status) continue;
    let weight;
    if (p.status === 'unknown') {
      weight = 5;
    } else {
      const last = Math.max(p.masteredAt || 0, p.lastWeeklyReviewAt || 0, p.lastSeen || 0);
      const daysSince = last ? (now - last) / DAY_MS : 999;
      weight = Math.min(4, Math.max(0.5, daysSince / 3));
    }
    weighted.push({ card: c, weight });
  }

  const picked = [];
  const pool = weighted;
  const n = Math.min(size, pool.length);
  for (let i = 0; i < n; i++) {
    const total = pool.reduce((s, w) => s + w.weight, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    picked.push(pool[idx].card);
    pool.splice(idx, 1);
  }
  return picked;
}

// ---- 间隔重复算法（Task 1，统一学习/复习机制重设计）----

export const INTERVAL_LADDER_DAYS = [1, 3, 7, 14, 30, 90];

export function advanceIntervalStage(stage) {
  return Math.min(stage + 1, INTERVAL_LADDER_DAYS.length - 1);
}

export function computeNextReviewAt(stage, now) {
  const clamped = Math.max(0, Math.min(stage, INTERVAL_LADDER_DAYS.length - 1));
  return now + INTERVAL_LADDER_DAYS[clamped] * 86400000;
}

// 滑卡判定 -> 新的 progress2 条目（不读写 storage，纯计算）
// entry: 现有条目或 undefined（首次学）；correct: 右滑(true)/左滑(false)
export function applySwipeResult(entry, correct, now) {
  const firstLearnedAt = entry?.firstLearnedAt ?? now;
  if (correct) {
    const wasMaxStage = (entry?.intervalStage ?? -1) >= INTERVAL_LADDER_DAYS.length - 1;
    const nextStage = entry ? advanceIntervalStage(entry.intervalStage) : 0;
    return {
      intervalStage: nextStage,
      nextReviewAt: computeNextReviewAt(nextStage, now),
      lastReviewedAt: now,
      firstLearnedAt,
      graduated: wasMaxStage ? true : (entry?.graduated || false)
    };
  }
  return {
    intervalStage: 0,
    nextReviewAt: computeNextReviewAt(0, now),
    lastReviewedAt: now,
    firstLearnedAt,
    graduated: false
  };
}

// 到期队列：从 progress2（复合id -> entry 的对象）里挑出未毕业且到期的复合id
export function computeDueIds(progress2, now) {
  const due = [];
  for (const compositeId in progress2) {
    const e = progress2[compositeId];
    if (!e || e.graduated) continue;
    if ((e.nextReviewAt ?? 0) <= now) due.push(compositeId);
  }
  return due;
}

// 旧 known/unknown 状态 -> 新 progress2 条目；已掌握从14天档起步，不熟从1天档重来
export function migrateOldStatus(oldStatus, now) {
  if (oldStatus === 'known') {
    return {
      intervalStage: 3,
      nextReviewAt: computeNextReviewAt(3, now),
      lastReviewedAt: now,
      firstLearnedAt: now,
      graduated: false
    };
  }
  if (oldStatus === 'unknown') {
    return {
      intervalStage: 0,
      nextReviewAt: computeNextReviewAt(0, now),
      lastReviewedAt: now,
      firstLearnedAt: now,
      graduated: false
    };
  }
  return null; // 未学过的词不生成条目
}

// ---- 统一词池（Task 2，统一学习/复习机制重设计）----

export const LEVEL_CATEGORY_FILES = {
  n1: {
    verb: 'data/cards.json',
    noun: 'data/cards-n1-noun.json',
    adj: 'data/cards-n1-adj.json',
    adverb: 'data/cards-n1-adverb.json',
    onomatope: 'data/cards-n1-onomatope.json'
  },
  n2: {
    verb: 'data/cards-n2.json',
    noun: 'data/cards-n2-noun.json',
    compound: 'data/cards-n2-compound.json',
    adj: 'data/cards-n2-adj.json',
    adverb: 'data/cards-n2-adverb.json',
    onomatope: 'data/cards-n2-onomatope.json'
  },
  n3: {
    verb: 'data/cards-n3.json',
    noun: 'data/cards-n3-noun.json',
    adj: 'data/cards-n3-adj.json',
    adverb: 'data/cards-n3-adverb.json',
    onomatope: 'data/cards-n3-onomatope.json'
  },
  n4: {
    verb: 'data/cards-n4.json',
    noun: 'data/cards-n4-noun.json',
    adj: 'data/cards-n4-adj.json',
    adverb: 'data/cards-n4-adverb.json',
    onomatope: 'data/cards-n4-onomatope.json'
  },
  n5: {
    verb: 'data/cards-n5.json',
    noun: 'data/cards-n5-noun.json',
    adj: 'data/cards-n5-adj.json',
    adverb: 'data/cards-n5-adverb.json',
    onomatope: 'data/cards-n5-onomatope.json'
  }
};

// 推荐学习顺序：动词 -> 名词 -> 复合动词(仅N2) -> 形容词 -> 副词 -> 拟声词
export const CATEGORY_ORDER = ['verb', 'noun', 'compound', 'adj', 'adverb', 'onomatope'];

// 合并已经 fetch 好的各词性文件，打 category 标签 + 复合id
// categoryCardArrays: [{ category: 'verb', cards: [...] }, ...]
export function mergeLevelPool(level, categoryCardArrays) {
  const merged = [];
  for (const { category, cards } of categoryCardArrays) {
    for (const c of cards) {
      merged.push({ ...c, category, origId: c.id, compositeId: `${level}:${category}:${c.id}` });
    }
  }
  return merged;
}

// 找出第一个"还有未学词"的词性，全学完返回 null
export function pickRecommendedCategory(pool, progress2) {
  const byCategory = {};
  for (const c of pool) {
    (byCategory[c.category] ??= []).push(c);
  }
  for (const cat of CATEGORY_ORDER) {
    const cards = byCategory[cat];
    if (!cards) continue;
    if (cards.some(c => !progress2[c.compositeId])) return cat;
  }
  return null;
}

// 从指定词性里按原始 id 顺序挑 quota 个未学词
export function computeNewWordQueue(pool, progress2, quota, category) {
  const candidates = pool.filter(c => c.category === category && !progress2[c.compositeId]);
  const sorted = [...candidates].sort((a, b) => a.origId - b.origId);
  return sorted.slice(0, Math.max(0, quota));
}

// 混合今日会话：新词 + 到期复习词，随机打散顺序
export function buildTodaySession(newCards, dueCards) {
  const combined = [...newCards, ...dueCards];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }
  return combined;
}

