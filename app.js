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
  }
};

const Router = {
  currentIndex: 0,
  currentColor: null,
  showCurrent() {
    const cards = DataStore.allCards();
    if (cards.length === 0) return;
    const card = cards[this.currentIndex];
    this.currentColor = CardView.randomColor();
    const stage = document.querySelector('#cardstage');
    stage.innerHTML = '';
    stage.appendChild(CardView.renderFront(card, this.currentColor));
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
