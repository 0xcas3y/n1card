// plan.js — 纯函数模块，可在 Node 和浏览器中使用
// 不读写 storage、不碰 DOM

export function computeQuota(streak) {
  if (streak >= 14) return 90;
  if (streak >= 7) return 60;
  return 30;
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
