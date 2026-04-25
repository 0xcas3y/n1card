// plan.js — 纯函数模块，可在 Node 和浏览器中使用
// 不读写 storage、不碰 DOM

// 配额：累计打卡每满 10 天 +1 组；上限 3 组
// 学新：baseGroup=30 → 30 / 60 / 90
// 洗脑：baseGroup=60 → 60 / 120 / 180
export function computeQuota(totalDays, baseGroup = 30) {
  const t = Math.max(0, totalDays | 0);
  const groups = Math.min(1 + Math.floor(t / 10), 3);
  return baseGroup * groups;
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
