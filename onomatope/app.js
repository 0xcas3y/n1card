// オノマトペ flashcard viewer
const COLORS = ['pink', 'coral', 'teal', 'green', 'blue', 'purple'];
const DAY_SIZE = 20;

const urlParams = new URLSearchParams(location.search);
const DAY = parseInt(urlParams.get('day') || '1', 10);
const STORAGE_PREFIX = `onomatope:d${DAY}:`;
let studyFlushedAt = Date.now();

function getGlobalStats() {
  try { return JSON.parse(localStorage.getItem('onomatope:stats') || '{}'); }
  catch { return {}; }
}

function saveGlobalStats(stats) {
  localStorage.setItem('onomatope:stats', JSON.stringify(stats));
}

function flushStudyTime() {
  const now = Date.now();
  const delta = Math.max(0, Math.round((now - studyFlushedAt) / 1000));
  if (delta < 3) return;
  const stats = getGlobalStats();
  stats.studySeconds = (stats.studySeconds || 0) + delta;
  stats.lastStudiedAt = now;
  saveGlobalStats(stats);
  studyFlushedAt = now;
}

// Data — load by day, sort by SRS
const DataStore = {
  cards: [],
  allCards: [],
  _globalCards: [],  // all cards across all days (for synonym lookup)
  async load() {
    const res = await fetch('data/cards.json');
    if (!res.ok) throw new Error('加载 cards.json 失败');
    const data = await res.json();
    this._globalCards = data.cards;
    const dayCards = data.cards.slice((DAY - 1) * DAY_SIZE, DAY * DAY_SIZE);
    const now = Date.now();
    const due = dayCards
      .filter(c => { const d = Progress.getDue(c.id); return d !== null && d <= now; })
      .sort((a, b) => (Progress.getDue(a.id) || 0) - (Progress.getDue(b.id) || 0));
    const newCards = dayCards.filter(c => Progress.isNew(c.id));
    this.cards = [...due, ...newCards];
    this.allCards = dayCards;
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

// Gestures
// .sentence-row: fully excluded (back card examples, reference only)
// .front-sentence: swipes pass through, taps handled by its own listener
const Gestures = {
  attach(el, { onTap, onDoubleTap, onSwipe }) {
    let tapTimer = null;
    let touchStart = null;
    const clearTap = () => { if (tapTimer) { clearTimeout(tapTimer); tapTimer = null; } };

    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.sentence-row') || e.target.closest('.front-synonyms') || e.target.closest('.card-back-btn')) { touchStart = null; return; }
      touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
    });
    el.addEventListener('pointercancel', () => { touchStart = null; clearTap(); });
    el.addEventListener('pointerup', (e) => {
      if (e.target.closest('.sentence-row') || e.target.closest('.front-synonyms') || e.target.closest('.card-back-btn')) { touchStart = null; clearTap(); return; }
      if (!touchStart) return;
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      const dt = performance.now() - touchStart.t;
      const speed = Math.hypot(dx, dy) / dt;

      // Swipes work everywhere on the card including the sentence area
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

      // Taps on front-sentence are handled by its own listener
      if (e.target.closest('.front-sentence')) { touchStart = null; return; }

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

function highlightWord(jp, word) {
  if (!word) return escapeHTML(jp);
  const escaped = escapeHTML(jp);
  // Match the word and common katakana variants (e.g. ウキウキ alongside うきうき)
  const variants = [...new Set([word, toKatakana(word), toHiragana(word)])].filter(Boolean);
  const re = new RegExp(variants.map(v => escapeRe(v)).join('|'), 'g');
  return escaped.replace(re, m => `<span class="word-hl">${m}</span>`);
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function toKatakana(s) {
  return s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
}
function toHiragana(s) {
  return s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
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
      <div class="front-top">
        <div class="front-word" data-len="${[...card.word].length}">${card.word}</div>
      </div>
      ${synonyms.length ? `
        <div class="front-synonyms">
          <span class="syn-label">近义词</span>${synonyms.map(s => `<button class="syn-tag" data-word="${s}">${s}</button>`).join('')}
        </div>` : ''}
      ${hasImg
        ? `<div class="front-image"><img src="${ex0.image}" alt=""></div>`
        : '<div class="front-image-placeholder">（図）</div>'}
      ${ex0 ? `
        <div class="front-sentence${hasAudio ? ' has-audio' : ''}"
             data-audio="${hasAudio ? ex0.audio : ''}"
             data-jp="${escapeHTML(ex0.jp)}">
          <div class="front-sentence-row">
            <div class="front-jp">${highlightWord(ex0.jp, card.word)}</div>
            ${ex0.cn ? `<button class="cn-toggle-btn" aria-label="显示翻译">译</button>` : ''}
          </div>
          ${ex0.cn ? `<div class="front-cn">${escapeHTML(ex0.cn)}</div>` : ''}
        </div>` : ''}
      ${hasAudio ? `<audio class="front-audio" preload="auto" src="${ex0.audio}"></audio>` : ''}
      <div class="hint-bottom">
        <div class="hint-row">
          <span class="hint-dir">向左 难</span>
          <span class="hint-mid">双击翻面</span>
          <span class="hint-dir">向右 易</span>
        </div>
        <div class="hint-up">向上划 返回上一张</div>
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
            <div class="jp">${highlightWord(ex.jp, card.word)}</div>
            <div class="cn">${escapeHTML(ex.cn)}</div>
          </div>`).join('')
      : '<div class="sentence-row"><div class="cn" style="opacity:0.5;">（正面已展示例句）</div></div>';

    el.innerHTML = `
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
             target="_blank" rel="noopener">🔊 听更多例句</a>
        </div>
        <div class="section-body">${examplesHTML}</div>
      </div>
    `;
    return el;
  }
};

// Navigation history — for synonym jump → back
const NavHistory = {
  _stack: [],
  push(idx, peek) { this._stack.push({ idx, peek: peek || null }); },
  pop()  { return this._stack.pop(); },
  canBack() { return this._stack.length > 0; }
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
  peekCard: null,   // non-null when viewing a synonym card outside the session

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

  jumpToWord(word) {
    const norm = w => toHiragana(w);
    // Search across ALL cards (synonyms may be in other days)
    const target = DataStore._globalCards.find(c =>
      norm(c.word) === norm(word) || c.word === word
    );
    if (!target) return;
    NavHistory.push(this.currentIndex, this.peekCard);
    const idx = this.cards.findIndex(c => c.id === target.id);
    if (idx !== -1) {
      this.peekCard = null;
      this.currentIndex = idx;
    } else {
      this.peekCard = target;
    }
    this.isBack = false;
    this.render();
  },

  goBack() {
    const prev = NavHistory.pop();
    if (!prev) return;
    this.currentIndex = prev.idx;
    this.peekCard = prev.peek;
    this.isBack = false;
    this.render();
  },

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

    const card = this.peekCard || this.cards[this.currentIndex];
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
        if      (dir === 'left')  { if (!this.peekCard) Progress.grade(card.id, 1); this.next(); }
        else if (dir === 'right') { if (!this.peekCard) Progress.grade(card.id, 4); this.next(); }
        else if (dir === 'up')    { NavHistory.canBack() ? this.goBack() : this.prev(); }
        else if (dir === 'down')  this.next();
      }
    });

    // Front sentence: tap = audio/flip, swipe = let bubble to card Gestures
    const frontSentence = el.querySelector('.front-sentence');
    if (frontSentence) {
      let sentenceStart = null;
      let sentenceTapTimer = null;
      frontSentence.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.cn-toggle-btn')) return;
        sentenceStart = { x: e.clientX, y: e.clientY };
      });
      frontSentence.addEventListener('pointerup', (e) => {
        if (e.target.closest('.cn-toggle-btn')) return;
        if (!sentenceStart) return;
        const dx = e.clientX - sentenceStart.x;
        const dy = e.clientY - sentenceStart.y;
        sentenceStart = null;
        // If it looks like a swipe, let the event bubble to card Gestures
        if (Math.abs(dx) > 30 || Math.abs(dy) > 30) return;
        // It's a tap — handle here, stop propagation
        e.stopPropagation();
        if (sentenceTapTimer) {
          clearTimeout(sentenceTapTimer);
          sentenceTapTimer = null;
          Router.flip();
        } else {
          sentenceTapTimer = setTimeout(() => {
            sentenceTapTimer = null;
            playAudioSrc(frontSentence.dataset.audio, frontSentence.dataset.jp, card.word);
          }, 220);
        }
      });
    }

    // Synonym tag navigation
    el.querySelectorAll('.syn-tag[data-word]').forEach(btn => {
      btn.addEventListener('pointerup', e => { e.stopPropagation(); Router.jumpToWord(btn.dataset.word); });
    });

    // 译 button on front card
    const cnBtn = el.querySelector('.cn-toggle-btn');
    if (cnBtn) {
      cnBtn.addEventListener('pointerup', (e) => {
        e.stopPropagation();
        CnToggle.toggle(cnBtn);
      });
    }


    MiniNav.update();
  },

  showComplete() {
    const stage = document.getElementById('cardstage');
    const quizDone = localStorage.getItem('onomatope:d' + DAY + ':quiz-complete') === '1';
    stage.innerHTML = `
      <div style="text-align:center;padding:40px;max-width:300px;margin:0 auto;">
        <div style="font-size:48px;margin-bottom:16px;">${quizDone ? '✅' : '🎉'}</div>
        <div style="font-size:22px;font-weight:600;margin-bottom:10px;">第 ${DAY} 天刷完了！</div>
        <div style="opacity:0.65;font-size:14px;line-height:1.8;margin-bottom:24px;">
          ${quizDone ? '选择题已通过，当天完成 🎊' : '做选择题才算完成这一天'}
        </div>
        ${quizDone
          ? `<button onclick="location.href='index.html'"
               style="background:rgba(255,255,255,0.12);color:#fff;border:1px solid rgba(255,255,255,0.22);
                      padding:10px 28px;border-radius:999px;font-size:14px;cursor:pointer;font-family:inherit;">
               返回主页
             </button>`
          : `<button onclick="location.href='quiz.html?day=${DAY}&type=complete'"
               style="background:#4FB89E;color:#fff;border:none;
                      padding:12px 32px;border-radius:999px;font-size:16px;font-weight:700;cursor:pointer;font-family:inherit;">
               做选择题 →
             </button>`
        }
      </div>`;
    MiniNav.update();
  }
};

// Mini nav
const MiniNav = {
  init() {
    document.getElementById('mininav-gyou').textContent = '第 ' + DAY + ' 天';
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

window.addEventListener('beforeunload', flushStudyTime);
