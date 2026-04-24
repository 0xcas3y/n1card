// hub.js — 首页（index.html）逻辑：PlanStore + DayView + RetrospectView + Calendar
import {
  computeQuota, computeLearnQueue, computeMorningPool, computeWeeklyDue,
  pruneOldCohorts, aggregateCheckIns, pickDistractors
} from './plan.js';

const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];
const CARD_URLS = {
  n1: 'data/cards.json',
  n2: 'data/cards-n2.json',
  n3: 'data/cards-n3.json',
  n4: 'data/cards-n4.json',
  n5: 'data/cards-n5.json'
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
  markCheckIn(dateStr, kind) {
    this.load();
    if (kind !== 'morning' && kind !== 'evening') return;
    if (!this._state.checkIns[dateStr]) this._state.checkIns[dateStr] = {};
    if (this._state.checkIns[dateStr][kind]) return;
    this._state.checkIns[dateStr][kind] = true;
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
  getStatus(dateStr) { this.load(); return aggregateCheckIns(this._state.checkIns, dateStr); },
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
    data.sessions[dateStr].learn = { status: 'done', completedAt: Date.now(), count: cardIds.length };
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

async function _sessionStatus(level, dateStr) {
  const plan = PlanStore.load(level);
  const cards = await CardCache.load(level);
  const prog = ProgressRO.get(level);
  const streakState = Streak.load();
  const quota = computeQuota(streakState.current || 0);
  const learnDone = plan.sessions[dateStr]?.learn?.status === 'done';
  const morningDone = plan.sessions[dateStr]?.morning?.status === 'done';
  const weeklyDone = plan.sessions[dateStr]?.weekly?.status === 'done';
  const learnQueue = learnDone ? [] : computeLearnQueue(cards, prog, quota);
  const morningPool = computeMorningPool(plan.cohorts, prog, dateStr);
  const weeklyDueIds = computeWeeklyDue(prog, Date.now());
  return { plan, cards, prog, quota, learnDone, morningDone, weeklyDone, learnQueue, morningPool, weeklyDueIds };
}

const DayView = {
  async render(dateStr) {
    document.querySelector('#hub-main').style.display = 'none';
    document.querySelector('#retro-view').style.display = 'none';
    const el = document.querySelector('#day-view');
    el.style.display = 'block';

    const level = CurrentLevel.get();
    const streakCurrent = Streak.load().current || 0;
    const stat = await _sessionStatus(level, dateStr);

    const rulesSeen = !!localStorage.getItem(RULES_SEEN_KEY);
    const [y, m, d] = dateStr.split('-').map(Number);
    const weekday = ['日','一','二','三','四','五','六'][new Date(y, m-1, d).getDay()];

    const morningStat = Streak.getCheckIn(dateStr).morning ? '✓' : '○';
    const eveningStat = Streak.getCheckIn(dateStr).evening ? '✓' : '○';

    el.innerHTML = `
      <div class="day-head">
        <button class="day-back" id="day-back">← 返回</button>
        <div class="day-date">📅 ${m}月${d}日 · 周${weekday}</div>
        <div class="day-streak">🔥 ${streakCurrent} 天</div>
      </div>

      <div class="day-checks">
        打卡： 🌙 晚 ${eveningStat}  ·  🌅 早 ${morningStat}
      </div>

      <details class="day-rules" ${rulesSeen ? '' : 'open'}>
        <summary>规则</summary>
        <ul>
          <li>🌙 晚打卡 = 完成「学新」（滑卡）</li>
          <li>🌅 早打卡 = 完成「早复习」（四选一）</li>
          <li>连续 7 天 → 60 词/天；14 天 → 90 词/天</li>
          <li>答对 2 次升「掌握」，答错立刻回「不熟」</li>
          <li>「掌握」每 7 天来一次周复习</li>
        </ul>
      </details>

      <div class="day-level">
        当前等级： <span class="day-level-val">${level.toUpperCase()}</span> · 配额 ${stat.quota} 词
      </div>

      <div class="day-sessions">
        ${this._renderMorningCard(stat, dateStr)}
        ${this._renderLearnCard(stat, level, dateStr)}
        ${this._renderWeeklyCard(stat, level, dateStr)}
      </div>

      <div class="day-level-switch">
        <label>切换等级：</label>
        <select id="day-level-sel">
          ${LEVELS.map(l => `<option value="${l}" ${l===level?'selected':''}>${l.toUpperCase()}</option>`).join('')}
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
    this._attachSessionHandlers(el, stat, level, dateStr);
  },

  _renderMorningCard(stat, dateStr) {
    if (dateStr !== todayStr()) return '';
    const n = stat.morningPool.length;
    const done = stat.morningDone;
    const label = n === 0 ? '今日无早复习（自动 ✓）' : (done ? `✅ 已完成` : `昨+前日 不熟 · ${n} 题`);
    const btn = done ? '' : (n === 0 ? `<button class="ds-btn" data-action="auto-morning">标记完成</button>` : `<button class="ds-btn" data-action="morning">开始</button>`);
    return `<div class="day-session-card"><div class="dsc-icon">🌅</div><div class="dsc-body"><div class="dsc-title">早复习</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },
  _renderLearnCard(stat, level, dateStr) {
    if (dateStr !== todayStr()) return '';
    const n = stat.learnQueue.length;
    const done = stat.learnDone;
    const label = done ? `✅ 已完成` : (n === 0 ? `无未学过词（自动 ✓）` : `0 / ${n}`);
    const btn = done ? '' : (n === 0 ? `<button class="ds-btn" data-action="auto-evening">标记完成</button>` : `<button class="ds-btn" data-action="learn">开始</button>`);
    return `<div class="day-session-card"><div class="dsc-icon">🌙</div><div class="dsc-body"><div class="dsc-title">学新</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },
  _renderWeeklyCard(stat, level, dateStr) {
    if (dateStr !== todayStr()) return '';
    const n = stat.weeklyDueIds.length;
    if (n === 0) return '';
    const btn = stat.weeklyDone ? '' : `<button class="ds-btn" data-action="weekly">开始</button>`;
    const label = stat.weeklyDone ? `✅ 已完成` : `${n} 词到期`;
    return `<div class="day-session-card"><div class="dsc-icon">📆</div><div class="dsc-body"><div class="dsc-title">周复习</div><div class="dsc-sub">${label}</div></div>${btn}</div>`;
  },

  _attachSessionHandlers(el, stat, level, dateStr) {
    el.querySelectorAll('.ds-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        switch (action) {
          case 'morning': return SessionLauncher.launchMorning(level, dateStr, stat);
          case 'learn': return SessionLauncher.launchLearn(level, dateStr, stat);
          case 'weekly': return SessionLauncher.launchWeekly(level, dateStr, stat);
          case 'auto-morning':
            PlanStore.completeMorning(level, dateStr, { correct: 0, total: 0 });
            Streak.markCheckIn(dateStr, 'morning');
            this.render(dateStr);
            return;
          case 'auto-evening':
            PlanStore.completeLearn(level, dateStr, []);
            Streak.markCheckIn(dateStr, 'evening');
            this.render(dateStr);
            return;
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

const SessionLauncher = {
  launchLearn(level, dateStr, stat) {
    const ids = stat.learnQueue.map(c => c.id).join(',');
    window.location.href = `/${level}.html?session=learn&ids=${ids}`;
  },
  launchMorning(level, dateStr, stat) {
    const ids = stat.morningPool.join(',');
    window.location.href = `/${level}.html?session=review&kind=morning&ids=${ids}`;
  },
  launchWeekly(level, dateStr, stat) {
    const ids = stat.weeklyDueIds.join(',');
    window.location.href = `/${level}.html?session=review&kind=weekly&ids=${ids}`;
  }
};

// 渲染首页 streak-box + streak-cal + 月历（升级为三态 + 可点击）
function renderHubBody() {
  const state = Streak.load();
  const dates = new Set(state.dates || []);
  if ((state.longest || 0) === 0 && dates.size === 0) return;

  const box = document.getElementById('streak-box');
  if (box) {
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
      const status = Streak.getStatus(ds);
      if (status === 'gold') cls.push('gold');
      else if (status === 'half') cls.push('checked');
      if (ds === todayKey) cls.push('today');
      const isPast = ds < todayKey;
      const clickable = (ds === todayKey) || (isPast && (status === 'gold' || status === 'half'));
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

// RetrospectView 占位（Task 13 填充）
const RetrospectView = {
  render(dateStr) { alert(`回顾 ${dateStr} TODO Task 13`); }
};

// 启动：页面加载时渲染首页
document.addEventListener('DOMContentLoaded', () => {
  renderHubBody();

  // 处理 learn_completed 回流
  const params = new URLSearchParams(location.search);
  if (params.get('learn_completed') === '1') {
    const level = params.get('level') || 'n1';
    const ids = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(Boolean);
    const dateStr = todayStr();
    PlanStore.completeLearn(level, dateStr, ids);
    Streak.markCheckIn(dateStr, 'evening');
    // 清 URL 参数后开 DayView
    history.replaceState({}, '', '/');
    DayView.render(dateStr);
  }
  if (params.get('review_completed') === '1') {
    const level = params.get('level') || 'n1';
    const kind = params.get('kind') || 'morning';
    const total = parseInt(params.get('total') || '0', 10);
    const correct = parseInt(params.get('correct') || '0', 10);
    const dateStr = todayStr();
    if (kind === 'weekly') {
      PlanStore.completeWeekly(level, dateStr, { correct, total });
    } else {
      PlanStore.completeMorning(level, dateStr, { correct, total });
      Streak.markCheckIn(dateStr, 'morning');
    }
    history.replaceState({}, '', '/');
    DayView.render(dateStr);
    return;
  }
});

export { renderHubBody, RetrospectView, DayView, SessionLauncher, Streak, PlanStore, CurrentLevel, CardCache, ProgressRO, todayStr, LEVELS };
