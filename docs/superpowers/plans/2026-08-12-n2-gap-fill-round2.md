# N2 词量补缺 Round 2（单源验证）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** N2 第一轮补缺后现有 1479 词，官方大纲粗估约 6000，缺口约 4521——仍然很大。第一轮用户明确要求"想接近官方"，决定放松验证标准换取更大词量：**从"jisho.org + Bunpro 双源核实、冲突保守排除"降级为"jisho.org 单源核实"**（用户在多个方案里选择了这个力度，理由：jisho本身就是业内最常用的权威词典，单独作为判据也说得过去）。

**背景数据（第一轮N2名词补缺的漏斗）**：1386个原始候选 → 全站去重后1161 → jisho单源核实后1005 → Bunpro双源确认后只剩338（667个"jisho说是N2但Bunpro没确认"的词被保守排除）。这次去掉Bunpro这一关，理论上名词一项就能从337追加到接近1005-已有重叠的规模。

**Architecture:** 复用第一轮已验证的方法论（WebSearch多源采集 + 全站零重叠去重 + subagent生成 + `npm run validate` 不改），唯一变化是等级核实降级为jisho.org单源。**这次采集要包含被第一轮Bunpro双源排除掉的词**（如果能重新获取那批候选），也要重新做一轮全新WebSearch采集（第一轮的source list不一定穷尽）。

**Tech Stack:** 纯前端静态站点、Node.js `--test`、WebSearch/WebFetch、Claude subagent。

## Global Constraints

- Schema不变，不改 `scripts/validate-cards.js`
- 拟声词 `word` 必须等于 `kana`
- 复合动词沿用动词schema：`type`+可选`transitivity`
- **例句难度**：N2等级，支撑词汇上限很宽松，允许出现N1词汇，不要收紧成"只能用N2以内词汇"
- **全站零重叠**：新词不能和任何现有 `data/cards*.json` 文件的 `word`/`kana`(同一词的写法变体，不含真正同音异形词)重复——这次基准是"第一轮N2补缺合并后"的全站词库，不是合并前
- **等级核实降级为单源**：只需要 jisho.org 明确打了对应等级标签（如 `jlpt-n2`）就收录，不再要求 Bunpro 二次确认。但如果 jisho 同一词条**同时**打了冲突的等级标签（比如同时有 jlpt-n1 和 jlpt-n2），仍然保守排除，不能凭感觉选一个
- 跨文件合法兼类词标准延续之前几轮：允许跨文件出现，生成阶段写不同例句
- 目标词量不预设强制指标，但这轮目标是尽量让实际产出接近官方估算的量级，不必像第一轮那样字字苛求，只要jisho标签清楚就收

## Task 1: 采集 N2 补缺词表 Round 2（动词/名词/形容词/副词/拟声词）

**Files:**
- Create: `data/raw-words-n2-verb-gap2.txt`、`-noun-gap2.txt`、`-adj-gap2.txt`、`-adverb-gap2.txt`、`-onomatope-gap2.txt`

- [ ] WebSearch 多源采集，尽量覆盖比第一轮更广的来源（除了JLPTsensei/tanos/MLC/nihongokyoshi-net，可以加入更多聚合站点、教材词表、Anki共享牌组描述等）
- [ ] 程序化排除全站（第一轮合并后的最新版本，约28+个 `cards*.json` 文件）已有词汇，word和kana双字段查重
- [ ] jisho.org 单源核实等级标签，同一词条冲突标签保守排除
- [ ] 词性自查 + 跨文件兼类词清单
- [ ] 写入文件，commit message写清楚各文件词条数

## Task 2: 生成 prompt

- [ ] 直接复用第一轮已有的prompt文件（`generate-batch-n2-noun.md`/`-adj-append.md`/`-adverb.md`/`-onomatope-append.md`/`generate-batch-n2-verb.md`），只在派发subagent时提醒"这是第一轮补缺后的第二轮补缺，全站零重叠基准已更新"

## Task 3: 生成 + 合并

- [ ] 按词性分批（40-60词/批）派发 subagent 生成
- [ ] 合并（追加类从现有最大id+1开始编号）
- [ ] `npm run validate`
- [ ] 跨文件重复例句检查（尤其跨文件兼类词）
- [ ] 全站零重叠复核
- [ ] 提交

## Task 4: 导航接入

- [ ] `index.html` N2 词量文案更新为本轮补缺后真实总数
- [ ] 验证其余等级无回归

## Task 5: 最终验证清单

- [ ] `npm test` / `npm run validate` exit 0
- [ ] 跨文件重复检查、全站零重叠复核都过
- [ ] 人工/subagent抽查内容质量
- [ ] 全分支 review（opus）通过
