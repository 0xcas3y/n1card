// wordIndex.js — 跨等级/词性的全站词汇索引：纯逻辑，不碰DOM。
// 给 hub.js 的全局搜索和 notebook.js 的单词本共用，避免同样的"拉取26个
// 词汇文件、建索引"逻辑写两遍。
import { LEVEL_CATEGORY_FILES } from './plan.js';

export const CATEGORY_LABELS = { verb: '动词', noun: '名词', adj: '形容词', adverb: '副词', onomatope: '拟声词', compound: '复合动词' };
export const CATEGORY_TAG_COLOR = { verb: '#4FA896', noun: '#D97B5F', adj: '#8A6FB8', adverb: '#5A9AD4', onomatope: '#C75F87', compound: '#3E8A9E' };

// 词性 -> 对应单词页面的文件名后缀，跟 word-type-picker.html 里的映射保持一致
export function categoryPageUrl(level, category) {
  const suffix = category === 'verb' ? '' : `-${category}`;
  return `${level}${suffix}.html`;
}

export const WordSearch = {
  _index: null,       // 建好后缓存：[{level, category, id, compositeId, word, kana, meaning, pageUrl}, ...]
  _building: null,    // 建索引的 promise，防止用户多次触发重复拉取

  async ensureIndex() {
    if (this._index) return this._index;
    if (this._building) return this._building;
    this._building = (async () => {
      const jobs = [];
      for (const [level, registry] of Object.entries(LEVEL_CATEGORY_FILES)) {
        for (const [category, url] of Object.entries(registry)) {
          jobs.push(
            fetch(url).then(res => res.json()).then(data => ({ level, category, cards: data.cards || [] }))
          );
        }
      }
      const results = await Promise.all(jobs);
      const index = [];
      for (const { level, category, cards } of results) {
        const pageUrl = categoryPageUrl(level, category);
        for (const c of cards) {
          index.push({
            level, category, id: c.id, compositeId: `${level}:${category}:${c.id}`,
            word: c.word, kana: c.kana,
            meaning: (c.meanings && c.meanings[0]) || '',
            pageUrl
          });
        }
      }
      this._index = index;
      return index;
    })();
    return this._building;
  },

  search(query) {
    if (!this._index) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits = [];
    for (const item of this._index) {
      if (
        item.word.toLowerCase().includes(q) ||
        item.kana.toLowerCase().includes(q) ||
        item.meaning.toLowerCase().includes(q)
      ) {
        hits.push(item);
        if (hits.length >= 50) break;
      }
    }
    return hits;
  }
};
