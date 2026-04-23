// plan.js — 纯函数模块，可在 Node 和浏览器中使用
// 不读写 storage、不碰 DOM

export function computeQuota(streak) {
  if (streak >= 14) return 90;
  if (streak >= 7) return 60;
  return 30;
}
