const $ = (sel) => document.querySelector(sel);

document.addEventListener('DOMContentLoaded', () => {
  $('#topbar').textContent = 'N1 动词速记 · 启动中…';
  $('#cardstage').textContent = 'hello n1card';
});
