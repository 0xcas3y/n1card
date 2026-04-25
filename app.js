import { aggregateCheckIns, pickDistractors } from './plan.js';

const COLORS = ['blue', 'green', 'purple', 'coral', 'teal', 'pink'];

// 词性归一化显示（subagent 给的数据可能是 "他"/"他动词"/"他動詞" 三种之一）
const _normTrans = (t) => {
  if (!t) return '';
  const s = String(t);
  if (s.startsWith('他')) return '他动词';
  if (s.startsWith('自')) return '自动词';
  return s;
};

// 级别配置从 HTML 注入，默认 N1（向后兼容）
const LEVEL = window.LEVEL_NAME || 'N1';
const CARD_DATA_URL = window.CARD_DATA_URL || 'data/cards.json';
const LEVEL_KEY = LEVEL.toLowerCase();  // n1 / n5 / ...

const DataStore = {
  cards: [],
  overrides: {},
  loadOverrides() {
    try {
      const o = localStorage.getItem(`n1card:overrides:${LEVEL_KEY}`);
      if (o) this.overrides = JSON.parse(o);
    } catch {}
  },
  _saveOverrides() {
    try { localStorage.setItem(`n1card:overrides:${LEVEL_KEY}`, JSON.stringify(this.overrides)); }
    catch {}
  },
  applyOverride(id, patch) {
    this.overrides[id] = { ...this.overrides[id], ...patch };
    const i = this.cards.findIndex(c => c.id === id);
    if (i >= 0) Object.assign(this.cards[i], patch);
    this._saveOverrides();
  },
  exportOverrides() {
    return { version: 1, overrides: this.overrides };
  },
  async load() {
    const res = await fetch(CARD_DATA_URL);
    if (!res.ok) throw new Error(`${CARD_DATA_URL} fetch failed: ${res.status}`);
    const data = await res.json();
    this.cards = data.cards;
    this.loadOverrides();
    for (const id in this.overrides) {
      const i = this.cards.findIndex(c => c.id === parseInt(id, 10));
      if (i >= 0) this.cards[i] = { ...this.cards[i], ...this.overrides[id] };
    }
    return this.cards;
  },
  allCards() { return this.cards; },
  getCard(id) { return this.cards.find(c => c.id === id); }
};

const Progress = {
  key: `n1card:progress:${LEVEL_KEY}`,
  settingsKey: `n1card:settings:${LEVEL_KEY}`,
  _progress: {},
  _settings: { filter: 'all', ttsRate: 0.9, lastCardId: null },
  _available: true,

  load() {
    try {
      const p = localStorage.getItem(this.key);
      if (p) this._progress = JSON.parse(p);
      const s = localStorage.getItem(this.settingsKey);
      if (s) this._settings = { ...this._settings, ...JSON.parse(s) };
    } catch (err) {
      console.warn('localStorage unavailable:', err);
      this._available = false;
    }
    // 懒回填：已经标了 known 但没有 masteredAt 的，回填为 now
    // 让老用户的掌握词在 7 天后进入周复习
    const now = Date.now();
    let changed = false;
    for (const id in this._progress) {
      const p = this._progress[id];
      if (p.status === 'known' && !p.masteredAt) {
        p.masteredAt = now;
        changed = true;
      }
    }
    if (changed) this._save();
  },
  _save() {
    if (!this._available) return;
    try {
      localStorage.setItem(this.key, JSON.stringify(this._progress));
      localStorage.setItem(this.settingsKey, JSON.stringify(this._settings));
    } catch (err) {
      this._available = false;
    }
  },
  mark(id, status) {
    // 滑动：终态覆盖
    const now = Date.now();
    const entry = this._progress[id] || {};
    entry.status = status;
    entry.lastSeen = now;
    entry.correctStreak = 0;  // 滑动清零 quiz streak
    if (status === 'known') {
      entry.masteredAt = now;
    } else if (status === 'unknown') {
      entry.masteredAt = undefined;
    }
    if (entry.firstLearnedAt === undefined) entry.firstLearnedAt = now;
    this._progress[id] = entry;
    this._save();
  },
  markQuiz(id, correct) {
    const now = Date.now();
    const entry = this._progress[id] || { status: 'unknown', lastSeen: now };
    entry.lastSeen = now;
    entry.quizSeenCount = (entry.quizSeenCount || 0) + 1;

    if (correct) {
      if (entry.status === 'known') {
        entry.lastWeeklyReviewAt = now;  // 周复习续期
      } else {
        // 不熟答对：连对 +1，达到 2 升掌握
        entry.correctStreak = (entry.correctStreak || 0) + 1;
        if (entry.correctStreak >= 2) {
          entry.status = 'known';
          entry.masteredAt = now;
          entry.correctStreak = 0;
        }
      }
    } else {
      if (entry.status === 'known') {
        entry.status = 'unknown';
        entry.masteredAt = undefined;
      }
      entry.correctStreak = 0;
    }
    this._progress[id] = entry;
    this._save();
  },
  getStatus(id) { return this._progress[id]?.status || null; },
  getEntry(id) { return this._progress[id]; },
  all() { return this._progress; },
  stats() {
    const s = { known: 0, unknown: 0, unseen: 0 };
    for (const k in this._progress) {
      if (this._progress[k].status === 'known') s.known++;
      else if (this._progress[k].status === 'unknown') s.unknown++;
    }
    return s;
  },
  setLastCardId(id) { this._settings.lastCardId = id; this._save(); },
  getLastCardId() { return this._settings.lastCardId; },
  getFilter() { return this._settings.filter; },
  setFilter(f) { this._settings.filter = f; this._save(); },
  getTTSRate() { return this._settings.ttsRate; },
  setTTSRate(r) { this._settings.ttsRate = r; this._save(); },
  reset() { this._progress = {}; this._settings.lastCardId = null; this._save(); },
  isAvailable() { return this._available; }
};

// 打卡：全局（跨 level 共享），记录哪些日期用户真实完成了 session
const Streak = {
  key: 'n1card:streak',
  _state: { lastDate: null, current: 0, longest: 0, total: 0, dates: [], checkIns: {} },
  _loaded: false,

  _dateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  },
  load() {
    if (this._loaded) return;
    try {
      const s = localStorage.getItem(this.key);
      if (s) this._state = { ...this._state, ...JSON.parse(s) };
    } catch {}
    if (!Array.isArray(this._state.dates)) this._state.dates = this._state.lastDate ? [this._state.lastDate] : [];
    if (!this._state.checkIns || typeof this._state.checkIns !== 'object') this._state.checkIns = {};
    this._loaded = true;
  },
  _save() {
    try { localStorage.setItem(this.key, JSON.stringify(this._state)); } catch {}
  },
  tick() {
    this.load();
    const today = this._dateStr(new Date());
    if (this._state.lastDate === today) return false;  // 今天已打过卡

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = this._dateStr(yesterday);

    if (this._state.lastDate === yStr) {
      this._state.current = (this._state.current || 0) + 1;
    } else {
      this._state.current = 1;
    }
    if (this._state.current > (this._state.longest || 0)) this._state.longest = this._state.current;
    this._state.total = (this._state.total || 0) + 1;
    this._state.lastDate = today;
    if (!this._state.dates.includes(today)) this._state.dates.push(today);
    this._save();
    return true;  // 刚完成今日打卡
  },

  markCheckIn(dateStr, kind) {
    this.load();
    if (kind !== 'morning' && kind !== 'evening') return;
    if (!this._state.checkIns[dateStr]) this._state.checkIns[dateStr] = {};
    if (this._state.checkIns[dateStr][kind]) return;  // idempotent
    this._state.checkIns[dateStr][kind] = true;

    // 维护 dates、current、longest、total、lastDate
    if (!this._state.dates.includes(dateStr)) {
      this._state.dates.push(dateStr);
      // 判断是否与 lastDate 连续
      if (this._state.lastDate) {
        const last = new Date(this._state.lastDate);
        last.setDate(last.getDate() + 1);
        const expected = this._dateStr(last);
        this._state.current = (expected === dateStr) ? (this._state.current + 1) : 1;
      } else {
        this._state.current = 1;
      }
      if (this._state.current > this._state.longest) this._state.longest = this._state.current;
      this._state.total += 1;
      this._state.lastDate = dateStr;
    }
    this._save();
  },

  getStatus(dateStr) { this.load(); return aggregateCheckIns(this._state.checkIns, dateStr); },
  getCheckIn(dateStr) { this.load(); return this._state.checkIns[dateStr] || {}; },
  isGold(dateStr) { return this.getStatus(dateStr) === 'gold'; },

  getCurrent() {
    this.load();
    const today = this._dateStr(new Date());
    if (this._state.lastDate === today) return this._state.current;
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (this._state.lastDate === this._dateStr(y)) return this._state.current;
    return 0;
  },
  getLongest() { this.load(); return this._state.longest || 0; },
  getTotal() { this.load(); return this._state.total || 0; },
  getLastDate() { this.load(); return this._state.lastDate; },
  getAllDates() { this.load(); return [...this._state.dates]; }
};

const TTSEngine = {
  _supported: 'speechSynthesis' in window,
  _jaVoice: null,
  _errorCount: 0,

  init() {
    if (!this._supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this._jaVoice = voices.find(v => v.lang.startsWith('ja')) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  },
  isSupported() { return this._supported; },
  hasJapanese() { return this._jaVoice !== null; },

  speak(text, { rate = 0.9, onEnd = null, onStart = null } = {}) {
    if (!this._supported) { onEnd?.(); return Promise.resolve(); }
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      if (this._jaVoice) u.voice = this._jaVoice;
      u.rate = rate;
      u.onstart = () => onStart?.();
      u.onend = () => { onEnd?.(); resolve(); };
      u.onerror = () => {
        this._errorCount++;
        if (this._errorCount === 3) {
          TopBar.addWarning('TTS 多次失败');
          TopBar.render();
        }
        onEnd?.(); resolve();
      };
      speechSynthesis.speak(u);
    });
  },
  cancel() {
    if (this._supported) speechSynthesis.cancel();
  }
};

const Gestures = {
  attach(el, { onTap, onDoubleTap, onSwipe }) {
    let tapTimer = null;
    let touchStart = null;

    const clearTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; } };

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sentence-row')) { touchStart = null; return; }
      touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointercancel', () => { touchStart = null; clearTap(); });
    el.addEventListener('pointerup', (e) => {
      if (e.target.closest('.sentence-row')) { touchStart = null; clearTap(); return; }
      if (!touchStart) return;
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      const dt = performance.now() - touchStart.t;
      const speed = Math.hypot(dx, dy) / dt;

      // 滑动判定
      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.5 && speed > 0.3) {
        clearTap();
        onSwipe?.(dy < 0 ? 'up' : 'down');
        touchStart = null;
        return;
      }
      // 几乎不动 → 点击
      if (Math.hypot(dx, dy) < 10) {
        if (tapTimer) {
          clearTap();
          onDoubleTap?.(e);
        } else {
          tapTimer = setTimeout(() => {
            tapTimer = null;
            onTap?.(e);
          }, 200);
        }
      }
      touchStart = null;
    });
  }
};

const CardView = {
  randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; },
  renderFront(card, color) {
    const el = document.createElement('div');
    el.className = `flash-card color-${color}`;
    el.innerHTML = `
      <div class="card-id">${card.id}</div>
      <div class="front-center"><div class="front-word" data-len="${[...card.word].length}">${card.word}</div></div>
      <div class="hint-bottom">单击发音 · 双击翻面 · ↑难 ↓易</div>
    `;
    return el;
  },
  renderBack(card, color) {
    const el = document.createElement('div');
    el.className = `flash-card back color-${color}`;
    const meanings = card.meanings.map((m, i) => `${['①','②','③','④'][i]} ${m}`).join('<br>');
    el.innerHTML = `
      <div class="card-id">${card.id}</div>
      <div class="back-head">${card.word}</div>
      <div class="back-kana">${card.kana} ${card.accent ? '['+card.accent+']' : ''} ${card.type ? '· '+card.type : ''} ${card.transitivity ? '· '+_normTrans(card.transitivity) : ''}</div>
      <div class="section-title">注释</div>
      <div class="section-body">${meanings}</div>
      <div class="section-title">关联记忆</div>
      <div class="section-body">${card.mnemonic}</div>
      <div class="section-title">例句</div>
      <div class="section-body">
        ${card.examples.map((ex, i) => `
          <div class="sentence-row" data-ex-index="${i}">
            <div class="jp">${['①','②'][i]} ${ex.jp}</div>
            <div class="cn">${ex.cn}</div>
          </div>
        `).join('')}
      </div>
      <div class="hint-bottom">双击翻回正面</div>
    `;
    return el;
  },
};

const TopBar = {
  warnings: [],
  addWarning(msg) { this.warnings.push(msg); },
  render() {
    const topbar = document.querySelector('#topbar');
    let leftHtml;
    const stats = Progress.stats();
    const streak = Streak.getCurrent();
    const streakHtml = streak > 0 ? ` · 🔥${streak}` : '';
    const warn = this.warnings.length ? `<span class="topbar-warn">⚠ ${this.warnings.join(' · ')}</span>` : '';

    if (Router.learnMode) {
      const done = Router.learnCompletedIds.length;
      const total = Router.learnQueue.length;
      leftHtml = `<a class="topbar-left" href="/" style="color: inherit; text-decoration: none;">← 返回 · 学新 ${done}/${total}${streakHtml}${warn}</a>`;
    } else {
      const total = DataStore.allCards().length;
      const idx = Router.currentIndex + 1;
      leftHtml = `<a class="topbar-left" href="index.html" style="color: inherit; text-decoration: none;">📚 ${LEVEL} · ${idx}/${total}${streakHtml}${warn}</a>`;
    }

    topbar.innerHTML = `
      ${leftHtml}
      <div class="topbar-center">已掌握 ${stats.known} · 待巩固 ${stats.unknown}</div>
      <div class="topbar-right">
        <select id="filter-select">
          <option value="all">全部</option>
          <option value="unknown_only">只看待巩固</option>
          <option value="unseen_only">只看未学过</option>
          <option value="random">随机乱序</option>
        </select>
        <a class="settings-btn" href="/grammar/" style="text-decoration: none;" title="切换到文法">📖</a>
        <button class="settings-btn" id="settings-btn">⚙</button>
        <button class="brainwash-btn" id="brainwash-btn" title="洗脑模式">🧠<span class="brainwash-label"> 洗脑</span></button>
      </div>
    `;
    topbar.querySelector('#filter-select').value = Progress.getFilter();
    topbar.querySelector('#filter-select').addEventListener('change', (e) => {
      Router.applyFilter(e.target.value);
    });
    topbar.querySelector('#settings-btn').addEventListener('click', () => SettingsPanel.open());
    topbar.querySelector('#brainwash-btn').addEventListener('click', () => {
      if (typeof BrainwashMode !== 'undefined') BrainwashMode.toggle?.();
    });
  }
};

const BrainwashMode = {
  active: false,
  _aborted: false,
  _paused: false,

  async toggle() {
    if (this.active) this.exit();
    else await this.enter();
  },
  async enter() {
    this.active = true;
    this._aborted = false;
    this._paused = false;
    document.body.classList.add('brainwash-on');
    // 确保在正面
    Router.flipped = false;
    Router.showCurrent();
    await this._runLoop();
  },
  exit() {
    this.active = false;
    this._aborted = true;
    TTSEngine.cancel();
    document.body.classList.remove('brainwash-on');
    TopBar.render();
  },
  pauseToggle() {
    this._paused = !this._paused;
    if (this._paused) TTSEngine.cancel();
  },
  async skipToNext() {
    this._aborted = true;
    TTSEngine.cancel();
    Router.nextCard();
    this._aborted = false;
    await this._runLoop();
  },

  async _runLoop() {
    while (this.active && !this._aborted) {
      const card = Router.visibleCards[Router.currentIndex];
      if (!card) break;
      await this._playCard(card);
      if (this._aborted) break;
      // 进下一张（不改 progress）
      Router.currentIndex = (Router.currentIndex + 1) % Router.visibleCards.length;
      Router.currentColor = CardView.randomColor();
      Router.flipped = false;
      Progress.setLastCardId(Router.visibleCards[Router.currentIndex].id);
      Router.showCurrent();
    }
  },

  async _playCard(card) {
    // 正面阶段：10 × word，每次 pulse
    Router.flipped = false;
    Router.showCurrent();
    for (let i = 0; i < 10 && !this._aborted; i++) {
      await this._waitIfPaused();
      this._pulseWord();
      await TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });
      if (this._aborted) return;
      await this._sleep(300);
    }
    if (this._aborted) return;
    await this._ding();

    // 背面阶段：翻到背面，例句 1 × 2 + 例句 2 × 2
    Router.flipped = true;
    Router.showCurrent();

    // 每条例句 × 2
    for (let exIdx = 0; exIdx < card.examples.length && !this._aborted; exIdx++) {
      const ex = card.examples[exIdx];
      if (!ex || !ex.jp) continue;
      for (let rep = 0; rep < 2 && !this._aborted; rep++) {
        await this._waitIfPaused();
        this._highlightExampleRow(exIdx);
        await TTSEngine.speak(ex.jp, { rate: Progress.getTTSRate() });
        if (this._aborted) return;
        await this._sleep(300);
      }
      if (this._aborted) return;
      if (exIdx < card.examples.length - 1) await this._ding();
    }
    await this._sleep(800);
  },

  _pulseWord() {
    const el = document.querySelector('.front-word');
    if (!el) return;
    el.classList.remove('pulse');
    void el.offsetWidth;  // reflow
    el.classList.add('pulse');
  },
  _highlightExampleRow(idx) {
    const rows = document.querySelectorAll('.sentence-row');
    rows.forEach(r => r.classList.remove('brainwash-playing'));
    if (rows[idx]) rows[idx].classList.add('brainwash-playing');
  },
  _audioCtx: null,
  _getAudioCtx() {
    if (!this._audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) this._audioCtx = new Ctx();
    }
    return this._audioCtx;
  },
  async _ding() {
    const ctx = this._getAudioCtx();
    if (!ctx) { await this._sleep(150); return; }
    // 两个叠加正弦：440 + 880，80ms 衰减
    const now = ctx.currentTime;
    const playTone = (freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.15);
    };
    playTone(440); playTone(880);
    await this._sleep(160);
  },
  _sleep(ms) { return new Promise(r => setTimeout(r, ms)); },
  async _waitIfPaused() {
    while (this._paused && !this._aborted) await this._sleep(100);
  }
};

const LearnListMode = {
  active: false,
  _queue: [],
  _checked: new Set(),
  _onComplete: null,
  _title: '',
  _doneLabelFn: null,

  start({ queue, prechecked, onComplete, title, doneLabel }) {
    this._queue = queue.slice();
    this._checked = new Set(prechecked || []);
    this._onComplete = onComplete;
    this._title = title || '复习选词';
    this._doneLabelFn = doneLabel || ((n) => n > 0 ? `测试勾选的 ${n} 词` : '完成（无勾选）');
    this.active = true;
    document.body.classList.add('learnlist-on');
    this._render();
  },
  exit() {
    this.active = false;
    document.body.classList.remove('learnlist-on');
    const stage = document.querySelector('#cardstage');
    if (stage) stage.innerHTML = '';
  },
  _render() {
    const stage = document.querySelector('#cardstage');
    const checked = this._checked.size;
    const total = this._queue.length;
    const rows = this._queue.map(card => {
      const isChecked = this._checked.has(card.id);
      const showKana = card.word !== card.kana;
      const meaning = (card.meanings && card.meanings[0]) || '';
      return `
        <div class="ll-row${isChecked ? ' ll-checked' : ''}" data-id="${card.id}">
          <div class="ll-check">${isChecked ? '☑' : '☐'}</div>
          <div class="ll-word">${card.word}</div>
          ${showKana ? `<div class="ll-kana">${card.kana}</div>` : ''}
          <div class="ll-meaning">${meaning}</div>
          <button class="ll-tts" data-id="${card.id}" title="听读音">🔊</button>
        </div>
      `;
    }).join('');

    stage.innerHTML = `
      <div class="ll-container">
        <div class="ll-header">
          <a class="ll-exit" href="/">← 返回</a>
          <span class="ll-progress">${this._title} · ${total} 词 · 已勾 ${checked}</span>
        </div>
        <div class="ll-hint">勾上要测试的词 → 点底部按钮做四选一</div>
        <div class="ll-list">${rows}</div>
        <button class="ll-done" id="ll-done">${this._doneLabelFn(checked)}</button>
      </div>
    `;

    stage.querySelectorAll('.ll-row').forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('.ll-tts')) return;
        const id = parseInt(row.dataset.id, 10);
        if (this._checked.has(id)) this._checked.delete(id);
        else this._checked.add(id);
        this._render();
      });
    });
    stage.querySelectorAll('.ll-tts').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id, 10);
        const card = DataStore.getCard(id);
        if (card) TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });
      });
    });
    stage.querySelector('#ll-done').addEventListener('click', () => {
      const checkedIds = [...this._checked];
      const cb = this._onComplete;
      this.exit();
      if (cb) cb(checkedIds);
    });
  }
};
window.LearnListMode = LearnListMode;

const QuizMode = {
  active: false,
  _queue: [],
  _pool: [],         // 全部同级别卡片池，用于抽干扰项
  _idx: 0,
  _correct: 0,
  _promoted: 0,
  _onComplete: null,

  start({ queue, pool, title, onComplete }) {
    this._queue = queue.slice();
    this._pool = pool;
    this._idx = 0;
    this._correct = 0;
    this._promoted = 0;
    this._onComplete = onComplete;
    this._title = title || '复习';
    this.active = true;
    document.body.classList.add('quiz-on');
    this._renderCurrent();
  },
  exit() {
    this.active = false;
    document.body.classList.remove('quiz-on');
    const stage = document.querySelector('#cardstage');
    if (stage) stage.innerHTML = '';
    TopBar.render();
  },

  _renderCurrent() {
    if (this._idx >= this._queue.length) {
      this._renderSummary();
      return;
    }
    const card = this._queue[this._idx];
    // 单词本身是假名（如オノマトペ）→ 选义题；否则 → 选读音题
    const meaningMode = card.word === card.kana;
    let answer, options, optionClass;
    if (meaningMode) {
      answer = (card.meanings && card.meanings[0]) || '';
      const candidates = this._pool
        .map(c => c.meanings && c.meanings[0])
        .filter(m => m && m !== answer);
      const unique = [...new Set(candidates)];
      for (let i = unique.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [unique[i], unique[j]] = [unique[j], unique[i]];
      }
      options = [answer, ...unique.slice(0, 3)];
      optionClass = 'quiz-opt quiz-opt-meaning';
    } else {
      answer = card.kana;
      const distractors = pickDistractors(card.kana, this._pool, 3);
      options = [card.kana, ...distractors];
      optionClass = 'quiz-opt';
    }
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }

    const stage = document.querySelector('#cardstage');
    const promptHtml = meaningMode
      ? `<div class="quiz-word">${card.kana}</div>`
      : `<div class="quiz-word">${card.word}</div>
         <div class="quiz-meaning">${(card.meanings && card.meanings[0]) || ''}</div>`;
    stage.innerHTML = `
      <div class="quiz-card">
        <div class="quiz-topbar">
          <button class="quiz-exit" id="quiz-exit">← 退出</button>
          <span class="quiz-progress">${this._idx + 1} / ${this._queue.length} · 正确 ${this._correct}</span>
        </div>
        ${promptHtml}
        <div class="quiz-options">
          ${options.map(o => `<button class="${optionClass}" data-val="${o.replace(/"/g, '&quot;')}">${o}</button>`).join('')}
        </div>
      </div>
    `;
    stage.querySelector('#quiz-exit').addEventListener('click', () => this.exit());
    stage.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.addEventListener('click', () => this._handleAnswer(btn, card, answer));
    });
  },

  _handleAnswer(btn, card, answer) {
    const chosen = btn.dataset.val;
    const correct = chosen === answer;
    const before = Progress.getEntry(card.id)?.status;
    Progress.markQuiz(card.id, correct);
    const after = Progress.getEntry(card.id)?.status;
    if (before !== 'known' && after === 'known') this._promoted++;
    if (correct) this._correct++;

    // 可视反馈
    document.querySelectorAll('.quiz-opt').forEach(b => {
      b.disabled = true;
      if (b.dataset.val === answer) b.classList.add('quiz-correct');
      else if (b === btn) b.classList.add('quiz-wrong');
    });
    if (correct) TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });

    setTimeout(() => {
      this._idx++;
      this._renderCurrent();
    }, 700);
  },

  _renderSummary() {
    const total = this._queue.length;
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = `
      <div class="quiz-summary">
        <div class="qs-title">${this._title} 完成</div>
        <div class="qs-line">答对 ${this._correct} / ${total}</div>
        <div class="qs-line">新升掌握 ${this._promoted} 词</div>
        <button class="qs-done" id="qs-done">完成</button>
      </div>
    `;
    stage.querySelector('#qs-done').addEventListener('click', () => {
      const cb = this._onComplete;
      this.exit();
      if (cb) cb({ total, correct: this._correct, promoted: this._promoted });
    });
  }
};
window.QuizMode = QuizMode;  // 供 hub.js 调用

const SettingsPanel = {
  open() {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>设置</h3>
        <label>TTS 语速：<span id="rate-val">${Progress.getTTSRate().toFixed(2)}</span></label>
        <input type="range" id="rate-input" min="0.5" max="1.5" step="0.05" value="${Progress.getTTSRate()}">
        <div class="row">
          <button id="edit-btn">编辑当前卡</button>
          <button id="export-btn">导出修改</button>
        </div>
        <div class="row">
          <button class="danger" id="reset-btn">清空学习记录</button>
        </div>
        <div class="row">
          <button id="close-btn">关闭</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.close(); });

    const rateInput = backdrop.querySelector('#rate-input');
    rateInput.addEventListener('input', () => {
      const v = parseFloat(rateInput.value);
      backdrop.querySelector('#rate-val').textContent = v.toFixed(2);
      Progress.setTTSRate(v);
    });
    backdrop.querySelector('#edit-btn').addEventListener('click', () => {
      this.close();
      if (typeof EditPanel !== 'undefined') EditPanel.open(Router.visibleCards[Router.currentIndex]);
    });
    backdrop.querySelector('#export-btn').addEventListener('click', () => {
      this._exportOverrides();
    });
    backdrop.querySelector('#reset-btn').addEventListener('click', () => {
      if (confirm('清空所有学习记录？（不会影响你编辑过的卡片）')) {
        Progress.reset();
        Router.computeVisible();
        Router.currentIndex = 0;
        Router.showCurrent();
        this.close();
      }
    });
    backdrop.querySelector('#close-btn').addEventListener('click', () => this.close());
  },
  close() {
    document.querySelector('.modal-backdrop')?.remove();
  },
  _exportOverrides() {
    const data = JSON.stringify(DataStore.exportOverrides(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cards.overrides.json';
    a.click(); URL.revokeObjectURL(url);
  }
};

const EditPanel = {
  open(card) {
    if (!card) return;
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.innerHTML = `
      <div class="modal">
        <h3>编辑 · ${card.word}</h3>
        <label>注释（每行一条）</label>
        <textarea id="edit-meanings">${card.meanings.join('\n')}</textarea>
        <label>关联记忆</label>
        <textarea id="edit-mnemonic">${card.mnemonic}</textarea>
        <label>例句 1 · 日文</label>
        <input id="edit-ex1-jp" value="${this._esc(card.examples[0].jp)}">
        <label>例句 1 · 中文</label>
        <input id="edit-ex1-cn" value="${this._esc(card.examples[0].cn)}">
        <label>例句 2 · 日文</label>
        <input id="edit-ex2-jp" value="${this._esc(card.examples[1].jp)}">
        <label>例句 2 · 中文</label>
        <input id="edit-ex2-cn" value="${this._esc(card.examples[1].cn)}">
        <div class="row">
          <button class="primary" id="save-btn">保存</button>
          <button id="cancel-btn">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) this.close(); });
    backdrop.querySelector('#cancel-btn').addEventListener('click', () => this.close());
    backdrop.querySelector('#save-btn').addEventListener('click', () => {
      const patch = {
        meanings: backdrop.querySelector('#edit-meanings').value.split('\n').map(s => s.trim()).filter(Boolean),
        mnemonic: backdrop.querySelector('#edit-mnemonic').value.trim(),
        examples: [
          { jp: backdrop.querySelector('#edit-ex1-jp').value.trim(), cn: backdrop.querySelector('#edit-ex1-cn').value.trim() },
          { jp: backdrop.querySelector('#edit-ex2-jp').value.trim(), cn: backdrop.querySelector('#edit-ex2-cn').value.trim() }
        ]
      };
      DataStore.applyOverride(card.id, patch);
      this.close();
      Router.showCurrent();
    });
  },
  close() { document.querySelector('.modal-backdrop')?.remove(); },
  _esc(s) { return String(s).replace(/"/g, '&quot;'); }
};

const Router = {
  currentIndex: 0,
  currentColor: null,
  flipped: false,
  visibleCards: [],
  learnMode: false,
  learnQueue: [],
  learnCompletedIds: [],
  learnReturnUrl: null,
  learnRetakeDate: null,

  computeVisible() {
    const all = DataStore.allCards();
    const filter = Progress.getFilter();
    let v;
    switch (filter) {
      case 'unknown_only':
        v = all.filter(c => Progress.getStatus(c.id) === 'unknown'); break;
      case 'unseen_only':
        v = all.filter(c => Progress.getStatus(c.id) === null); break;
      case 'random':
        v = [...all].sort(() => Math.random() - 0.5); break;
      case 'all':
      default:
        v = [...all];
    }
    this.visibleCards = v.length > 0 ? v : all;  // 空则回退全部
  },

  showCurrent() {
    if (this.visibleCards.length === 0) this.computeVisible();
    if (this.visibleCards.length === 0) return;
    if (this.currentIndex >= this.visibleCards.length) this.currentIndex = 0;
    const card = this.visibleCards[this.currentIndex];
    if (!this.currentColor) this.currentColor = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    const cardEl = this.flipped
      ? CardView.renderBack(card, this.currentColor)
      : CardView.renderFront(card, this.currentColor);
    stage.appendChild(cardEl);

    Gestures.attach(cardEl, {
      onTap: (e) => {
        if (e.target.closest('.sentence-row')) return;
        this.playCurrentWord();
      },
      onDoubleTap: () => {
        if (BrainwashMode.active) { BrainwashMode.pauseToggle(); return; }
        this.toggleFlip();
        this._speakWordTwice();
      },
      onSwipe: (dir) => {
        if (BrainwashMode.active) BrainwashMode.skipToNext();
        else this.markAndNext(dir === 'up' ? 'unknown' : 'known');
      }
    });

    if (this.flipped) {
      cardEl.querySelectorAll('.sentence-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          // 400ms 内刚双击翻面的话，落点误触例句不算数
          if (performance.now() - (this._flipTime || 0) < 400) return;
          const idx = parseInt(row.dataset.exIndex, 10);
          this.playExample(idx);
        });
      });
    }
    TopBar.render();
  },

  markAndNext(status) {
    const card = this.visibleCards[this.currentIndex];
    if (card) {
      Progress.mark(card.id, status);
      if (this.learnMode) this.learnCompletedIds.push(card.id);
    }
    if (this.learnMode && this.learnCompletedIds.length >= this.learnQueue.length) {
      this._finishLearn();
      return;
    }
    this.nextCard();
  },
  nextCard() {
    if (this.visibleCards.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.visibleCards.length;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    Progress.setLastCardId(this.visibleCards[this.currentIndex].id);
    this.showCurrent();
  },

  async enterLearnSession(queue, returnUrl, retakeDate) {
    this.learnMode = true;
    this.learnQueue = queue.slice();
    this.learnCompletedIds = [];
    this.learnReturnUrl = returnUrl;
    this.learnRetakeDate = retakeDate || null;
    this.visibleCards = queue;
    this.currentIndex = 0;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    this.showCurrent();
  },

  _finishLearn() {
    const ids = this.learnCompletedIds.slice();
    const url = this.learnReturnUrl || '/';
    const retakeDate = this.learnRetakeDate;
    this.learnMode = false;
    this.learnQueue = [];
    this.learnCompletedIds = [];
    this.learnReturnUrl = null;
    this.learnRetakeDate = null;
    const p = new URLSearchParams();
    if (retakeDate) {
      p.set('retake_completed', '1');
      p.set('date', retakeDate);
    } else {
      p.set('learn_completed', '1');
      p.set('level', LEVEL_KEY);
      p.set('ids', ids.join(','));
    }
    window.location.href = url + '?' + p.toString();
  },

  toggleFlip() {
    this.flipped = !this.flipped;
    this._flipTime = performance.now();
    this.showCurrent();
  },
  async _speakWordTwice() {
    const card = this.visibleCards[this.currentIndex];
    if (!card) return;
    const rate = Progress.getTTSRate();
    await TTSEngine.speak(card.kana, { rate });
    // 如果用户已经切卡或洗脑模式打断，就不要读第二遍
    if (this.visibleCards[this.currentIndex] !== card || BrainwashMode.active) return;
    await TTSEngine.speak(card.kana, { rate });
  },

  applyFilter(filter) {
    const currentCard = this.visibleCards[this.currentIndex];
    Progress.setFilter(filter);
    this.computeVisible();
    // 尽量保留位置：若当前卡仍在新列表里，就定位到它
    const keepIdx = currentCard ? this.visibleCards.findIndex(c => c.id === currentCard.id) : -1;
    this.currentIndex = keepIdx >= 0 ? keepIdx : 0;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    this.showCurrent();
  },

  playCurrentWord() {
    const card = this.visibleCards[this.currentIndex];
    if (card) TTSEngine.speak(card.kana, { rate: Progress.getTTSRate() });
  },
  playExample(idx) {
    const card = this.visibleCards[this.currentIndex];
    if (card) TTSEngine.speak(card.examples[idx].jp, { rate: Progress.getTTSRate() });
  }
};

function _attachKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    switch (e.key) {
      case ' ':         e.preventDefault(); Router.toggleFlip(); break;
      case 'ArrowUp':   e.preventDefault(); Router.markAndNext('unknown'); break;
      case 'ArrowDown': e.preventDefault(); Router.markAndNext('known'); break;
      case 'ArrowRight':e.preventDefault(); Router.nextCard(); break;
      case 'p': case 'P': Router.playCurrentWord(); break;
      case 'Escape':
        if (Router.learnMode) window.location.href = '/';
        else if (BrainwashMode.active) BrainwashMode.exit();
        break;
    }
  });
}

// 禁止 iOS Safari 双击缩放（user-scalable=no 在部分 iOS 版本仍允许双击缩放）
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
// 禁止双指捏合缩放
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

document.addEventListener('DOMContentLoaded', async () => {
  const topbar = document.querySelector('#topbar');
  try {
    await DataStore.load();
    Progress.load();
    Router.computeVisible();

    // 若 URL 带 ?session=learn，进入学新模式
    const params = new URLSearchParams(location.search);
    if (params.get('session') === 'review') {
      const kind = params.get('kind') || 'morning';   // 'morning' | 'weekly'
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
      const queue = queueIds.map(id => DataStore.getCard(id)).filter(Boolean);
      if (queue.length > 0) {
        const title = kind === 'weekly' ? '周复习' : '早复习';
        TTSEngine.init();
        QuizMode.start({
          queue,
          pool: DataStore.allCards(),
          title,
          onComplete: ({ total, correct, promoted }) => {
            const p = new URLSearchParams();
            p.set('review_completed', '1');
            p.set('level', LEVEL_KEY);
            p.set('kind', kind);
            p.set('total', String(total));
            p.set('correct', String(correct));
            window.location.href = '/?' + p.toString();
          }
        });
        return;
      } else {
        // 空题池直接回去
        window.location.href = `/?review_completed=1&level=${LEVEL_KEY}&kind=${kind}&total=0&correct=0`;
        return;
      }
    }
    if (params.get('session') === 'retake') {
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
      const queue = queueIds.map(id => DataStore.getCard(id)).filter(Boolean);
      const dateStr = params.get('date') || '';
      if (queue.length > 0) {
        TTSEngine.init();
        if (!Progress.isAvailable()) TopBar.addWarning('进度不保存');
        if (!TTSEngine.isSupported()) TopBar.addWarning('不支持发音');
        const prechecked = queue.filter(c => Progress.getStatus(c.id) === 'unknown').map(c => c.id);
        const goBack = () => {
          const p = new URLSearchParams();
          p.set('retake_completed', '1');
          p.set('date', dateStr);
          window.location.href = '/?' + p.toString();
        };
        LearnListMode.start({
          queue,
          prechecked,
          title: '选词复习',
          onComplete: (checked) => {
            const checkedSet = new Set(checked);
            const toQuiz = queue.filter(c => checkedSet.has(c.id));
            if (toQuiz.length === 0) { goBack(); return; }
            QuizMode.start({
              queue: toQuiz,
              pool: DataStore.allCards(),
              title: '勾选词复习',
              onComplete: () => goBack()
            });
          }
        });
        return;
      } else {
        const p = new URLSearchParams();
        p.set('retake_completed', '1');
        p.set('date', dateStr);
        window.location.href = '/?' + p.toString();
        return;
      }
    }
    if (params.get('session') === 'learn') {
      const queueIds = (params.get('ids') || '').split(',').map(n => parseInt(n, 10)).filter(n => Number.isFinite(n));
      const queue = queueIds
        .map(id => DataStore.getCard(id))
        .filter(Boolean);
      if (queue.length > 0) {
        TTSEngine.init();
        if (!Progress.isAvailable()) TopBar.addWarning('进度不保存');
        if (!TTSEngine.isSupported()) TopBar.addWarning('不支持发音');
        const retakeDate = params.get('retake');
        Router.enterLearnSession(queue, '/', retakeDate);
        _attachKeyboard();
        return;
      }
    }

    TTSEngine.init();
    if (!Progress.isAvailable()) TopBar.addWarning('进度不保存');
    if (!TTSEngine.isSupported()) TopBar.addWarning('不支持发音');
    const lastId = Progress.getLastCardId();
    if (lastId !== null) {
      const idx = Router.visibleCards.findIndex(c => c.id === lastId);
      if (idx >= 0) Router.currentIndex = idx;
    }
    Router.showCurrent();

    _attachKeyboard();
  } catch (err) {
    document.querySelector('#topbar').textContent = '加载失败';
    document.querySelector('#cardstage').innerHTML = `
      <div class="fatal-error">
        <h2>无法加载卡片数据</h2>
        <p>${err.message}</p>
        <button onclick="location.reload()">重试</button>
      </div>
    `;
  }
});
