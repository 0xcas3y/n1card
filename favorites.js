// favorites.js — 全局收藏(跨等级/词性)：纯逻辑模块，不碰DOM。
// 跟 Progress/Progress2(按等级分区存) 完全独立，键用 compositeId
// (level:category:id)，所以同一个词不管在哪个等级/词性页面收藏，
// 到单词本里看都是同一条，不会因为"是在n1页面收藏的还是n2页面收藏的"
// 而分裂成两条。
const KEY = 'n1card:favorites';

// 纯函数：方便单测，不直接碰 localStorage，也不做原地修改
export function toggleFavorite(favMap, compositeId, now) {
  const next = { ...favMap };
  if (next[compositeId]) {
    delete next[compositeId];
  } else {
    next[compositeId] = { addedAt: now };
  }
  return next;
}

export function isFavorited(favMap, compositeId) {
  return !!favMap[compositeId];
}

export const Favorites = {
  _map: null,
  load() {
    if (this._map) return this._map;
    try {
      const raw = localStorage.getItem(KEY);
      this._map = raw ? JSON.parse(raw) : {};
    } catch {
      this._map = {};
    }
    return this._map;
  },
  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this._map)); } catch {}
  },
  // 心形按钮点击用：切换收藏状态，返回切换后是不是已收藏
  toggle(compositeId) {
    if (!compositeId) return false;
    this.load();
    this._map = toggleFavorite(this._map, compositeId, Date.now());
    this._save();
    return isFavorited(this._map, compositeId);
  },
  // 单词本"移除"按钮用：明确删除，不是toggle(避免双击误操作又加回去)
  remove(compositeId) {
    if (!compositeId) return;
    this.load();
    if (!this._map[compositeId]) return;
    const next = { ...this._map };
    delete next[compositeId];
    this._map = next;
    this._save();
  },
  isFavorited(compositeId) {
    if (!compositeId) return false;
    this.load();
    return isFavorited(this._map, compositeId);
  },
  all() {
    this.load();
    return { ...this._map };
  }
};
