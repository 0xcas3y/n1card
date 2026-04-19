# N1 动词洗脑速记卡片 — 设计文档

**日期**：2026-04-18
**目标用户**：自用（Mac + iPhone）
**参考**：小红书"疾风 N1 词"合集，单词卡视觉 + 关联记忆写法

---

## 1. 目标 & 约束

做一个纯静态 Web 应用，帮自己快速刷 N1 动词。核心体验：

- 卡片正反面切换，发音驱动记忆（单击发音、双击翻面）
- "洗脑模式"：单词连播 10 遍 + 每例句 2 遍，视觉脉冲闪烁，沉浸式灌耳朵
- 上下划手势在标记熟悉度的同时直接进下一张，零按钮干扰

**非目标（YAGNI）**：
- 多用户 / 账号 / 云同步
- 复杂 SRS（间隔重复）算法
- 生成分享图片 / 导出 PDF
- 每日目标 / 连续学习统计
- 后端 / 数据库

**硬约束**：
- 必须在 Mac Safari 和 iPhone Safari 上跑通
- TTS 用浏览器原生 Web Speech API，不依赖云端
- 无构建步骤，直接打开 `index.html` 或 `python3 -m http.server` 就能用

---

## 2. 架构

纯静态前端，无后端、无框架、无构建。

```
n1card/
├── index.html              # 单页入口
├── styles.css              # 卡片样式
├── app.js                  # 业务逻辑
├── data/
│   ├── raw-words.txt       # 原始词表（已存）
│   ├── cards.json          # 完整卡片数据（Claude 预生成）
│   └── cards.overrides.json # 用户编辑覆盖（localStorage 镜像）
├── scripts/
│   ├── generate-cards.md   # 生成 prompt / 流程记录
│   └── validate-cards.js   # 数据校验脚本（Node 跑）
└── docs/
    ├── superpowers/specs/2026-04-18-n1card-design.md  # 本文件
    └── testing-checklist.md
```

**模块边界**：

| 模块 | 职责 | 依赖 |
|---|---|---|
| `app.js::DataStore` | 加载 `cards.json`，合并 overrides，提供 `getCard(id)` / `allCards()` | fetch |
| `app.js::Progress` | 读写 localStorage，`mark(id, status)`、`stats()`、`filter(mode)` | localStorage |
| `app.js::TTSEngine` | 封装 Web Speech API，`speak(text, {rate, onEnd})`，队列管理 | SpeechSynthesis |
| `app.js::CardView` | 渲染单张卡片（正/反），绑定点击/双击/滑动 | DOM |
| `app.js::BrainwashMode` | 洗脑序列编排（10×word + 2×ex1 + 2×ex2 + 叮声 + 闪烁） | TTSEngine, CardView |
| `app.js::Router` | 当前卡 id、切卡、筛选、洗脑状态的全局状态 | 以上所有 |

每个模块是一个对象字面量或 class，互相通过方法调用，没有事件总线。文件就一个 `app.js`——小项目不值得拆多文件。

---

## 3. 数据模型

### 3.1 卡片 Schema

```typescript
{
  id: number,              // 1-based，对应 raw-words.txt 去重后的序号
  word: string,            // 日文汉字（或假名本身），如 "承る"
  kana: string,            // 平假名，如 "うけたまわる"
  accent: string | null,   // 声调数字，如 "5"；未知时 null
  type: string | null,     // 动词类型："五段" / "一段" / "サ变" / "カ变"
  meanings: string[],      // 中文注释，1-4 条
  mnemonic: string,        // 关联记忆（汉字拆解联想）
  examples: [              // 固定 2 条
    { jp: string, cn: string },
    { jp: string, cn: string }
  ]
}
```

`cards.json` 是 `{ "version": 1, "cards": [...] }`。

### 3.2 localStorage Schema

```typescript
{
  progress: {
    [cardId: string]: {
      status: "known" | "unknown",
      lastSeen: number  // unix ms
    }
  },
  settings: {
    filter: "all" | "unknown_only" | "unseen_only" | "random",
    ttsRate: number,       // 默认 0.9
    lastCardId: number     // 上次位置
  },
  overrides: {
    [cardId: string]: Partial<Card>  // 用户编辑后的覆盖
  }
}
```

key 前缀统一 `n1card:`，如 `n1card:progress`, `n1card:settings`, `n1card:overrides`。

### 3.3 去重策略

`raw-words.txt` 有 435 条，393 唯一。生成前按出现顺序去重（保第一次出现），连续编号为 `id`。去重脚本写在 `scripts/validate-cards.js` 里。

---

## 4. 卡片视觉

### 4.1 正面

- 纯色背景，每次切卡时从 6 色池随机挑一个（卡片的颜色不固定，每次看都可能不同）；翻面时正反面保持同色（一次"切卡 → 随机一次色"）
- 中央大号汉字，字号 ~110px（手机端 ~80px），白色，字重 600
- 右上角编号圈：2px 白色描边圆，数字居中
- 底部极小字灰白提示："单击发音 · 双击翻面"（低透明度，使用一段时间后可考虑关掉）

### 4.2 背面

- 同一背景色
- 顶部小字重复单词 + 假名 + 声调（单击可发音）
- 三段内容：
  - **注释**：编号 ①②③
  - **关联记忆**：一行拆解，支持 `⇒` 符号
  - **例句**：2 条，日文一行 + 中文小字一行，每行独立可点击发音（视觉上 hover 有轻微高亮）
- 底部提示："双击翻回正面"

### 4.3 颜色池

```css
card-blue:   #5A9AD4
card-green:  #4FA896
card-purple: #8A6FB8
card-coral:  #D97B5F
card-teal:   #3E8A9E
card-pink:   #C75F87
```

白色文字在这 6 色上对比度均 ≥ 4.5:1（WCAG AA）。

### 4.4 字体

```
font-family: "Hiragino Sans", "Yu Gothic", "PingFang SC", -apple-system, sans-serif;
```

Mac / iOS 原生字体栈，不引 webfont。

---

## 5. 交互

### 5.1 手势（卡片上）

| 手势 | 正面行为 | 背面行为 |
|---|---|---|
| 单击卡片中央 / 汉字 | 播放单词 TTS | 播放单词 TTS |
| 单击例句行（背面） | — | 播放该例句 TTS |
| 双击 | 翻到背面 | 翻回正面 |
| 上划 | 标记为"不熟" + 进下一张 | 同左 |
| 下划 | 标记为"已掌握" + 进下一张 | 同左 |

**手势实现细节**：
- 单击 vs 双击：200ms 窗口区分，点击例句行时禁用双击（避免误触）
- 上/下划：Pointer Events，阈值 40px + 速度 > 0.3px/ms
- Mac 上键盘快捷键：`Space` 翻面，`↑` 不熟，`↓` 已记住，`P` 播放
- iOS Safari 兼容：
  - viewport meta：`user-scalable=no, maximum-scale=1`（禁双击缩放）
  - CSS：卡片上 `touch-action: manipulation`（消除 300ms 延迟）+ `user-select: none`（禁文字选择）+ `-webkit-user-select: none`+ `-webkit-touch-callout: none`（禁长按菜单）

### 5.2 顶部状态栏

```
┌─────────────────────────────────────────────────────────────┐
│  N1 动词速记   5 / 393      已掌握 12 · 待巩固 8   [筛选▾][🧠]│
└─────────────────────────────────────────────────────────────┘
```

洗脑模式激活时，中间的统计区被**当前播放中的例句日文**临时替换。

**筛选下拉**：全部 / 只看待巩固 / 只看未学过 / 随机乱序

**设置入口**：长按 🧠 按钮弹出设置面板（TTS 语速、清空学习记录）

### 5.3 编辑面板

入口：设置面板里的"编辑当前卡"按钮（避免在卡片上长按——iOS Safari 长按默认会触发文字选择和系统菜单，冲突不可靠）。

可改字段：`meanings`、`mnemonic`、`examples`，保存写入 `localStorage` 的 `overrides`。

不改原始 `cards.json`。"导出 overrides" 按钮把修改批量导出成 JSON 让你回流到仓库。

---

## 6. 洗脑模式

### 6.1 进入 / 退出

- 点顶部 🧠 → 全屏接管，当前卡片继续显示为正面
- 退出：再点 🧠，或点顶部 × 按钮，或按 `Esc`

### 6.2 播放序列（一张卡）

```
单词 × 10 遍（每遍之间 ~0.4s）
  每遍发音时：汉字脉冲闪烁（scale 1.0 → 1.08 → 1.0，300ms）
 → 叮分隔音（轻木鱼/铃，150ms）
 → 例句 1 × 2 遍
  顶部状态栏临时显示该例句日文
 → 叮
 → 例句 2 × 2 遍
  顶部状态栏临时显示该例句日文
 → 停顿 800ms
 → 自动进下一张（按当前筛选顺序，不改变 progress）
```

到筛选集合末尾后循环回头，直到用户退出。

### 6.3 手势（洗脑模式中）

- 上/下划 → 立即跳下一张，从新序列开始（不影响 progress）
- 双击 → 暂停 / 继续
- 点 🧠 或 Esc → 退出

### 6.4 音频实现

- 单词和例句：`SpeechSynthesisUtterance` 日语语音
- 叮分隔音：WebAudio API 生成一个短促正弦波（440Hz + 880Hz 叠加，80ms 衰减），零依赖、不需音频文件
- 整个序列用 async/await + 可中断的 Promise 链实现，退出时 `speechSynthesis.cancel()`

### 6.5 配比

固定 `10 × word + 2 × 每例句`，不做可调。用熟了再考虑加设置。

---

## 7. 进度 & 会话

### 7.1 写入时机

- 上/下划 → 立即写 `progress[id]`
- 切卡、洗脑自动推进 → 写 `settings.lastCardId`
- 编辑保存 → 写 `overrides[id]`

### 7.2 筛选实现

筛选器只决定"可见卡片列表"，不影响已标记状态。切换筛选时当前卡位置尽量保留（如果当前卡仍在新列表里就留着，否则定位到新列表第一张）。

### 7.3 重置

设置面板有"清空学习记录"按钮，二次确认后清 `progress` 和 `settings.lastCardId`，保留 `overrides`。

---

## 8. 数据生成策略

### 8.1 两阶段

**阶段 1 — 骨架批量生成**
- Claude 按固定 prompt 模板，每批 ~30 词，产 `cards.draft.json`
- prompt 包含卡片 schema + 参考例子（承る 那张）+ 质量要求
- 14 批跑完 393 词

**阶段 2 — MVP 先行**
- **先只生成 30 词**跑通全链路（TTS、洗脑、进度、手势、筛选）
- 跑通后再跑剩下 360 词，避免格式返工

### 8.2 质量控制

- 每批生成后抽查 3-5 个高频难词（承る、賜る、携わる、蔑む、弁える 等）手工校对
- 关联记忆要求：汉字拆解 + 箭头符号（如 `受け + 玉 + 割る ⇒ 承る`），而非空泛的意译联想
- 例句要求：N1 语感，非儿童级
- `scripts/validate-cards.js` 校验：必填字段、examples.length===2、无空字符串、读音格式合法（仅平假名）

### 8.3 更新路径

`cards.json` 是权威源；用户通过 App 内编辑的写到 `overrides`；想固化就用"导出 overrides"生成 patch 回流到仓库（手工合并到 `cards.json`）。

---

## 9. 错误处理

| 场景 | 行为 |
|---|---|
| 浏览器不支持 Web Speech API | 顶部黄色提示条"当前浏览器不支持发音"，TTS 点击无反应，其余功能正常 |
| 日语语音不可用（Windows Chrome 某些情况） | 自动退化到默认声音，提示"日语语音不可用，发音质量可能受影响" |
| localStorage 禁用（隐私模式） | 顶部提示"当前模式下进度不会保存"，内存里维持状态 |
| `cards.json` fetch 失败 | 全屏错误页 + 重试按钮 |
| TTS utterance 卡住 / 失败 | 跳过该条，继续下一步；连续 3 次失败提示用户 |

---

## 10. 测试

### 10.1 数据校验

`scripts/validate-cards.js`（Node，零依赖）：
- 每张卡必填字段齐全
- `examples.length === 2`
- `kana` 仅平假名
- `id` 连续无跳号无重复
- 生成后、提交前手动跑

### 10.2 手动测试清单

`docs/testing-checklist.md`，在 Mac Safari + iPhone Safari 两设备上跑：

- [ ] 初次加载，随机 6 色展示正常
- [ ] 单击卡片：正面播单词 / 背面播单词
- [ ] 双击：正→背、背→正
- [ ] 背面单击例句行：只播该句
- [ ] 上划：标记不熟 + 进下一张，刷新后 `已掌握/待巩固` 计数正确
- [ ] 下划：同上，已掌握 + 1
- [ ] 洗脑模式：10 次单词闪烁节奏对，叮分隔，例句顶部显示，自动推进
- [ ] 洗脑中上下划能跳卡
- [ ] 筛选 "只看待巩固"：列表正确，切换后不白屏
- [ ] 清空学习记录：progress 归零，overrides 保留
- [ ] 刷新页面：从 `lastCardId` 恢复
- [ ] 编辑面板：修改保存后，重新进入该卡能看到修改

### 10.3 不做的测试

- 单元测试 / E2E 框架：项目太小，手动清单 + 校验脚本够用
- 跨浏览器兼容：Chrome / Firefox / Edge 不做硬性保证

---

## 11. 未来可能扩展（不在本 spec 范围）

记录下来防止忘，但**不做**：

- SRS 算法（Leitner / SM-2）
- 分组 / 章节（按五十音、按难度、按主题）
- 导出分享图（小红书风格）
- 例句朗读跟读打分
- 多端同步
- 名词 / 形容词 / 副词扩展

---

## 12. 里程碑

1. 生成前 30 词 `cards.json` + 校验脚本
2. `index.html` + `app.js` 骨架，能加载 json，渲染一张静态卡
3. 手势交互（单击/双击/上下划）
4. TTS + 背面例句单击播放
5. 进度 localStorage + 筛选器
6. 洗脑模式（含闪烁、叮音、自动推进）
7. 编辑面板
8. 生成剩余 360+ 词
9. Mac + iPhone 手动测试通过
10. 部署 GitHub Pages（仓库 settings → Pages → main 分支根目录），iPhone Safari 从公网地址访问实测

每步都可独立验证。
