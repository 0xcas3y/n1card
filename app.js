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
      onSwipe: (dir) => {
        console.log('[swipe]', dir);  // Task 9 会接 Progress
        this.nextCard();
      }
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
    this.currentIndex = (this.currentIndex + 1) % DataStore.allCards().length;
    this.currentColor = CardView.randomColor();
    this.flipped = false;
    this.showCurrent();
  },
  toggleFlip() {
    this.flipped = !this.flipped;
    this.showCurrent();
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  const topbar = document.querySelector('#topbar');
  try {
    await DataStore.load();
    topbar.textContent = `N1 动词速记 · ${DataStore.allCards().length} 词`;
    Router.showCurrent();
  } catch (err) {
    topbar.textContent = '加载失败';
    document.querySelector('#cardstage').textContent = String(err);
  }
});
