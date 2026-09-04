import { LEVEL_CATEGORY_FILES, mergeLevelPool, migrateOldStatus } from './plan.js';

// 回忆模式跟 today.html 是各自独立运行的页面，不共享 app.js 内部的 CardPool/Progress2 运行时对象，
// 所以这里复刻一份同样的"一次性迁移"逻辑：确保用户就算从未用过"今日滑卡"、直接点进回忆模式，
// 旧版独立词性页面(如 n2-noun.html)里已经积累的 known/unknown 进度也能被识别为"已学过"。
function maybeMigrate(level, entries) {
  const flagKey = `n1card:migrated:${level}`;
  try { if (localStorage.getItem(flagKey)) return; } catch { return; }
  const oldStatusMap = {};
  for (const { category } of entries) {
    const oldKey = category === 'verb' ? `n1card:progress:${level}` : `n1card:progress:${level}-${category}`;
    try {
      const raw = localStorage.getItem(oldKey);
      if (!raw) continue;
      const oldProgress = JSON.parse(raw);
      for (const numId in oldProgress) {
        const st = oldProgress[numId]?.status;
        if (st) oldStatusMap[`${level}:${category}:${numId}`] = st;
      }
    } catch {}
  }
  if (Object.keys(oldStatusMap).length === 0) { try { localStorage.setItem(flagKey, '1'); } catch {} return; }
  let progress2 = {};
  const progress2Key = `n1card:progress2:${level}`;
  try { progress2 = JSON.parse(localStorage.getItem(progress2Key)) || {}; } catch {}
  const now = Date.now();
  let changed = false;
  for (const compositeId in oldStatusMap) {
    if (progress2[compositeId]) continue;
    const entry = migrateOldStatus(oldStatusMap[compositeId], now);
    if (entry) { progress2[compositeId] = entry; changed = true; }
  }
  if (changed) { try { localStorage.setItem(progress2Key, JSON.stringify(progress2)); } catch {} }
  try { localStorage.setItem(flagKey, '1'); } catch {}
}

const RecallTTS = {
  _supported: 'speechSynthesis' in window,
  _jaVoice: null,
  _zhVoice: null,
  _pendingDone: null,
  _pendingTimer: null,
  _keepAliveTimer: null,
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
  // iOS Safari／部分安卓浏览器要求 speak() 必须在用户点击的调用栈内同步触发一次才会"解锁"，
  // 之后异步流程里(await fetch 之后)再调用 speak() 才会真正出声；否则会一直静默排队、不报错也不出声。
  // 必须在按钮 click 回调最开头、任何 await 之前同步调用。
  unlock() {
    if (!this._supported) return;
    try {
      // 注意：不能紧接着调用 cancel()——iOS Safari 上 speak() 后立刻 cancel()
      // 是已知会把引擎晾在"暂停"状态的坑，之后所有 speak() 都会静默排队不出声。
      // 用一个几乎不可闻的极短停顿代替空文本，让它自然放完触发 onend。
      const u = new SpeechSynthesisUtterance('.');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {}
  },
  // Chrome 等浏览器在标签页切到后台/锁屏一段时间后会把 speechSynthesis 引擎自动挂起，
  // 之后 speak() 只会静默排队、永远不真正出声；定期 pause+resume 一下防止它睡死，
  // 这正是"听力/通勤复习"场景（锁屏听）最容易触发的情况。
  _startKeepAlive() {
    if (!this._supported || this._keepAliveTimer) return;
    this._keepAliveTimer = setInterval(() => {
      speechSynthesis.pause();
      speechSynthesis.resume();
    }, 5000);
  },
  _stopKeepAlive() {
    clearInterval(this._keepAliveTimer);
    this._keepAliveTimer = null;
  },
  speak(text, lang) {
    if (!this._supported) return Promise.resolve();
    this._startKeepAlive();
    return new Promise((resolve) => {
      const done = () => {
        if (this._pendingDone !== done) return; // 已经被 timeout 或 cancel() resolve 过了
        this._pendingDone = null;
        clearTimeout(this._pendingTimer);
        resolve();
      };
      this._pendingDone = done;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.voice = lang === 'zh-CN' ? this._zhVoice : this._jaVoice;
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
      // Safari 在 cancel() 之后经常不触发 onend/onerror，兜底超时避免整个回忆流程卡死
      this._pendingTimer = setTimeout(done, 8000);
    });
  },
  cancel() {
    if (this._supported) speechSynthesis.cancel();
    if (this._pendingDone) this._pendingDone();
    this._stopKeepAlive();
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
  maybeMigrate(level, entries);
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
// idle：还没开始/已结束；running：正在播放；paused：已暂停，等待"继续"
let sessionState = 'idle';
let pauseRequested = false;
let resumeSignal = null;

document.querySelectorAll('.recall-mode-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.recall-mode-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedMode = tab.dataset.mode;
  });
});

document.getElementById('recall-scope').addEventListener('change', (e) => {
  document.getElementById('recall-custom-picker').style.display = e.target.value === 'custom' ? 'block' : 'none';
});

const startBtn = document.getElementById('recall-start');

// 循环体里每个耗时步骤之间都要经过这里：如果用户点了"暂停"，就地挂起等"继续"，
// 不丢当前进度（第几张卡、第几遍朗读）；点"暂停"的同时会 RecallTTS.cancel()，
// 所以即使正卡在朗读中途也能立刻响应，不用等它自然读完。
async function checkpoint() {
  if (!pauseRequested) return;
  sessionState = 'paused';
  startBtn.textContent = '▶ 继续';
  await new Promise(resolve => { resumeSignal = resolve; });
}

startBtn.addEventListener('click', () => {
  if (sessionState === 'idle') {
    RecallTTS.unlock();
    startSession();
  } else if (sessionState === 'running') {
    pauseRequested = true;
    RecallTTS.cancel();
  } else if (sessionState === 'paused') {
    pauseRequested = false;
    sessionState = 'running';
    startBtn.textContent = '⏸ 暂停';
    const resolve = resumeSignal;
    resumeSignal = null;
    resolve();
  }
});

async function startSession() {
  sessionState = 'running';
  pauseRequested = false;
  startBtn.textContent = '⏸ 暂停';
  const stage = document.getElementById('recall-stage');

  try {
    const scope = document.getElementById('recall-scope').value;
    const customLevel = document.getElementById('recall-level').value;
    const customCategory = document.getElementById('recall-category').value;
    const gapSec = parseFloat(document.getElementById('recall-gap').value);

    const pool = shuffle(await buildPool(scope, customLevel, customCategory));
    stage.style.display = 'block';

    if (pool.length === 0) {
      stage.innerHTML = `<div class="recall-word">这个范围里还没有已学过的词</div>`;
      return;
    }

    for (let i = 0; i < pool.length; i++) {
      await checkpoint();
      const card = pool[i];

      // 先给一段纯回忆时间：不显示单词/假名/释义、不朗读，让用户自己先想
      stage.innerHTML = `<div class="recall-progress">${i + 1} / ${pool.length} · 回忆中…</div>`;
      await sleep(gapSec * 1000);
      await checkpoint();

      stage.innerHTML = `
        <div class="recall-word">${card.word}</div>
        <div class="recall-kana">${card.word !== card.kana ? card.kana : ''}</div>
        <div class="recall-meaning" id="recall-meaning"></div>
        <div class="recall-progress">${i + 1} / ${pool.length}</div>
      `;
      // 不管看着复习还是听力复习，日语都读满3遍；看着复习在第3遍开始时同步显示中文；
      // 听力复习读完3遍日语后，再额外读一遍中文释义作为收尾确认
      for (let rep = 0; rep < 3; rep++) {
        await checkpoint();
        if (rep === 2 && selectedMode === 'visual') {
          document.getElementById('recall-meaning').textContent = (card.meanings && card.meanings[0]) || '';
        }
        await RecallTTS.speak(card.kana, 'ja-JP');
        await checkpoint();
        if (selectedMode === 'audio' && rep < 2) await sleep(gapSec * 1000);
      }
      await checkpoint();
      if (selectedMode === 'audio') {
        await sleep(gapSec * 1000);
        await checkpoint();
        const meaning = (card.meanings && card.meanings[0]) || '';
        await RecallTTS.speak(meaning, 'zh-CN');
      }
      await checkpoint();
      await sleep(400);
    }
    stage.innerHTML = `<div class="recall-word">🎉 本轮完成</div>`;
  } catch (err) {
    console.error('回忆模式出错', err);
    stage.style.display = 'block';
    stage.innerHTML = `<div class="recall-word">出错了，已停止</div><div class="recall-progress">${err.message || err}</div>`;
  } finally {
    // 不管是正常读完、中途出错，还是取词范围没有内容，都必须回到 idle，
    // 否则按钮会永远卡在"暂停"上，点了没反应——这正是之前的 bug。
    RecallTTS.cancel();
    sessionState = 'idle';
    pauseRequested = false;
    resumeSignal = null;
    startBtn.textContent = '开始';
  }
}
