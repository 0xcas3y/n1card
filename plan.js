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

// 回忆模式会话组装：顽固词优先注入，剩余名额按 learnedIds 的顺序从 position 开始的游标补满。
// 游标每绕回 0 一次，cyclesCompleted 计一次（一次会话内池子很小时可能绕多圈）。
export function computeRecallSession(learnedIds, stubbornIds, position, size = 60) {
  const total = learnedIds.length;
  if (total === 0) return { cardIds: [], nextPosition: 0, cyclesCompleted: 0 };

  const stubbornSet = new Set(stubbornIds);
  const picked = [];
  const pickedSet = new Set();

  // 1. 顽固词优先，按 learnedIds 顺序保证确定性
  for (const id of learnedIds) {
    if (picked.length >= size) break;
    if (stubbornSet.has(id)) {
      picked.push(id);
      pickedSet.add(id);
    }
  }

  // 2. 从 position 开始按游标顺序补满剩余名额
  let pos = ((position % total) + total) % total;
  let cyclesCompleted = 0;
  let steps = 0;
  while (picked.length < size && steps < total) {
    const id = learnedIds[pos];
    if (!pickedSet.has(id)) {
      picked.push(id);
      pickedSet.add(id);
    }
    pos = (pos + 1) % total;
    if (pos === 0) cyclesCompleted++;
    steps++;
  }

  return { cardIds: picked, nextPosition: pos, cyclesCompleted };
}
