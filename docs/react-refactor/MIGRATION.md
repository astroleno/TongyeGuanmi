# 复用与退役清单：旧 Vanilla 站 → Cinematic Story Runtime

入口文档：`README.md`。配套文档：`ARCHITECTURE.md`（目标架构）、`ROADMAP.md`（执行阶段），阶段执行清单见 `goals/`。

定位：**这不是迁移映射**。新 runtime 是完全重新设计（ARCHITECTURE §0），旧代码不作为翻译对象。落地盘点以 `main` 为事实基线，`codex/state-machine-refactor-roadmap` 及其他实验分支只能作为参考资料库。本文档回答三个问题：旧站里**什么值得搬**、**什么整体丢弃**、**并行期与切换怎么走**。

## 前置：分支基线

执行分支从干净 `main` 开，不从 state-machine / scene-runtime 实验分支继承代码：

```txt
main
  └── codex/react-refactor-plan
        └── codex/react-refactor-r-1-inventory
              └── codex/react-refactor-r0-scaffold
                    └── codex/react-refactor-r1-runtime-skeleton
```

规则：

- `main` 是 R-1 inventory 的唯一仓库事实源：`src/sections/*.html`、`src/section-manifest.mjs`、独立 scene/transition 页面、assets。
- `codex/state-machine-refactor-roadmap` 中的 runtime、检查脚本、文档可以被 R-1 记录为“历史实验/教训”，但不得直接合入 `app/`。
- 如果需要复用某个实验分支里的 renderer 修正，必须在 R-1 inventory 中登记来源，再在对应 R3/R4 scene 分支按新契约重搬。
- `docs/react-refactor/` 先在 `codex/react-refactor-plan` 提交，后续阶段分支都从该规划提交继续。

## 0. R-1 实况盘点产物

R0 前必须先生成 `migration-inventory.json` 与人工可读表格，避免把旧主干的 8 个粗粒度 transition 误当成新 runtime 的真实 story spine。

盘点字段：

| 字段 | 来源 |
|---|---|
| `sectionId` / `hashId` | `src/index.template.html`、`src/sections/*.html` |
| `sceneId` / `segmentId` | ARCHITECTURE §3.1 canonical spine + R-1 正名表 |
| `adapterModule` | transition registry 与旧 `data-transition-module` |
| `oldTransitionId` / `oldHandoffId` | `src/section-manifest.mjs`、构建后的 transition host |
| `copySource` | `src/sections/*.html` 与构建产物提取文本 |
| `mediaAssets` / `rendererAssets` | adapter import、DOM `src`、CSS url |
| `policySeed` | 旧 `stageStops`、`stagePlayMs`、`postScrollVh`、handoffPhase、duration 等参数 |

R-1 的输出不是实现代码，但它是 `story/manifest.ts`、copy baseline、迁移验收和并行 worktree 拆分的唯一事实源。

## 1. 复用清单（素材库）

判据：**能从单一 progress 幂等渲染的算法/数据 → 搬；与文档流底座耦合的编排/机制 → 弃**。

### 1.1 Renderer 算法（逐个搬进 `scenes/<id>/renderer/`）

| 旧 adapter | 搬运物 | 目标 scene |
|---|---|---|
| `pattern-bloom-adapter.js` | canvas 绘制算法、阈值区间表 | `scenes/pattern/` |
| `starmap-scene-provider.js` / belief star field 相关代码 | star-map renderer 与静态终态 | `scenes/star-map/` |
| `aod-homepage-adapter.js` | video 编排（loadedmetadata/canplay/ended 里程碑链） | `scenes/aod-animation/` |
| `figure2-homepage-adapter.js` | camera-expand、远景扩散、横拱 proof 状态 | `scenes/figure2-animation/` + `scenes/figure2-proof-*` |
| `figure3-homepage-adapter.js` | 视觉渲染部分 | `scenes/figure3-animation/` |
| `ttg-homepage-adapter.js` / `ph-homepage-adapter.js` / `crane-homepage-adapter.js` | 视觉渲染部分 | `scenes/ttg-animation/` / `scenes/ph-animation/` / `scenes/crane-animation/` |

搬运方式：抽出"progress → 画面"的纯渲染函数，包装成 scene 的 `buildIntro/buildOutro` 或 renderer 类；adapter 中与 frame 契约（copyOwner/visualOwner/phase）耦合的编排代码一律不搬。

### 1.2 数据与文案

| 来源 | 用途 |
|---|---|
| `src/section-manifest.mjs` | `story/manifest.ts` 的**粗粒度数据种子**：旧 `main` 只有 sections / chapterTransitions，不是最终 spine。R0.0 必须按 ARCHITECTURE §3.1 展开 canonical scene/segment |
| `src/sections/*.html` | 各 `scenes/<id>/Component.tsx` 的文案来源，**逐字搬运** |
| copy baseline | R-1/R0 从 `src/sections/*.html` 和当前构建产物生成 `copy-reference.json` / `homepage-reference.mjs`。如果仓库已有 `src/copy/homepage-reference.mjs`，也只视为生成基准，不作为手写事实源 |
| 媒体资产（video/图片/字体） | 原样复用，路径进 `scenes/<id>/assets.ts` |

### 1.2.1 命名与顺序固定

新 manifest 的 canonical scene id 只能使用：

```txt
hero
pattern
star-map
aod-animation
method-top
method-bottom
figure2-animation
figure2-proof-opening
figure2-proof-cards
figure2-proof-closing
brand
figure3-animation
services
ttg-animation
lab
ph-animation
education
crane-animation
contact
```

旧 `main` 映射规则：

- `home-belief` 不再等价于一个 segment；它展开为 `hero → pattern → star-map`。
- `belief-method` 展开为 `star-map → aod-animation → method-top`，并保留 `copyCue.atProgress = 0.8`。
- `method` 收敛为一个 `method-top` reading hold：intro 与五步列表同属一个 scene，左侧锁定，右侧原生滚动；不再创建 `method-top-method-bottom` handoff。
- `method-proof-brand` 展开为 `method-top → figure2-animation → figure2-proof-opening → figure2-proof-cards → figure2-proof-closing → brand`；`method-bottom-figure2` 仅保留历史 segment id。
- `figure2-distance-expand` 固定为 `figure2-animation → figure2-proof-opening` 的 segment，不是 scene；它由 R-1 从旧 adapter progress 区间和 `method-proof` DOM anchor 反推。
- 旧数据里的 `stageStops/stagePlayMs/stageHoldVh/postScrollVh` 必须从 `src/sections/method.html` 与 figure2 adapter 事实提取；不得把“stagedSnap 4 段”当作现成数据事实。
- `brand-services`、`crane-contact` 均保留“动画 80% 目标文案提前入场”的 copy cue。
- `ttg-lab`、`lab-ph`、`ph-education` 都由上到下推进；`lab-ph` 不再叠加太阳点径向扩散。

### 1.3 UX 参数（manifest 默认值）

蓄力阈值 0.1（10vh）、衰减 0.001/ms、settling 420ms、recovery 超时表（MEDIA_READY 1800ms 等）、各 segment 时长。全部进 `story/manifest.ts`，可调但初值不变。

### 1.4 不变量与教训（进测试与 ESLint，不进代码）

| 旧站教训 | 新站承接方式 |
|---|---|
| 文案二次入场 | R0 先用 fixture + review checklist + Stage 可见性测试约束 mount 自淡入；R2 Stage 契约稳定后再升 ESLint error。可见性只归 transition timeline（ARCHITECTURE §6.2） |
| 交接空白帧 / 黑闪 | Playwright settling 前后逐帧断言（§8.1 不变量） |
| Ink 边界出现直线/双轮廓 | `to` 帧直接进入既有 curtain shader，`body` 是唯一 mask；禁止 CSS clip/mask 与自绘 polygon；连续 Stage 额外验证 canvas live remount |
| progress 幂等渲染（Phase 4 遗产） | 每个 cinematic scene `0→1→0→1` 快照进 harness |
| 滚动锁多 owner 互踩 | 新设计无全局滚动锁（虚拟滚动底座），仅 inert 单一入口 |
| 资产失败吞输入 | recovering 状态契约：`jumpToEnd` 落位，永不锁死（§5） |
| 输入归一化用例 | `input-normalizer` / `charge` 的 Vitest 用例翻译沿用（纯函数，数值不变） |

## 2. 整体退役清单（不迁移、不翻译）

以下随旧站一起冻结 → 归档，新 runtime 中**没有等价物**（其存在理由已被单 Stage 底座消除）：

- `js/runtime/homepage-snap-runtime.js`（旧 FSM）—— 新 Director 是职责更窄的全新机（§5），不做 1:1 移植。
- `js/runtime/homepage-runtime-integration.js`、`js/runtime/timed-progress-driver.js` —— scenePresenter / driver 概念由 SegmentPlayer + GSAP 承担。
- `js/transitions/homepage/scene-timeline-controller.js` 全套（beginJoin/commitTarget/presentTarget、copyOwner、fixed copy 几何同步、reveal gate）—— copy ownership 概念整体消失。
- `js/transitions/homepage/scene-timeline-frame.js` —— frame 契约退役；可观测性由 machine state + HUD 提供。
- `js/transitions/homepage-transition-runtime.js` 与 `?legacyRuntime=1` / `?snapRuntime=0` 双路径。
- `js/vendor/lenis.min.js` —— Lenis 不再是核心依赖；阅读区用原生 overflow。
- 旧 `scripts/check-*.mjs` 静态验证脚本家族 —— 由 TS 类型 / ESLint 规则 / Vitest / Playwright 取代。R-1 必须产出“旧脚本/旧断言 → 新覆盖项”映射，禁止写死数量。
- `scripts/build-index.mjs` / `serve-static-site.mjs` —— Vite 取代。
- 根目录约 20 个独立预览 HTML（`aod.html`、`crane.html`、`pattern-*.html` 等）—— `/harness/<scene>`、`/harness/<segment>` 路由取代。
- `docs/newplan/` 三份文档 —— 归档，标注"已由 docs/react-refactor/ 取代"。

## 3. 并行运行与切换（dual-run）

1. 新应用在 `app/` 目录开发；旧静态站根目录**冻结**（只允许 hotfix），作为平价验收 baseline。
2. 平价验收（ROADMAP R5）：逐 scene/segment 并排对照三大历史症状（无重复入场、无交接空白、无黑闪）+ 正反向 + hash 直达 + reduced-motion。
3. 验收通过后部署根切到 `app/` 构建产物；旧站源码移入 `archive/`。
4. 并行期禁止双向同步：文案/视觉修改只改基准（R-1/R0 生成的 copy baseline / manifest 数据），两边各自消费。

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| 虚拟滚动损失原生滚动语义（a11y、URL、惯性） | ARCHITECTURE §9 显式偿还：阅读层原生 inner scroll、settling 时 replaceState、inert + aria-hidden、键盘导航、HUD 进度指示。R2 收口前不迁真实场景 |
| SPA 损失营销站 SEO / 无 JS 正文 | R-1/R0 决定静态预渲染或可爬 HTML shell；copy baseline 同时验证构建产物可提取正文 |
| React StrictMode 双执行 effect 干扰 GSAP/媒体 | HandleRegistry 幂等注册；segment timeline 由 runtime 构建不进组件 effect；开发期即开 StrictMode |
| 三层驻留（video/canvas/WebGL）内存与 GPU 超预算 | LayerWindow dispose 契约 + R5 性能采样对照旧站；scene `dispose()` 强制释放 GPU/媒体 |
| XState 误用（逐帧数据进 machine） | machine context 禁 progress/opacity/transform 字段（R0 ESLint error + review checklist） |
| iOS Safari 100svh / 视频自动播放策略 | 沿用旧 recovery 超时兜底；pilot 阶段即上真机回归 |
| manifest 重设计时数值漂移 | R0.0 先生成 `canonical-spine.md/json`，再做一次性 diff：新 manifest ↔ 旧 `.mjs` 可复用字段（模块、时长、阈值、文案入口） |
| 文案漂移 | copy 对齐 Vitest 从 pilot 阶段起进 CI，逐字比对 R-1/R0 生成的 copy baseline |

## 5. 旧检查到新验证的映射原则

R-1 需要补一张完整表，这里先固定分类规则。`validation-map.md` 不能只写大类总结；必须逐条覆盖 root `package.json` 的每个 `verify:*` 和每个 `scripts/check-*.mjs`，字段为：

```txt
oldScript | oldAssertionSummary | oldAssertionCategory | newCoverageType | targetPhase | owner | automated | baselineGuard | r5Disposition | gapStatus
```

`newCoverageType` 只能是 TS 类型、ESLint、Vitest、Playwright、CI baseline guard、人工 UAT 或退役理由之一。`gapStatus` 不能是“以后再说”；未映射项阻断 R0。

分类规则：

| 旧检查类型 | 新覆盖方式 |
|---|---|
| build/index/manifest 注入检查 | `story/manifest.ts` 类型 + manifest Vitest |
| handoff / owner / reveal gate 检查 | Stage/Transition contract Vitest + Playwright 逐帧断言 |
| adapter contract 检查 | SceneModule/TransitionModule 类型 + ESLint 禁令 |
| copy alignment 检查 | copy baseline 生成 + scene render 文本 diff |
| media policy 检查 | `MediaPlaybackContract` 单测 + 慢网/recovery Playwright |
| 独立 HTML 预览检查 | `/harness/<scene>` / `/harness/<segment>` route + harness 文档 |
