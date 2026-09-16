#!/usr/bin/env node
// 批量把 grammar/data/examples-*.json 里的日语例句生成语音，存到 grammar/audio/{level}/{id}.mp3
// 用法: node scripts/generate-grammar-audio.js
// 需要先跑过: gcloud auth application-default login
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const VOICE = 'ja-JP-Neural2-B';
const PROJECT = 'jlptcard';
const LEVELS = ['n1', 'n2', 'n3', 'n4', 'n5'];
const ROOT = path.join(__dirname, '..');

function getAccessToken() {
  return execSync('gcloud auth application-default print-access-token', { encoding: 'utf8' }).trim();
}

async function synthesize(token, text) {
  const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-goog-user-project': PROJECT,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: 'ja-JP', name: VOICE },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  const data = await res.json();
  return Buffer.from(data.audioContent, 'base64');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  let token = getAccessToken();
  let tokenFetchedAt = Date.now();

  let total = 0, generated = 0, skipped = 0, failed = 0;

  for (const lvl of LEVELS) {
    const dataPath = path.join(ROOT, 'grammar', 'data', `examples-${lvl}.json`);
    const items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const outDir = path.join(ROOT, 'grammar', 'audio', lvl);
    fs.mkdirSync(outDir, { recursive: true });

    for (const item of items) {
      total++;
      const outPath = path.join(outDir, `${item.id}.mp3`);
      if (fs.existsSync(outPath)) { skipped++; continue; }

      // access token 大约1小时过期，跑得久就刷新一下
      if (Date.now() - tokenFetchedAt > 45 * 60 * 1000) {
        token = getAccessToken();
        tokenFetchedAt = Date.now();
      }

      try {
        const audio = await synthesize(token, item.e);
        fs.writeFileSync(outPath, audio);
        generated++;
        process.stdout.write(`\r${lvl} ${item.id}: 生成 ${generated}, 跳过 ${skipped}, 失败 ${failed} / 共 ${total}   `);
      } catch (err) {
        failed++;
        console.error(`\n${lvl} id=${item.id} 失败: ${err.message}`);
      }
      await sleep(50); // 轻微限速，别把 QPS 打太猛
    }
  }

  console.log(`\n完成。生成 ${generated}，跳过(已存在) ${skipped}，失败 ${failed}，共处理 ${total} 条`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
