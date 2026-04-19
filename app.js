const COLORS = ['blue', 'green', 'purple', 'coral', 'teal', 'pink'];

const DataStore = {
  cards: [],
  async load() {
    const res = await fetch('data/cards.json');
    if (!res.ok) throw new Error(`cards.json fetch failed: ${res.status}`);
    const data = await res.json();
    this.cards = data.cards;
    return this.cards;
  },
  allCards() { return this.cards; },
  getCard(id) { return this.cards.find(c => c.id === id); }
};

const Progress = {
  key: 'n1card:progress',
  settingsKey: 'n1card:settings',
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

const Gestures = {
  attach(el, { onTap, onDoubleTap, onSwipe }) {
    let tapTimer = null;
    let touchStart = null;

    const clearTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; } };

    el.addEventListener('pointerdown', (e) => {
      touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointerup', (e) => {
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

const Router = {
  currentIndex: 0,
  currentColor: null,
  flipped: false,
  showCurrent() {
    const cards = DataStore.allCards();
    if (cards.length === 0) return;
    const card = cards[this.currentIndex];
    if (!this.currentColor) this.currentColor = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    const cardEl = this.flipped
      ? CardView.renderBack(card, this.currentColor)
      : CardView.renderFront(card, this.currentColor);
    stage.appendChild(cardEl);

    Gestures.attach(cardEl, {
      onTap: (e) => {
        // 背面的例句点击优先级更高 → 由例句 row 自己处理
        if (e.target.closest('.sentence-row')) return;
        console.log('[tap]', card.word);  // Task 10 会接 TTS
      },
      onDoubleTap: () => this.toggleFlip(),
      onSwipe: (dir) => this.markAndNext(dir === 'up' ? 'unknown' : 'known')
    });

    // 背面例句单独绑定（Task 10 接 TTS）
    if (this.flipped) {
      cardEl.querySelectorAll('.sentence-row').forEach(row => {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = parseInt(row.dataset.exIndex, 10);
          console.log('[sentence tap]', card.examples[idx].jp);
        });
      });
    }
  },
  nextCard() {
    const cards = DataStore.allCards();
    this.currentIndex = (this.currentIndex + 1) % cards.length;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    Progress.setLastCardId(cards[this.currentIndex].id);
    this.showCurrent();
  },
  toggleFlip() {
    this.flipped = !this.flipped;
    this.showCurrent();
  },
  markAndNext(status) {
    const card = DataStore.allCards()[this.currentIndex];
    if (card) Progress.mark(card.id, status);
    this.nextCard();
  },
  playCurrentWord() {
    // Task 10: 调用 TTSEngine
    console.log('[play word]');
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const topbar = document.querySelector('#topbar');
  try {
    await DataStore.load();
    topbar.textContent = `N1 动词速记 · ${DataStore.allCards().length} 词`;
    Progress.load();
    const lastId = Progress.getLastCardId();
    if (lastId !== null) {
      const idx = DataStore.allCards().findIndex(c => c.id === lastId);
      if (idx >= 0) Router.currentIndex = idx;
    }
    if (!Progress.isAvailable()) {
      topbar.textContent += ' · ⚠ 进度不会保存（隐私模式）';
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
      }
    });
  } catch (err) {
    topbar.textContent = '加载失败';
    document.querySelector('#cardstage').textContent = String(err);
  }
});
