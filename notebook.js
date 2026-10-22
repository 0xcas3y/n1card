import { WordSearch, CATEGORY_LABELS, CATEGORY_TAG_COLOR } from './wordIndex.js';
import { Favorites } from './favorites.js';

function formatDate(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function showEmpty(listEl) {
  listEl.innerHTML = '<div class="nb-empty">还没有收藏的词</div>';
}

async function render() {
  const listEl = document.getElementById('nb-list');
  const favMap = Favorites.all();
  const compositeIds = Object.keys(favMap);

  if (compositeIds.length === 0) {
    showEmpty(listEl);
    return;
  }

  listEl.innerHTML = '<div class="nb-empty">加载中…</div>';

  let index;
  try {
    index = await WordSearch.ensureIndex();
  } catch {
    listEl.innerHTML = '<div class="nb-empty">加载失败，请刷新重试</div>';
    return;
  }

  const byCompositeId = new Map(index.map(item => [item.compositeId, item]));

  const rows = compositeIds
    .map(cid => ({ cid, addedAt: favMap[cid].addedAt, detail: byCompositeId.get(cid) }))
    .filter(r => r.detail)   // 理论上不该发生，但数据文件里查不到的跳过，不崩页面
    .sort((a, b) => b.addedAt - a.addedAt);

  if (rows.length === 0) {
    showEmpty(listEl);
    return;
  }

  listEl.innerHTML = rows.map(({ cid, addedAt, detail }) => {
    const tagColor = CATEGORY_TAG_COLOR[detail.category] || '#555';
    const tagLabel = `${detail.level.toUpperCase()} · ${CATEGORY_LABELS[detail.category] || detail.category}`;
    const url = `${detail.pageUrl}?session=general-review&ids=${detail.id}&mode=swipe`;
    return `
      <div class="nb-row" data-cid="${cid}" data-url="${url}">
        <span class="nb-tag" style="background:${tagColor}">${tagLabel}</span>
        <span class="nb-word">${detail.word}</span>
        <span class="nb-kana">${detail.word !== detail.kana ? detail.kana : ''}</span>
        <span class="nb-meaning">${detail.meaning}</span>
        <span class="nb-date">${formatDate(addedAt)}</span>
        <button class="nb-remove" data-cid="${cid}" title="移除" aria-label="移除">✕</button>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.nb-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.nb-remove')) return;
      window.location.href = row.dataset.url;
    });
  });
  listEl.querySelectorAll('.nb-remove').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Favorites.remove(btn.dataset.cid);
      const row = btn.closest('.nb-row');
      row.remove();
      if (!listEl.querySelector('.nb-row')) showEmpty(listEl);
    });
  });
}

render();
