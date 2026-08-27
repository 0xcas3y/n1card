// hub.js — 首页（index.html）逻辑：PlanStore + DayView + RetrospectView + Calendar
import {
  computeBatchesAllowed, pruneOldCohorts,
  LEVEL_CATEGORY_FILES, pickRecommendedCategory, computeNewWordQueue, computeDueIds
} from './plan.js';

const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5', 'ono'];
const CARD_URLS = {
  n1: 'data/cards.json',
  n2: 'data/cards-n2.json',
  n3: 'data/cards-n3.json',
  n4: 'data/cards-n4.json',
  n5: 'data/cards-n5.json',
  ono: 'onomatope/data/cards.json'
};
const LEVEL_LABELS = {
  n1: 'N1', n2: 'N2', n3: 'N3', n4: 'N4', n5: 'N5',
  ono: 'オノマトペ'
};

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

const Streak = {
  key: 'n1card:streak',
  _state: null,
  load() {
    if (this._state) return this._state;
    try { this._state = JSON.parse(localStorage.getItem(this.key)) || {}; } catch { this._state = {}; }
    if (!this._state.checkIns) this._state.checkIns = {};
    if (!Array.isArray(this._state.dates)) this._state.dates = [];
    return this._state;
  },
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this._state)); } catch {} },
  markCheckIn(dateStr) {
    this.load();
    if (this._state.checkIns[dateStr]?.done) return;
    this._state.checkIns[dateStr] = { done: true };
    if (!this._state.dates.includes(dateStr)) {
      this._state.dates.push(dateStr);
      if (this._state.lastDate) {
        const last = new Date(this._state.lastDate);
        last.setDate(last.getDate() + 1);
        const pad = n => String(n).padStart(2, '0');
        const expected = `${last.getFullYear()}-${pad(last.getMonth()+1)}-${pad(last.getDate())}`;
        this._state.current = (expected === dateStr) ? ((this._state.current || 0) + 1) : 1;
      } else {
        this._state.current = 1;
      }
      if ((this._state.current || 0) > (this._state.longest || 0)) this._state.longest = this._state.current;
      this._state.total = (this._state.total || 0) + 1;
      this._state.lastDate = dateStr;
    }
    this._save();
  },
  getStatus(dateStr) { this.load(); return !!this._state.checkIns[dateStr]?.done; },
  getCheckIn(dateStr) { this.load(); return this._state.checkIns[dateStr] || {}; }
};

const PlanStore = {
  _cache: {},
  key(level) { return `n1card:plan:${level}`; },
  load(level) {
    if (this._cache[level]) return this._cache[level];
    let data = { cohorts: {}, sessions: {}, lastWeeklyRun: 0 };
    try {
      const raw = localStorage.getItem(this.key(level));
      if (raw) data = { ...data, ...JSON.parse(raw) };
    } catch {}
    data.cohorts = pruneOldCohorts(data.cohorts || {}, todayStr());
    this._cache[level] = data;
    return data;
  },
  save(level) {
    const data = this._cache[level];
    if (!data) return;
    try { localStorage.setItem(this.key(level), JSON.stringify(data)); } catch {}
  },
  completeLearn(level, dateStr, cardIds) {
    const data = this.load(level);
    if (!data.cohorts[dateStr]) {
      data.cohorts[dateStr] = { cardIds: [...cardIds], completedAt: Date.now() };
    } else {
      const merged = new Set([...data.cohorts[dateStr].cardIds, ...cardIds]);
      data.cohorts[dateStr] = { cardIds: [...merged], completedAt: Date.now() };
    }
    if (!data.sessions[dateStr]) data.sessions[dateStr] = {};
    const prevBatchCount = data.sessions[dateStr].learn?.batchCount || 0;
    data.sessions[dateStr].learn = {
      status: 'done',
      completedAt: Date.now(),
      count: data.cohorts[dateStr].cardIds.length,
      batchCount: prevBatchCount + 1
    };
    this.save(level);
  },
  completeMorning(level, dateStr, stats) {
    const data = this.load(level);
    if (!data.sessions[dateStr]) data.sessions[dateStr] = {};
    data.sessions[dateStr].morning = { status: 'done', completedAt: Date.now(), ...stats };
    this.save(level);
  },
  completeWeekly(level, dateStr, stats) {
    const data = this.load(level);
    if (!data.sessions[dateStr]) data.sessions[dateStr] = {};
    data.sessions[dateStr].weekly = { status: 'done', completedAt: Date.now(), ...stats };
    data.lastWeeklyRun = Date.now();
    this.save(level);
  }
};

const CurrentLevel = {
  key: 'n1card:current-level',
  get() { try { return localStorage.getItem(this.key) || 'n1'; } catch { return 'n1'; } },
  set(v) { try { localStorage.setItem(this.key, v); } catch {} }
};

// 卡片数据缓存（按需加载）
const CardCache = {
  _map: {},
  async load(level) {
    if (this._map[level]) return this._map[level];
    const res = await fetch(CARD_URLS[level]);
    const j = await res.json();
    this._map[level] = j.cards;
    return j.cards;
  }
};

// Progress 读取（只读；写入由 QuizMode 在各等级页做）
const ProgressRO = {
  get(level) {
    try { return JSON.parse(localStorage.getItem(`n1card:progress:${level}`)) || {}; }
    catch { return {}; }
  }
};

const RULES_SEEN_KEY = 'n1card:rules-seen';

async function _todaySummary(level) {
  const registry = LEVEL_CATEGORY_FILES[level];
  if (!registry) return { newCount: 0, dueCount: 0, category: null };
  let progress2 = {};
  try { progress2 = JSON.parse(localStorage.getItem(`n1card:progress2:${level}`)) || {}; } catch {}
  const entries = await Promise.all(
    Object.entries(registry).map(async ([category, url]) => {
      const res = await fetch(url);
      const data = await res.json();
      return { category, cards: data.cards };
    })
  );
  // 只需要知道"有没有到期/有没有新词"和数量，不需要完整合并对象（跟 app.js 的 CardPool 逻辑重复但各自独立维护，避免 hub.js 依赖 app.js 内部对象）
  const pool = [];
  for (const { category, cards } of entries) {
    for (const c of cards) pool.push({ category, origId: c.id, compositeId: `${level}:${category}:${c.id}` });
  }
  const streakState = Streak.load();
  const batchesAllowed = computeBatchesAllowed(streakState.total || 0);

  // 今日批次固定化：如果今天已经选定过一批新词(today.html里存的)，数量要按那批"还没做完的"算，
  // 不能重新计算出一个包含"自动补新词"的数字，跟实际进去看到的对不上
  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  let stored = null;
  try {
    const raw = localStorage.getItem(`n1card:todaybatch:${level}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.date === dateStr) stored = parsed;
    }
  } catch {}

  let category, newCount;
  if (stored) {
    category = stored.category;
    newCount = stored.newIds.filter(cid => !progress2[cid]).length;
  } else {
    category = pickRecommendedCategory(pool, progress2) || 'verb';
    newCount = computeNewWordQueue(pool, progress2, batchesAllowed * 60, category).length;
  }
  const dueCount = computeDueIds(progress2, Date.now()).length;
  return { newCount, dueCount, category, batchesAllowed };
}

const DayView = {
  async render(dateStr) {
    document.querySelector('#hub-main').style.display = 'none';
    document.querySelector('#retro-view').style.display = 'none';
    const el = document.querySelector('#day-view');
    el.style.display = 'block';

    const level = CurrentLevel.get();
    const streakCurrent = Streak.load().current || 0;

    const rulesSeen = !!localStorage.getItem(RULES_SEEN_KEY);
    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = ['日','一','二','三','四','五','六'][new Date(y, m-1, d).getDay()];

    const done = Streak.getCheckIn(dateStr).done;

    el.innerHTML = `
      <div class="day-head">
        <button class="day-back" id="day-back">← 返回</button>
        <div class="day-date">📅 ${m}月${d}日 · 周${weekday}</div>
        <div class="day-streak">🔥 ${streakCurrent} 天</div>
      </div>

      <div class="day-checks">
        今日打卡：${done ? '✓ 已完成' : '○ 未完成'}
      </div>

      <details class="day-rules" ${rulesSeen ? '' : 'open'}>
        <summary>规则</summary>
        <ul>
          <li>🗂️ 今日滑卡 = 新词 + 到期复习混在一起滑，滑卡本身即判定</li>
          <li>右滑 = 记得（新词进入间隔阶梯，到期词推进一档）；左滑 = 不熟（新词稍后重考，到期词打回第1天档）</li>
          <li>滑完这批即当天打卡，随时可以开始，没有固定时间窗</li>
          <li>新词按 动词→名词→复合动词→形容词→副词→拟声词 推荐顺序，可手动切换词性</li>
          <li>🧠 回忆模式随时可用，纯巩固不影响进度</li>
        </ul>
      </details>

      <div class="day-level">
        当前等级： <span class="day-level-val">${LEVEL_LABELS[level] || level.toUpperCase()}</span>
      </div>

      <div class="day-sessions">
        ${await this._renderTodayCard(dateStr, level)}
      </div>

      <div class="day-level-switch">
        <label>切换等级：</label>
        <select id="day-level-sel">
          ${LEVELS.map(l => `<option value="${l}" ${l===level?'selected':''}>${LEVEL_LABELS[l] || l.toUpperCase()}</option>`).join('')}
        </select>
      </div>
    `;

    el.querySelector('#day-back').addEventListener('click', () => this.exit());
    const details = el.querySelector('.day-rules');
    details.addEventListener('toggle', () => { if (!details.open) localStorage.setItem(RULES_SEEN_KEY, '1'); });
    el.querySelector('#day-level-sel').addEventListener('change', (e) => {
      CurrentLevel.set(e.target.value);
      this.render(dateStr);
    });
    this._attachSessionHandlers(el, level, dateStr);
  },

  async _renderTodayCard(dateStr, level) {
    if (dateStr !== todayStr()) return '';
    const summary = await _todaySummary(level);
    const total = summary.newCount + summary.dueCount;
    const done = Streak.getCheckIn(dateStr).done;
    if (done) {
      return `<div class="day-session-card"><div class="dsc-icon">✅</div><div class="dsc-body"><div class="dsc-title">今日滑卡</div><div class="dsc-sub">已完成</div></div></div>`;
    }
    if (total === 0) {
      return `<div class="day-session-card"><div class="dsc-icon">🎉</div><div class="dsc-body"><div class="dsc-title">今日滑卡</div><div class="dsc-sub">暂无新词/到期词</div></div><button class="ds-btn" data-action="auto-today">标记完成</button></div>`;
    }
    return `<div class="day-session-card">
      <div class="dsc-icon">🗂️</div>
      <div class="dsc-body"><div class="dsc-title">今日滑卡</div><div class="dsc-sub">新词 ${summary.newCount} · 到期复习 ${summary.dueCount}</div></div>
      <button class="ds-btn" data-action="today">开始</button>
    </div>`;
  },

  _attachSessionHandlers(el, level, dateStr) {
    el.querySelectorAll('.ds-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (action === 'today') {
          window.location.href = `/today.html?level=${level}&session=today`;
        } else if (action === 'auto-today') {
          Streak.markCheckIn(dateStr);
          this.render(dateStr);
        }
      });
    });
  },

  exit() {
    document.querySelector('#day-view').style.display = 'none';
    document.querySelector('#retro-view').style.display = 'none';
    document.querySelector('#hub-main').style.display = 'block';
    renderHubBody();
  }
};

// 渲染首页 streak-box + streak-cal + 月历（升级为三态 + 可点击）
function renderHubBody() {
  const state = Streak.load();
  const hasHistory = (state.longest || 0) > 0 || (state.dates || []).length > 0;

  const box = document.getElementById('streak-box');
  if (box && hasHistory) {
    box.style.display = 'flex';
    const today = todayStr();
    const current = state.current || 0;
    const longest = state.longest || 0;
    const total = state.total || 0;
    const todayFlag = state.lastDate === today ? '✅' : '';
    box.innerHTML = `
      <div class="item"><div class="num">🔥 ${current}</div><div class="lbl">连续 ${todayFlag}</div></div>
      <div class="item"><div class="num">${longest}</div><div class="lbl">最长</div></div>
      <div class="item"><div class="num">${total}</div><div class="lbl">累计天数</div></div>
    `;
  }

  const cal = document.getElementById('streak-cal');
  if (!cal) return;
  cal.style.display = 'block';
  let viewY = new Date().getFullYear();
  let viewM = new Date().getMonth();
  const pad = n => String(n).padStart(2, '0');
  const fmt = (y, m, d) => `${y}-${pad(m+1)}-${pad(d)}`;
  const todayKey = todayStr();

  const render = () => {
    document.getElementById('cal-month').textContent = `${viewY}年${viewM+1}月`;
    const firstWd = new Date(viewY, viewM, 1).getDay();
    const daysInMonth = new Date(viewY, viewM+1, 0).getDate();
    let html = '';
    for (let i = 0; i < firstWd; i++) html += '<div class="cal-day empty"></div>';
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = fmt(viewY, viewM, d);
      const cls = ['cal-day'];
      const done = Streak.getStatus(ds);
      if (done) cls.push('checked');
      if (ds === todayKey) cls.push('today');
      const isPast = ds < todayKey;
      const clickable = (ds === todayKey) || (isPast && done);
      if (clickable) cls.push('clickable');
      html += `<div class="${cls.join(' ')}" data-date="${ds}">${d}</div>`;
    }
    document.getElementById('cal-grid').innerHTML = html;
    document.getElementById('cal-grid').querySelectorAll('.cal-day.clickable').forEach(el => {
      el.addEventListener('click', () => {
        const ds = el.dataset.date;
        if (ds === todayKey) DayView.render(ds);
        else RetrospectView.render(ds);
      });
    });
  };
  document.getElementById('cal-prev').onclick = () => { viewM--; if (viewM < 0) { viewM = 11; viewY--; } render(); };
  document.getElementById('cal-next').onclick = () => { viewM++; if (viewM > 11) { viewM = 0; viewY++; } render(); };
  render();
}
window.renderHubBody = renderHubBody;

// RetrospectView（Task 13）
const RetrospectView = {
  async render(dateStr) {
    document.querySelector('#hub-main').style.display = 'none';
    document.querySelector('#day-view').style.display = 'none';
    const el = document.querySelector('#retro-view');
    el.style.display = 'block';

    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = ['日','一','二','三','四','五','六'][new Date(y, m-1, d).getDay()];
    const done = Streak.getStatus(dateStr);

    el.innerHTML = `
      <div class="day-head">
        <button class="day-back" id="retro-back">← 返回</button>
        <div class="day-date">📅 ${m}月${d}日 · 周${weekday}</div>
        <div class="day-streak">${done ? '✅' : '—'}</div>
      </div>
      <div class="retro-empty">${done ? '这一天完成了今日滑卡' : '这一天没有打卡记录'}</div>
    `;
    el.querySelector('#retro-back').addEventListener('click', () => {
      el.style.display = 'none';
      document.querySelector('#hub-main').style.display = 'block';
      renderHubBody();
    });
  }
};

// 启动：页面加载时渲染首页
document.addEventListener('DOMContentLoaded', () => {
  renderHubBody();

  const params = new URLSearchParams(location.search);
  if (params.get('today_completed') === '1') {
    const dateStr = todayStr();
    Streak.markCheckIn(dateStr);
    history.replaceState({}, '', '/');
    DayView.render(dateStr);
    return;
  }
});

export { renderHubBody, RetrospectView, DayView, Streak, PlanStore, CurrentLevel, CardCache, ProgressRO, todayStr, LEVELS };
