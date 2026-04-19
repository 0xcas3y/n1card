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
    stage.appendChild(this.flipped
      ? CardView.renderBack(card, this.currentColor)
      : CardView.renderFront(card, this.currentColor));
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

// TEMP: dev-only, removed in Task 7
window._flip = () => Router.toggleFlip();
window._next = () => Router.nextCard();
