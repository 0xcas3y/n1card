const COLORS = ['blue', 'green', 'purple', 'coral', 'teal', 'pink'];

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
    if (i >= 0) this.cards[i] = { ...this.cards[i], ...patch };
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
    this._progress[id] = { status, lastSeen: Date.now() };
    this._save();
  },
  getStatus(id) { return this._progress[id]?.status || null; },
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

// 打卡：全局（跨 level 共享），记录哪些日期用户真实刷了卡
const Streak = {
  key: 'n1card:streak',
  _state: { lastDate: null, current: 0, longest: 0, total: 0 },
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
    this._save();
    return true;  // 刚完成今日打卡
  },
  getCurrent() {
    this.load();
    // 如果今天没打过 + 昨天也没打过，current 应当重置为 0
    const today = this._dateStr(new Date());
    if (this._state.lastDate === today) return this._state.current;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (this._state.lastDate === this._dateStr(yesterday)) return this._state.current;
    return 0;
  },
  getLongest() { this.load(); return this._state.longest || 0; },
  getTotal() { this.load(); return this._state.total || 0; },
  getLastDate() { this.load(); return this._state.lastDate; }
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
      <div class="front-center"><div class="front-word">${card.word}</div></div>
      <div class="hint-bottom">单击发音 · 双击翻面</div>
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
      <div class="back-kana">${card.kana} ${card.accent ? '['+card.accent+']' : ''} ${card.type ? '· '+card.type : ''}</div>
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
    const total = DataStore.allCards().length;
    const idx = Router.currentIndex + 1;
    const stats = Progress.stats();
    const streak = Streak.getCurrent();
    const streakHtml = streak > 0 ? ` · 🔥${streak}` : '';
    const warn = this.warnings.length ? `<span class="topbar-warn">⚠ ${this.warnings.join(' · ')}</span>` : '';
    topbar.innerHTML = `
      <a class="topbar-left" href="index.html" style="color: inherit; text-decoration: none;">📚 ${LEVEL} · ${idx}/${total}${streakHtml}${warn}</a>
      <div class="topbar-center">已掌握 ${stats.known} · 待巩固 ${stats.unknown}</div>
      <div class="topbar-right">
        <select id="filter-select">
          <option value="all">全部</option>
          <option value="unknown_only">只看待巩固</option>
          <option value="unseen_only">只看未学过</option>
          <option value="random">随机乱序</option>
        </select>
        <button class="settings-btn" id="settings-btn">⚙</button>
        <button class="brainwash-btn" id="brainwash-btn">🧠 洗脑</button>
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

    // 例句 1 × 2
    for (let rep = 0; rep < 2 && !this._aborted; rep++) {
      await this._waitIfPaused();
      this._highlightExampleRow(0);
      await TTSEngine.speak(card.examples[0].jp, { rate: Progress.getTTSRate() });
      if (this._aborted) return;
      await this._sleep(300);
    }
    if (this._aborted) return;
    await this._ding();
    // 例句 2 × 2
    for (let rep = 0; rep < 2 && !this._aborted; rep++) {
      await this._waitIfPaused();
      this._highlightExampleRow(1);
      await TTSEngine.speak(card.examples[1].jp, { rate: Progress.getTTSRate() });
      if (this._aborted) return;
      await this._sleep(300);
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
      Streak.tick();
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
    TTSEngine.init();
    if (!Progress.isAvailable()) TopBar.addWarning('进度不保存');
    if (!TTSEngine.isSupported()) TopBar.addWarning('不支持发音');
    const lastId = Progress.getLastCardId();
    if (lastId !== null) {
      const idx = Router.visibleCards.findIndex(c => c.id === lastId);
      if (idx >= 0) Router.currentIndex = idx;
    }
    Router.showCurrent();

    document.addEventListener('keydown', (e) => {
      if (e.target.matches('input, textarea, select')) return;
      switch (e.key) {
        case ' ':         e.preventDefault(); Router.toggleFlip(); break;
        case 'ArrowUp':   e.preventDefault(); Router.markAndNext('unknown'); break;
        case 'ArrowDown': e.preventDefault(); Router.markAndNext('known'); break;
        case 'ArrowRight':e.preventDefault(); Router.nextCard(); break;
        case 'p': case 'P': Router.playCurrentWord(); break;
        case 'Escape': if (BrainwashMode.active) BrainwashMode.exit(); break;
      }
    });
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
