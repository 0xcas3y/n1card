import { test } from 'node:test';
import assert from 'node:assert';
import { toggleFavorite, isFavorited, Favorites } from '../favorites.js';

// Favorites 单例在这个 Node 测试环境里用的是真的全局 localStorage，但 Node(本项目锁定的版本)
// 默认没开 --experimental-webstorage，所以 localStorage.getItem/setItem 实际会抛 TypeError——
// 好在 favorites.js 的 load()/_save() 本来就 try/catch 包着，抛了就静默退化成纯内存的 _map，
// 完全不影响下面要测的东西：护栏(falsy compositeId 不建条目)和 all() 是否返回拷贝，
// 这两者测的都是 Favorites 对象自己的方法逻辑，跟 localStorage 能不能真正持久化无关。
// 每个 test 开始前手动清空 _map，避免单例状态在测试之间串台。
function resetFavorites() {
  Favorites._map = {};
}

test('toggleFavorite: 第一次收藏 → 加进map，带上addedAt', () => {
  const next = toggleFavorite({}, 'n1:verb:5', 1000);
  assert.deepStrictEqual(next, { 'n1:verb:5': { addedAt: 1000 } });
});

test('toggleFavorite: 已收藏的再收藏一次 → 从map里移除(取消收藏)', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 } };
  const next = toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(next, {});
});

test('toggleFavorite: 不影响map里其他key', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 }, 'n2:noun:9': { addedAt: 500 } };
  const next = toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(next, { 'n2:noun:9': { addedAt: 500 } });
});

test('toggleFavorite: 不做原地修改，传入的原map保持不变', () => {
  const start = { 'n1:verb:5': { addedAt: 1000 } };
  toggleFavorite(start, 'n1:verb:5', 2000);
  assert.deepStrictEqual(start, { 'n1:verb:5': { addedAt: 1000 } });
});

test('isFavorited: 存在的compositeId → true', () => {
  assert.strictEqual(isFavorited({ 'n1:verb:5': { addedAt: 1000 } }, 'n1:verb:5'), true);
});

test('isFavorited: 不存在的compositeId → false', () => {
  assert.strictEqual(isFavorited({ 'n1:verb:5': { addedAt: 1000 } }, 'n2:noun:9'), false);
});

// Finding 2a: Favorites 对象自己的方法要挡住 falsy compositeId(主要是 undefined)，
// 不能让调用方(比如没在 plan.js 里登记 compositeId 的页面)意外写进一个字面量 "undefined" key。
test('Favorites.toggle(undefined): 返回false，且不往map里写入"undefined"这个key', () => {
  resetFavorites();
  const result = Favorites.toggle(undefined);
  assert.strictEqual(result, false);
  assert.deepStrictEqual(Favorites.all(), {});
});

test('Favorites.toggle(null/空字符串): 同样当成falsy挡住', () => {
  resetFavorites();
  assert.strictEqual(Favorites.toggle(null), false);
  assert.strictEqual(Favorites.toggle(''), false);
  assert.deepStrictEqual(Favorites.all(), {});
});

test('Favorites.remove(undefined): 不抛异常，也不影响已有数据', () => {
  resetFavorites();
  Favorites.toggle('n1:verb:5');
  assert.doesNotThrow(() => Favorites.remove(undefined));
  assert.deepStrictEqual(Favorites.all(), { 'n1:verb:5': { addedAt: Favorites.all()['n1:verb:5'].addedAt } });
});

test('Favorites.isFavorited(undefined): 返回false，不会因为"undefined"key误判为已收藏', () => {
  resetFavorites();
  assert.strictEqual(Favorites.isFavorited(undefined), false);
});

test('Favorites.toggle: 传入真实compositeId仍正常工作(护栏不影响正常路径)', () => {
  resetFavorites();
  const added = Favorites.toggle('n1:verb:5');
  assert.strictEqual(added, true);
  assert.strictEqual(Favorites.isFavorited('n1:verb:5'), true);
  const removed = Favorites.toggle('n1:verb:5');
  assert.strictEqual(removed, false);
  assert.strictEqual(Favorites.isFavorited('n1:verb:5'), false);
});

// Finding 4: all() 返回的必须是拷贝，不是内部_map的引用——拿到返回值之后修改它，
// 不能影响Favorites自己后续的内部状态。
test('Favorites.all(): 返回的是拷贝，调用方修改返回值不会污染内部_map', () => {
  resetFavorites();
  Favorites.toggle('n1:verb:5');
  const snapshot = Favorites.all();
  snapshot['n2:noun:9'] = { addedAt: 999 };  // 调用方手贱改了拿到的对象
  delete snapshot['n1:verb:5'];
  assert.deepStrictEqual(Favorites.all(), { 'n1:verb:5': { addedAt: Favorites.all()['n1:verb:5'].addedAt } });
});

test('Favorites.all(): 两次调用返回的是不同的对象实例', () => {
  resetFavorites();
  Favorites.toggle('n1:verb:5');
  assert.notStrictEqual(Favorites.all(), Favorites.all());
});
