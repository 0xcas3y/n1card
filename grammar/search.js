// grammar/search.js — 跨等级文法搜索，首页搜索框和各等级页网格搜索的
// "其他等级也有相关结果"区块共用这一套逻辑。不是ES module（跟文法这几个
// 页面的写法保持一致，用全局变量GrammarSearch），普通<script>标签加载即可。
//
// 数据来源：grammar/data/examples-{level}.json——这份文件本来就是给首页
// "随机播放例句"用的，字段(id/t/m/mz/e/eh/z/ex)刚好够搜索和展示结果用，
// 不需要另外生成索引文件，也完全不碰各等级页里那个几千行的内嵌大数组。
const GrammarSearch = (() => {
  const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];
  const LEVEL_LABEL = { n1: 'N1', n2: 'N2', n3: 'N3', n4: 'N4', n5: 'N5' };

  let indexPromise = null;
  function ensureIndex() {
    if (!indexPromise) {
      indexPromise = Promise.all(
        LEVELS.map(lv =>
          fetch(`data/examples-${lv}.json`)
            .then(r => r.json())
            .then(list => list.map(g => ({ ...g, level: lv })))
        )
      ).then(arrays => arrays.flat());
    }
    return indexPromise;
  }

  // 跟各等级页_matchS()用的是同一套匹配字段(t/m/mz/e/z/ex)，确保首页搜到的
  // 结果点进去之后，落地页用相同query筛选时一定也能筛出同一条
  function isMatch(g, q) {
    const s = q.toLowerCase();
    if (
      g.t.toLowerCase().includes(s) ||
      g.m.toLowerCase().includes(s) ||
      g.mz.includes(s) ||
      g.e.toLowerCase().includes(s) ||
      (g.z && g.z.includes(s))
    ) return true;
    return (g.ex || []).some(x => (x.j && x.j.toLowerCase().includes(s)) || (x.z && x.z.includes(s)));
  }

  async function search(query, { excludeLevel, limit } = {}) {
    const q = (query || '').trim();
    if (!q) return [];
    const all = await ensureIndex();
    const hits = all.filter(g => (!excludeLevel || g.level !== excludeLevel) && isMatch(g, q));
    return typeof limit === 'number' ? hits.slice(0, limit) : hits;
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // 跳转时带上g.t(该语法点的完整pattern文本)而不是用户输入的原始关键词，
  // 这样落地页的_matchS()筛出来的必定只有这一条(或共享同一子串的极少数)，
  // 相当于在没有真正锚点/深链的情况下模拟"精确跳转到这一条"的效果
  function resultRowHTML(g) {
    const lv = g.level;
    return `
      <a class="gs-row" href="${lv}.html?q=${encodeURIComponent(g.t)}">
        <span class="gs-lv gs-lv-${lv}">${LEVEL_LABEL[lv]}</span>
        <span class="gs-pattern">${escapeHTML(g.t)}</span>
        <span class="gs-meaning">${escapeHTML(g.mz)}</span>
      </a>
    `;
  }

  return { search, resultRowHTML, LEVEL_LABEL };
})();
