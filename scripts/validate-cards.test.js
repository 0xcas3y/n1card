import { test } from 'node:test';
import assert from 'node:assert';
import { validate } from './validate-cards.js';

test('validate is a function', () => {
  assert.equal(typeof validate, 'function');
});

test('rejects missing version', () => {
  const r = validate({ cards: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('version')));
});

test('rejects missing cards array', () => {
  const r = validate({ version: 1 });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('cards')));
});

test('accepts empty valid root', () => {
  const r = validate({ version: 1, cards: [] });
  assert.equal(r.ok, true);
});

const validCard = {
  id: 1, word: "承る", kana: "うけたまわる",
  accent: "5", type: "五段",
  meanings: ["敬悉"], mnemonic: "受け+玉+割る⇒承る",
  examples: [
    { jp: "ご注文を承りました。", cn: "您的订单我收到了。" },
    { jp: "お話を承ります。", cn: "请讲，我恭听。" }
  ]
};

test('accepts a valid card', () => {
  const r = validate({ version: 1, cards: [validCard] });
  assert.equal(r.ok, true, r.errors.join('; '));
});

test('rejects card without id', () => {
  const { id, ...rest } = validCard;
  const r = validate({ version: 1, cards: [rest] });
  assert.equal(r.ok, false);
});

test('rejects examples.length !== 2', () => {
  const bad = { ...validCard, examples: [validCard.examples[0]] };
  const r = validate({ version: 1, cards: [bad] });
  assert.equal(r.ok, false);
});

test('rejects non-hiragana kana', () => {
  const bad = { ...validCard, kana: "ウケタマワル" };
  const r = validate({ version: 1, cards: [bad] });
  assert.equal(r.ok, false);
});

test('rejects duplicate ids', () => {
  const r = validate({ version: 1, cards: [validCard, validCard] });
  assert.equal(r.ok, false);
});

test('rejects empty mnemonic (whitespace only)', () => {
  const bad = { ...validCard, mnemonic: "   " };
  const r = validate({ version: 1, cards: [bad] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('mnemonic')));
});

test('rejects meaning with empty string', () => {
  const bad = { ...validCard, meanings: ["valid meaning", ""] };
  const r = validate({ version: 1, cards: [bad] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('meanings')));
});
