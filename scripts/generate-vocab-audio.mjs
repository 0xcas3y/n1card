#!/usr/bin/env node
// 批量把单词卡片的读音(kana)和例句(examples[].jp)生成语音，
// 存到 data/audio/{level}-{category}-{id}-w.mp3 (读音) / -e{index}.mp3 (例句)。
// 用法: node scripts/generate-vocab-audio.mjs
// 需要先跑过: gcloud auth application-default login
//
// 注意: Text-to-Speech API 默认配额是"每分钟1000次请求"(每个项目)，
// 这里做了限速(每秒最多 RATE_PER_SEC 次)+ 429/RESOURCE_EXHAUSTED 自动重试，
// 已经生成过的文件会自动跳过，中断后重跑不会重复计费。
'use strict';

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { LEVEL_CATEGORY_FILES } from '../plan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const VOICE = 'ja-JP-Neural2-B';
const PROJECT = 'jlptcard';
const RATE_PER_SEC = 12; // 12*60=720/分钟，留出余量，配额上限是1000/分钟
const CONCURRENCY = 6;

function getAccessToken() {
  return execSync('gcloud auth application-default print-access-token', { encoding: 'utf8' }).trim();
}

let TOKEN = getAccessToken();
let tokenFetchedAt = Date.now();
function currentToken() {
  if (Date.now() - tokenFetchedAt > 45 * 60 * 1000) {
    TOKEN = getAccessToken();
    tokenFetchedAt = Date.now();
  }
  return TOKEN;
}

// 简单限速: 记录最近1秒内发出的请求时间戳，超过 RATE_PER_SEC 就等待
const recentTimestamps = [];
async function throttle() {
  while (true) {
    const now = Date.now();
    while (recentTimestamps.length && now - recentTimestamps[0] > 1000) recentTimestamps.shift();
    if (recentTimestamps.length < RATE_PER_SEC) {
      recentTimestamps.push(now);
      return;
    }
    await new Promise(r => setTimeout(r, 1000 - (now - recentTimestamps[0]) + 5));
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function synthesize(text) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken()}`,
        'x-goog-user-project': PROJECT,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: 'ja-JP', name: VOICE },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return Buffer.from(data.audioContent, 'base64');
    }
    const body = await res.text();
    // 配额超限(429/RESOURCE_EXHAUSTED)是暂时性的，退避后重试；其他错误直接抛出
    if (res.status === 429 || body.includes('RESOURCE_EXHAUSTED')) {
      const backoff = 2000 * (attempt + 1);
      await sleep(backoff);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  throw new Error('超过重试次数仍然配额超限');
}

// 收集所有要生成的任务: {outPath, text}
function collectJobs() {
  const outDir = path.join(ROOT, 'data', 'audio');
  fs.mkdirSync(outDir, { recursive: true });
  const jobs = [];
  for (const [level, registry] of Object.entries(LEVEL_CATEGORY_FILES)) {
    for (const [category, relPath] of Object.entries(registry)) {
      const filePath = path.join(ROOT, relPath);
      const { cards } = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const c of cards) {
        const base = `${level}-${category}-${c.id}`;
        const word = c.kana || c.word;
        if (word && word.trim()) {
          jobs.push({ outPath: path.join(outDir, `${base}-w.mp3`), text: word });
        }
        (c.examples || []).forEach((ex, i) => {
          if (ex.jp && ex.jp.trim()) {
            jobs.push({ outPath: path.join(outDir, `${base}-e${i}.mp3`), text: ex.jp });
          }
        });
      }
    }
  }
  return jobs;
}

async function worker(jobs, state) {
  while (state.idx < jobs.length) {
    const job = jobs[state.idx++];
    if (fs.existsSync(job.outPath)) { state.skipped++; continue; }
    try {
      const audio = await synthesize(job.text);
      fs.writeFileSync(job.outPath, audio);
      state.generated++;
    } catch (err) {
      state.failed++;
      console.error(`\n失败 ${job.outPath}: ${err.message}`);
    }
    const done = state.generated + state.skipped + state.failed;
    if (done % 50 === 0 || done === jobs.length) {
      process.stdout.write(`\r生成 ${state.generated}, 跳过 ${state.skipped}, 失败 ${state.failed} / 共 ${jobs.length}   `);
    }
  }
}

async function main() {
  const jobs = collectJobs();
  console.log(`共 ${jobs.length} 条待生成音频 (并发 ${CONCURRENCY}, 限速 ${RATE_PER_SEC}/秒)`);
  const state = { idx: 0, generated: 0, skipped: 0, failed: 0 };
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(jobs, state)));
  console.log(`\n完成。生成 ${state.generated}，跳过(已存在) ${state.skipped}，失败 ${state.failed}，共 ${jobs.length} 条`);
  if (state.failed > 0) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exitCode = 1; });
