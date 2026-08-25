import { LEVEL_CATEGORY_FILES, mergeLevelPool } from './plan.js';

const RecallTTS = {
  _supported: 'speechSynthesis' in window,
  _jaVoice: null,
  _zhVoice: null,
  init() {
    if (!this._supported) return;
    const pick = () => {
      const voices = speechSynthesis.getVoices();
      this._jaVoice = voices.find(v => v.lang.startsWith('ja')) || null;
      this._zhVoice = voices.find(v => v.lang.startsWith('zh')) || null;
    };
    pick();
    speechSynthesis.addEventListener('voiceschanged', pick);
  },
  speak(text, lang) {
    if (!this._supported) return Promise.resolve();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.voice = lang === 'zh-CN' ? this._zhVoice : this._jaVoice;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      speechSynthesis.speak(u);
    });
  }
};
RecallTTS.init();

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadLevelPool(level) {
  const registry = LEVEL_CATEGORY_FILES[level];
  const entries = await Promise.all(
    Object.entries(registry).map(async ([category, url]) => {
      const res = await fetch(url);
      const data = await res.json();
      return { category, cards: data.cards };
    })
  );
  return mergeLevelPool(level, entries);
}

async function buildPool(scope, customLevel, customCategory) {
  if (scope === 'custom') {
    const pool = await loadLevelPool(customLevel);
    return pool.filter(c => c.category === customCategory);
  }
  // current / overall 都需要用户当前进度来判断"已学过的词"范围；简化处理：
  // current = 当前等级(取 localStorage 里 n1card:current-level，缺省 n1)的已学词；overall = 全部5个等级的已学词
  const levels = scope === 'current' ? [localStorage.getItem('n1card:current-level') || 'n1'] : Object.keys(LEVEL_CATEGORY_FILES);
  let all = [];
  for (const lv of levels) {
    const pool = await loadLevelPool(lv);
    let progress2 = {};
    try { progress2 = JSON.parse(localStorage.getItem(`n1card:progress2:${lv}`)) || {}; } catch {}
    const learned = pool.filter(c => progress2[c.compositeId]);
    all = all.concat(learned);
  }
  return all;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

let selectedMode = 'visual';
let running = false;

document.querySelectorAll('.recall-mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.recall-mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedMode = tab.dataset.mode;
    document.getElementById('recall-gap-setting').style.display = selectedMode === 'audio' ? 'flex' : 'none';
  });
});

document.getElementById('recall-scope').addEventListener('change', (e) => {
  document.getElementById('recall-custom-picker').style.display = e.target.value === 'custom' ? 'block' : 'none';
});

document.getElementById('recall-start').addEventListener('click', async () => {
  if (running) return;
  running = true;
  const scope = document.getElementById('recall-scope').value;
  const customLevel = document.getElementById('recall-level').value;
  const customCategory = document.getElementById('recall-category').value;
  const gapSec = parseInt(document.getElementById('recall-gap').value, 10);

  const pool = shuffle(await buildPool(scope, customLevel, customCategory));
  const stage = document.getElementById('recall-stage');
  stage.style.display = 'block';

  for (let i = 0; i < pool.length; i++) {
    const card = pool[i];
    stage.innerHTML = `
      <div class="recall-word">${card.word}</div>
      <div class="recall-kana">${card.word !== card.kana ? card.kana : ''}</div>
      <div class="recall-meaning" id="recall-meaning"></div>
      <div class="recall-progress">${i + 1} / ${pool.length}</div>
    `;
    for (let rep = 0; rep < 3; rep++) {
      if (rep < 2) {
        await RecallTTS.speak(card.kana, 'ja-JP');
        if (selectedMode === 'audio') await sleep(gapSec * 1000);
      } else {
        if (selectedMode === 'visual') {
          document.getElementById('recall-meaning').textContent = (card.meanings && card.meanings[0]) || '';
          await RecallTTS.speak(card.kana, 'ja-JP');
        } else {
          const meaning = (card.meanings && card.meanings[0]) || '';
          await RecallTTS.speak(meaning, 'zh-CN');
        }
      }
    }
    await sleep(400);
  }
  stage.innerHTML = `<div class="recall-word">🎉 本轮完成</div>`;
  running = false;
});
