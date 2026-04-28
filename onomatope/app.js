// オノマトペ flashcard viewer
const COLORS = ['pink', 'coral', 'teal', 'green', 'blue', 'purple'];

const urlParams = new URLSearchParams(location.search);
const GYOU = urlParams.get('gyou') || 'a';
const GYOU_JP = { a: 'あ', ka: 'か', sa: 'さ', ta: 'た', na: 'な', ha: 'は', ma: 'ま', ya: 'や', ra: 'ら', wa: 'わ' }[GYOU] || 'あ';
const STORAGE_PREFIX = `onomatope:${GYOU}:`;

// Data — sort by SRS: due first, then new cards
const DataStore = {
  cards: [],
  async load() {
    const res = await fetch('data/cards.json');
    if (!res.ok) throw new Error('加载 cards.json 失败');
    const data = await res.json();
    const all = data.cards.filter(c => c.gyou === GYOU_JP);
    const now = Date.now();
    const due = all
      .filter(c => { const d = Progress.getDue(c.id); return d !== null && d <= now; })
      .sort((a, b) => (Progress.getDue(a.id) || 0) - (Progress.getDue(b.id) || 0));
    const newCards = all.filter(c => Progress.isNew(c.id));
    this.cards = [...due, ...newCards];
    this.allCards = all;
    return this.cards;
  }
};

// SM-2 spaced repetition
const Progress = {
  _data: {},
  _lastIdx: 0,
  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_PREFIX + 'progress') || '{}');
      // Migrate from old { status, t } format
      for (const k in raw) {
        const v = raw[k];
        if (v && v.n === undefined) {
          raw[k] = v.status === 'known'
            ? { n: 2, ef: 2.5, interval: 7, due: Date.now() + 7 * 86400000 }
            : { n: 0, ef: 2.5, interval: 1, due: Date.now() };
        }
      }
      this._data = raw;
    } catch {}
    try {
      const i = localStorage.getItem(STORAGE_PREFIX + 'lastIdx');
      if (i) this._lastIdx = parseInt(i, 10) || 0;
    } catch {}
  },
  save() {
    try {
      localStorage.setItem(STORAGE_PREFIX + 'progress', JSON.stringify(this._data));
      localStorage.setItem(STORAGE_PREFIX + 'lastIdx', String(this._lastIdx));
    } catch {}
  },
  // quality: 1 = again (swipe up), 4 = good (swipe down)
  grade(id, quality) {
    const c = this._data[id] || { n: 0, ef: 2.5, interval: 0 };
    let { n, ef, interval } = c;
    if (quality >= 3) {
      if (n === 0)      interval = 1;
      else if (n === 1) interval = 6;
      else              interval = Math.round(interval * ef);
      n++;
      ef = Math.max(1.3, ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    } else {
      n = 0;
      interval = 1;
    }
    this._data[id] = { n, ef, interval, due: Date.now() + interval * 86400000 };
    this.save();
  },
  isNew(id)  { return !this._data[id]; },
  getDue(id) { return this._data[id]?.due ?? null; },
  setLastIdx(i) { this._lastIdx = i; this.save(); },
  getLastIdx()  { return this._lastIdx; },
  stats(cards) {
    const now = Date.now();
    let known = 0, pending = 0;
    for (const card of cards) {
      const d = this._data[card.id];
      if (!d) continue;
      if (d.n > 0 && d.due > now) known++;
      else pending++;
    }
    return { known, pending };
  },
  nextDueDate() {
    const future = Object.values(this._data)
      .map(v => v.due)
      .filter(d => d && d > Date.now())
      .sort((a, b) => a - b);
    if (!future.length) return null;
    const d = new Date(future[0]);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
};

// TTS
const TTS = {
  _voice: null,
  init() {
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this._voice = voices.find(v => v.lang.startsWith('ja')) || null;
    };
    pick();
    if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', pick);
  },
  speak(text, rate = 0.9) {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (this._voice) u.voice = this._voice;
    u.rate = rate;
    speechSynthesis.speak(u);
  },
  cancel() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
};

// Gestures — sentence areas handled separately
const Gestures = {
  attach(el, { onTap, onDoubleTap, onSwipe }) {
    let tapTimer = null;
    let touchStart = null;
    const clearTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; } };

    const isExcluded = e =>
      e.target.closest('.sentence-row') || e.target.closest('.front-sentence');

    el.addEventListener('pointerdown', (e) => {
      if (isExcluded(e)) { touchStart = null; return; }
      touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointercancel', () => { touchStart = null; clearTap(); });
    el.addEventListener('pointerup', (e) => {
      if (isExcluded(e)) { touchStart = null; clearTap(); return; }
      if (!touchStart) return;
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      const dt = performance.now() - touchStart.t;
      const speed = Math.hypot(dx, dy) / dt;

      if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx) * 1.5 && speed > 0.3) {
        clearTap();
        onSwipe?.(dy < 0 ? 'up' : 'down');
        touchStart = null;
        return;
      }
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && speed > 0.3) {
        clearTap();
        onSwipe?.(dx < 0 ? 'left' : 'right');
        touchStart = null;
        return;
      }
      if (Math.hypot(dx, dy) < 10) {
        if (tapTimer) {
          clearTap();
          onDoubleTap?.(e);
        } else {
          tapTimer = setTimeout(() => { tapTimer = null; onTap?.(e); }, 200);
        }
      }
      touchStart = null;
    });
  }
};

// Helpers
function escapeHTML(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getSynonyms(card) {
  if (!card.mnemonic) return [];
  const part = card.mnemonic.split('🔍 近义区别：')[1];
  if (!part) return [];
  return part.trim()
    .split('｜')
    .map(s => s.split('=')[0].trim())
    .filter(s => s && s !== card.word);
}

// Single audio channel — prevents overlap
const AudioManager = {
  _current: null,
  stop() {
    if (this._current) {
      this._current.pause();
      this._current.currentTime = 0;
      this._current = null;
    }
    TTS.cancel();
  },
  play(src) {
    this.stop();
    const a = new Audio(src);
    this._current = a;
    a.onended = () => { if (this._current === a) this._current = null; };
    return a.play();
  },
  tts(text, rate = 0.9) {
    this.stop();
    TTS.speak(text, rate);
  }
};

// IK audio — fetch from Immersion Kit API when no local file
const IKAudio = {
  _cache: {},
  async getUrl(word) {
    if (this._cache[word] !== undefined) return this._cache[word];
    try {
      const res = await fetch(
        `https://www.immersionkit.com/api/1.0/?keyword=${encodeURIComponent(word)}&exact=true&limit=5`,
        { signal: AbortSignal.timeout(4000) }
      );
      const json = await res.json();
      const url = json?.data?.[0]?.sound_url || null;
      this._cache[word] = url;
      return url;
    } catch {
      this._cache[word] = null;
      return null;
    }
  }
};

async function playAudioSrc(src, fallbackJp, word) {
  if (src) {
    AudioManager.play(src).catch(() => AudioManager.tts(fallbackJp, 0.85));
    return;
  }
  if (word) {
    const url = await IKAudio.getUrl(word);
    if (url) { AudioManager.play(url).catch(() => AudioManager.tts(fallbackJp, 0.85)); return; }
  }
  AudioManager.tts(fallbackJp, 0.85);
}

// Card rendering
const CardView = {
  colorOf(card) { return COLORS[(card.id - 1) % COLORS.length]; },

  renderFront(card) {
    const color = this.colorOf(card);
    const el = document.createElement('div');
    el.className = `flash-card color-${color} enter`;
    const ex0 = (card.examples && card.examples[0]) || null;
    const hasImg   = ex0 && ex0.image;
    const hasAudio = ex0 && ex0.audio;
    const synonyms = getSynonyms(card);

    el.innerHTML = `
      <div class="card-id"><span class="gyou">${card.gyou}</span>${card.id}</div>
      <div class="front-top">
        <div class="front-word" data-len="${[...card.word].length}">${card.word}</div>
      </div>
      ${synonyms.length ? `
        <div class="front-synonyms">
          ${synonyms.map(s => `<span class="syn-tag">${s}</span>`).join('')}
        </div>` : ''}
      ${hasImg
        ? `<div class="front-image"><img src="${ex0.image}" alt=""></div>`
        : '<div class="front-image-placeholder">（図）</div>'}
      ${ex0 ? `
        <div class="front-sentence${hasAudio ? ' has-audio' : ''}"
             data-audio="${hasAudio ? ex0.audio : ''}"
             data-jp="${escapeHTML(ex0.jp)}">
          <div class="front-sentence-row">
            <div class="front-jp">${escapeHTML(ex0.jp)}</div>
            ${ex0.cn ? `<button class="cn-toggle-btn" aria-label="显示翻译">译</button>` : ''}
          </div>
          ${ex0.cn ? `<div class="front-cn">${escapeHTML(ex0.cn)}</div>` : ''}
        </div>` : ''}
      ${hasAudio ? `<audio class="front-audio" preload="auto" src="${ex0.audio}"></audio>` : ''}
      <div class="hint-bottom">
        <span class="hint-pill">双击翻面</span>
        <span class="hint-pill">← 难</span>
        <span class="hint-pill">→ 易</span>
      </div>
    `;
    return el;
  },

  renderBack(card) {
    const color = this.colorOf(card);
    const el = document.createElement('div');
    el.className = `flash-card back color-${color} enter`;

    const meaningsHTML = card.meanings.length
      ? card.meanings.map((m, i) => {
          const num = card.meanings.length > 1
            ? `<span class="num">${['①','②','③','④'][i] || '·'}</span>` : '';
          return `<div class="meaning-item">${num}${escapeHTML(m)}</div>`;
        }).join('')
      : '<div class="meaning-item">(无词义)</div>';

    const parts = (card.mnemonic || '').split('🔍 近义区别：');
    const core = parts[0].trim();
    const syn  = parts[1]?.trim() || '';

    const frontJp = card.examples[0]?.jp || '';
    const backExamples = card.examples.filter(ex => ex.jp !== frontJp).slice(0, 2);
    const examplesHTML = backExamples.length
      ? backExamples.map(ex => `
          <div class="sentence-row${ex.audio ? ' has-audio' : ''}"
               data-audio="${ex.audio || ''}"
               data-jp="${escapeHTML(ex.jp)}">
            <div class="jp">${escapeHTML(ex.jp)}</div>
            <div class="cn">${escapeHTML(ex.cn)}</div>
          </div>`).join('')
      : '<div class="sentence-row"><div class="cn" style="opacity:0.5;">（正面已展示例句）</div></div>';

    el.innerHTML = `
      <div class="card-id"><span class="gyou">${card.gyou}</span>${card.id}</div>
      <div class="back-head">${card.word}</div>
      <div class="back-kana">副詞</div>

      <div class="section">
        <div class="section-title">词 义</div>
        <div class="section-body">${meaningsHTML}</div>
      </div>
      ${core ? `
      <div class="section">
        <div class="section-title">用法核心</div>
        <div class="section-body">${escapeHTML(core)}</div>
      </div>` : ''}
      ${syn ? `
      <div class="section">
        <div class="section-title">近义区别</div>
        <div class="synonym-box">${escapeHTML(syn)}</div>
      </div>` : ''}
      ${card.collocations ? `
      <div class="section">
        <div class="section-title">常用搭配</div>
        <div class="collocations">${escapeHTML(card.collocations)}</div>
      </div>` : ''}
      <div class="section">
        <div class="section-title">
          漫画例句
          <a class="ik-inline-link"
             href="https://www.immersionkit.com/dictionary?keyword=${encodeURIComponent(card.word)}&exact=true"
             target="_blank" rel="noopener">IK ↗</a>
        </div>
        <div class="section-body">${examplesHTML}</div>
      </div>
    `;
    return el;
  }
};

// Chinese translation toggle — class on #app controls .front-cn visibility
const CnToggle = {
  _show: false,
  toggle(btn) {
    this._show = !this._show;
    document.getElementById('app')?.classList.toggle('cn-visible', this._show);
    if (btn) btn.classList.toggle('active', this._show);
  }
};

// Router / state machine
const Router = {
  currentIndex: 0,
  isBack: false,
  cards: [],

  init(cards) {
    this.cards = cards;
    this.currentIndex = 0;
    this.render();
  },

  next() {
    if (this.currentIndex < this.cards.length - 1) {
      this.currentIndex++;
      this.isBack = false;
      Progress.setLastIdx(this.currentIndex);
      this.render();
    } else {
      this.showComplete();
    }
  },

  prev() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.isBack = false;
      Progress.setLastIdx(this.currentIndex);
      this.render();
    }
  },

  flip() { this.isBack = !this.isBack; this.render(); },

  render() {
    const stage = document.getElementById('cardstage');
    stage.innerHTML = '';

    if (!this.cards.length) {
      const next = Progress.nextDueDate();
      stage.innerHTML = `
        <div style="text-align:center;padding:40px;max-width:300px;margin:0 auto;">
          <div style="font-size:48px;margin-bottom:16px;">✨</div>
          <div style="font-size:20px;font-weight:600;margin-bottom:10px;">今日已完成</div>
          <div style="opacity:0.6;font-size:14px;line-height:1.7;">
            ${next ? `下次复习：${next}` : '全部词汇已掌握'}
          </div>
        </div>`;
      MiniNav.update();
      return;
    }

    const card = this.cards[this.currentIndex];
    const el = this.isBack ? CardView.renderBack(card) : CardView.renderFront(card);
    stage.appendChild(el);

    // Main card tap = play word pronunciation
    Gestures.attach(el, {
      onTap: () => {
        const wordEl = el.querySelector('.front-word');
        if (wordEl) { wordEl.classList.add('pulse'); setTimeout(() => wordEl.classList.remove('pulse'), 400); }
        const audio = el.querySelector('audio.front-audio');
        if (audio) AudioManager.play(audio.src).catch(() => AudioManager.tts(card.word));
        else AudioManager.tts(card.word);
      },
      onDoubleTap: () => this.flip(),
      onSwipe: (dir) => {
        if      (dir === 'left')  { Progress.grade(card.id, 1); this.next(); }
        else if (dir === 'right') { Progress.grade(card.id, 4); this.next(); }
        else if (dir === 'up')    this.prev();
        else if (dir === 'down')  this.next();
      }
    });

    // Front sentence tap = play sentence audio (ignore taps on the 译 button)
    const frontSentence = el.querySelector('.front-sentence');
    if (frontSentence) {
      frontSentence.addEventListener('pointerup', (e) => {
        if (e.target.closest('.cn-toggle-btn')) return;
        e.stopPropagation();
        playAudioSrc(frontSentence.dataset.audio, frontSentence.dataset.jp, card.word);
      });
    }

    // 译 button on front card
    const cnBtn = el.querySelector('.cn-toggle-btn');
    if (cnBtn) {
      cnBtn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        CnToggle.toggle(cnBtn);
      });
    }

    // Back sentence rows tap = play via IK if no local audio
    el.querySelectorAll('.sentence-row').forEach(row => {
      const src = row.dataset.audio;
      const jp  = row.dataset.jp || '';
      if (src || jp) {
        row.addEventListener('pointerup', (e) => {
          e.stopPropagation();
          playAudioSrc(src, jp, card.word);
        });
      }
    });

    MiniNav.update();
  },

  showComplete() {
    const stage = document.getElementById('cardstage');
    const s = Progress.stats(this.cards);
    const next = Progress.nextDueDate();
    stage.innerHTML = `
      <div style="text-align:center;padding:40px;max-width:300px;margin:0 auto;">
        <div style="font-size:48px;margin-bottom:16px;">🎉</div>
        <div style="font-size:22px;font-weight:600;margin-bottom:10px;">${GYOU_JP}行 刷完啦！</div>
        <div style="opacity:0.65;font-size:14px;line-height:1.8;margin-bottom:18px;">
          已学会 ${s.known} 词<br>
          ${next ? `下次复习：${next}` : ''}
        </div>
        <button onclick="location.reload()"
          style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.22);
                 padding:10px 24px;border-radius:999px;font-size:14px;cursor:pointer;font-family:inherit;">
          再刷一遍
        </button>
      </div>`;
    MiniNav.update();
  }
};

// Mini nav
const MiniNav = {
  init() {
    document.getElementById('mininav-gyou').textContent = GYOU_JP + '行';
  },
  update() {
    const total = Router.cards.length;
    const idx   = total > 0 ? Router.currentIndex + 1 : 0;
    const prog  = document.getElementById('mininav-progress');
    if (prog) prog.textContent = total > 0 ? `${idx} / ${total}` : '';
  }
};

// Boot
(async () => {
  Progress.load();
  TTS.init();
  MiniNav.init();
  try {
    const cards = await DataStore.load();
    Router.init(cards);
  } catch (err) {
    document.getElementById('cardstage').innerHTML =
      `<div style="text-align:center;color:#ff6b6b;padding:40px;">❌ 加载失败：${err.message}</div>`;
  }
})();

// Keyboard (desktop) — matches swipe: ← hard, → easy
document.addEventListener('keydown', (e) => {
  const card = Router.cards[Router.currentIndex];
  if      (e.key === 'ArrowLeft')  { if (card) Progress.grade(card.id, 1); Router.next(); }
  else if (e.key === 'ArrowRight') { if (card) Progress.grade(card.id, 4); Router.next(); }
  else if (e.key === 'ArrowUp')    Router.prev();
  else if (e.key === 'ArrowDown' || e.key === ' ') Router.next();
  else if (e.key === 'Enter' || e.key === 'f') Router.flip();
});
