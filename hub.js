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

export { Streak, PlanStore, CurrentLevel, CardCache, ProgressRO, todayStr, LEVELS };
