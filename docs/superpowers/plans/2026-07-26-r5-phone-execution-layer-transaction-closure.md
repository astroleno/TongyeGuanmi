# R5 Phone Unified State Machine / Execution-Layer Transaction Closure Plan

> **执行要求：** REQUIRED SUB-SKILL: 逐项使用 `superpowers:executing-plans`，每个生产改动使用 `superpowers:test-driven-development`，完成前使用 `superpowers:verification-before-completion`。未经用户明确许可，不启动 subagent。

**计划状态：** 可执行；本文件取代
`2026-07-26-r5-phone-method-figure2-coverage-recovery.md`，旧文档不得单独执行。

**Reviewed baseline**

- Worktree：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b`
- Branch：`codex/r5-phone-unit7b`
- HEAD：`d4d29bc`
- 已验证定向基线：5 个测试文件、52 个测试通过
- 已验证静态门禁：
  - `verify-homepage-module-boundaries.mjs`
  - `verify-boolean-data-contract.mjs`
  - `verify-phone-packed-alpha-masters.mjs`
- phone JS 硬上限：`648 KiB = 663,552 bytes`
- 最近一次已记录产物：`663,529 bytes`，只剩 `23 bytes`

**Goal**

把正式手机故事链收敛为一个可证明的状态机：一个 immutable
`PhoneStorySnapshot`、一个 reducer、一个 route-local authority、一个同步 DOM
projector、一个输入仲裁器、一个 document scroll sampler。正式 `/` 的 authority
只能由 `PhoneStoryShell` 持有；`/brand-lab` 只能以 `scope:'brand-lab'` 的 QA
外壳从同一个 runtime factory 创建自己的 route-local authority。任何可观察的
stable hold 必须已经同时满足正确画面、正确滚动落点、输入解锁、anchor 清空、
舞台/层级所有权、Safari edge/theme-color、checkpoint、navigation 与 viewport
coverage。

**Architecture**

保留“原生文档滚动 + 单一固定舞台 + 手机专用 Orchestrator”，不导入桌面
Director，也不把手机改成内部 scrollport。手机实现不复制桌面代码，但必须达到桌面
的同级不变量：一个输入仲裁者、一个 active run、一个时间源、一次 terminal settle、
endpoint/hold 首帧连续、没有第三套 presentation、stale event 不可复活、正逆与
rollback 对称。

**Tech stack**

React 19、TypeScript 5.8、`useSyncExternalStore`、Vitest 3、
GSAP/ScrollTrigger（只作几何/渲染 adapter）、RAF media clock、WebGL/packed-alpha、
Vite 7、Playwright Chromium/WebKit 快速门禁、iOS Simulator Safari 与实体 iPhone
Safari 最终门禁。

---

## 1. 结论：执行本计划后能否完整修复

可以，但前提不是“继续补三个视觉问题”，而是完整执行本文的状态所有权迁移和最终
设备门禁。当前 `18b6a7c` 已建立 run graph、session/generation、readiness 与
rollback 骨架，`d4d29bc` 已建立生命周期测试骨架；缺失的是执行层唯一所有权。

现状虽然测试全绿，仍不能称为统一状态机：

本文把用户所称的 Group A 明确拆成 Front/AOD 与 Grade A 两个执行切片；Group 4–5、
Group 6–7 继续按现有 module boundary 迁移，最终四个切片共享同一状态机。

| 已确认缺口 | 当前证据 | 后果 |
| --- | --- | --- |
| cursor 不是完整状态 | `phone-story-state.ts` 只保存 `PhoneStoryCursor` | cursor 可先到 hold，画面/滚动/锁仍在旧状态 |
| stable commit 分段发布 | `phone-orchestrated-session.ts` 先发布 hold，随后才清 anchor/lock | 外部可观察到“假 stable hold” |
| root publisher 强制激活舞台 | `phone-orchestrator-publisher.ts` 无条件写 `portraitStageActive=true` | Method 原生文字会被固定舞台压住 |
| Front/AOD 有第二套执行状态 | `usePhoneStageRuntime.ts` 保存 `aodRun`，同时直接写 visibility | AOD、Method 与 cursor 可分叉 |
| Grade A 有三套真相 | `PhoneGradeAStory.tsx` 同时读取 geometry、cursor、`runView` | Figure2 hold 可固定在错误 progress 并卡死 |
| Group 4–5 有第二套真相 | `currentScene`、`stageScene`、`activeRunRef`、本地 CSS token | Brand/Services/Lab 与 Figure3/TTG 可错位 |
| Group 6–7 有第二套真相 | `focus`、`currentScene`、`stageScene`、`prewarmScene`、`activeRunRef` | PH/Education/Crane/Contact 可空白或反向重建 |
| composite runner 自己拥有 phase | `phone-composite-runner.ts` 保存 active run/step 并回调 React state | Orchestrator 不是唯一 lifecycle owner |
| 未 claim 的 wheel 仍被接管 | `phone-transition-coordinator.ts` 仍 `preventDefault()` + `scrollTo()` | 原生阅读滚动会被截断或锁住 |
| pending intent 可被晚到 capability 复活 | capability 注册会重试 free-floating pending intent | 旧手势可在新场景启动 run |
| anchor policy 未真正执行 | `phone-story-runs.ts` 有三种 policy，生产 landing 仍走 generic resolver | 正逆落点、复合转场位置不稳定 |
| direct entry 在状态机外滚动 | `phone-direct-entry-position.ts` 循环 RAF `scrollTo()` 后才激活 | hash/menu/冷启动不是同一提交路径 |
| edge/checkpoint/navigation 分散 | `PhoneStoryShell.tsx` 分别持有三个 publisher/state | 状态提交无法形成同一 revision |
| CSS 仍有补丁所有权 | group-specific active token、`:has()`、Pattern bottom gradient、过约束 full-screen box | Safari 底边/右边条带和露底仍可能出现 |
| E2E 主要等待 cursor | `waitForPhoneHold()` 只验证 `data-phone-cursor` | 测试无法发现假 hold 与无画面 hold |

因此，本计划的完成标准不是“测试恢复绿色”，而是每个已挂载的 phone route 中只剩
一个 durable story state，正式 `/` 的唯一 authority 位于 `PhoneStoryShell`，且每个
stable hold 的真实呈现合同被浏览器与设备证据共同验证。

---

## 2. 不可回退的 donor 合同

这些既有修复必须作为 migration guard，不得因状态机重构被“重新实现”或弱化。

| 来源 | 必须保留的行为 | 强制回归证据 |
| --- | --- | --- |
| Unit 4 `3deb717` | 一个 persistent fixed stage；AOD/Method 正确交接；Grade A 的 Method/Figure2/Proof 链；Figure2 packed-alpha/poster/foreground arch；Safari edge owner | `PhoneGradeAStory.test.ts`、`PhoneFigure2.test.tsx`、`PhonePattern.test.tsx`、`phone-edge-surface.test.ts`、R5 phone E2E |
| Unit 5 `35b0aee` | Figure3→Services 的 source/receiver 始终保留同一 compositor topology；稳定端点只切 opacity/inert，不销毁后再反向重建 | `figure3-services/phone.test.ts` 中 `persistent-endpoint-opacity` 合同 |
| Unit 6 `ab7353e` | PH→Education、Crane→Contact 复用 persistent endpoint opacity；PH/Crane terminal compositor 为 reverse 保留 | `ph-education/phone.test.ts`、`crane-contact/phone.test.ts`、`phone-lab-contact-timeline.test.ts` |
| Unit 7A `eca6bc2` | 单一 theme-color 发布路径；不得恢复 Pattern terminal edge profile；Figure3 initial/terminal exact posters；`PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS = 240` | `phone-edge-surface.test.ts`、`PhoneFigure3.test.tsx`、`PhoneBrandLabStory.visual-contract.test.ts` |
| Rendering contracts `82a4e68` | semantic boolean 必须输出 `"true"/"false"`；packed-alpha/WebGL texture 与 ink GPU 合同；字体/渲染 production contract | `semantic-data-attribute.test.ts`、`packed-alpha-video.test.ts`、`radialInkIntro.test.ts`、`sceneInk.lifecycle.test.ts` |
| Unit 7B skeleton `18b6a7c` | canonical run graph、dependency closure、session/generation、stale event 拒绝、timeout rollback、正式 shell 唯一 root | phone state/orchestrator/readiness/module-boundary tests |
| Lifecycle gate `d4d29bc` | 完整冷启动、正向、反向、第二轮、boolean/media/module/performance 门禁 | `r5-phone-story.spec.ts` 与三个 verify scripts |

### 2.1 冻结范围

除非用户另行批准，不修改以下事实：

- `assets/` 内媒体字节；
- `app/scripts/homepage-media-contract.mjs` 中 SHA-256、duration 和尺寸；
- `app/src/story/timings.ts`：
  - `HERO_PATTERN_MOTION_MS = 900`
  - `HERO_PATTERN_INK_MS = 1800`
  - `PATTERN_COLLAPSE_MS = 1800`
  - `PATTERN_STAR_MAP_INK_MS = 1800`
  - `FIGURE3_SERVICES_DURATION_MS = 2600`
  - `TTG_PLAYBACK_MS = 2500`
  - `PH_PLAYBACK_MS = 1520`
  - `INTRA_CHAPTER_DISSOLVE_MS = 600`
  - `CRANE_CONTACT_DURATION_MS = 3000`
- `PHONE_INK_AUTOPLAY_MS = 600`；
- scene copy、DOM 文案顺序与 canonical segment 顺序；
- Figure3/Services、PH/Education、Crane/Contact 的 persistent endpoint policy；
- phone JS 硬上限，不允许调高预算。

允许改变的是 ownership、事件流、投影、测量和验证方式；不允许改变视觉设计、媒体、
文案、播放时长或正逆语义来“绕过”状态一致性问题。

---

## 3. 当前正式代码关系

### 3.1 组合关系

```text
PhoneStoryBootstrap
└─ PhoneStoryShell                         # 正式 shell、root、stage host
   ├─ usePhoneStoryOrchestratorRuntime     # 当前 cursor store/controller
   ├─ usePhoneStageRuntime                 # Front + AOD 的第二套 scroll/visual owner
   ├─ PhoneStageRail                       # 唯一 fixed stage host
   ├─ PhoneMethodTop                       # 原生 Method reading
   │  └─ lazy PhoneGradeAStory             # Grade A 第二套 geometry/runView owner
   │     ├─ PhoneBrandLabContinuation      # Group 4–5 第二套 scene/stage/run owner
   │     │  └─ PhoneLabContactContinuation # Group 6–7 第二套 scene/stage/run owner
   │     └─ PhoneLabContactContinuation
   └─ PhoneGroup67DirectEntry              # direct entry 时替代上面的主链挂载
      ├─ PhoneBrandLabContinuation
      └─ PhoneLabContactContinuation
```

所有 cinematic scene 最终都 portal 到 `PhoneStageRail` 的同一个 `stageHost`；问题不是
舞台数量，而是 stageHost 内的可见 surface 由四个 controller 分别决定。

### 3.2 当前状态与执行关系

```text
wheel/touch/scroll/hash/menu
   ├─ phone-transition-coordinator ───────┐
   ├─ usePhoneStageRuntime scroll listener│
   ├─ PhoneGradeAStory scroll listener    │
   ├─ PhoneBrandLabContinuation listener  │
   └─ direct-entry RAF positioner         │
                                          ▼
                                 PhoneStoryOrchestrator
                                 ├─ PhoneStoryCursor
                                 ├─ session controller
                                 ├─ pending intent
                                 └─ stable commit callbacks
                                          │
          ┌───────────────────────────────┼───────────────────────────────┐
          ▼                               ▼                               ▼
 local React scene/stage state     DOM role/active tokens       edge/checkpoint/nav callbacks
```

### 3.3 迁移后的唯一关系

```text
PhoneStoryShell(scope=formal) ────────┐
                                      ├─ createPhoneStoryRuntime()
PhoneBrandLabStory(scope=brand-lab)───┘       # 每个已挂载 route 各自创建、各自销毁
                           │
physical input / scroll / hash / menu / adapter evidence
                           │
                           ▼
                    dispatch(event)
                           │
                           ▼
              reducePhoneStorySnapshot()
                           │
                  snapshot + effects
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
 synchronous DOM projector       effect executor
 root/surfaces/theme/checkpoint   measure/scroll/start/render/release
             │                           │
             ▼                           └── evidence event ──┐
 publish one snapshot + notify subscribers                   │
             │                                               │
             └───────────────────────────────────────────────┘
```

关键顺序是：**reducer → 同步 DOM 投影 → 发布 snapshot → 通知 subscriber → 执行
effect**。React 只订阅 snapshot 做非关键渲染和资源管理，不能成为 stable visibility
提交的一部分。图中的两条 route 是互斥 composition；它们共享实现，不共享运行中的
对象。

### 3.4 架构决策：authority 是 route-local，不是跨路由 singleton

**Status：Accepted / 执行门禁**

**Decision**

- 正式 `/` 手机故事只允许 `PhoneStoryShell` 持有 authority；
- `/brand-lab` 是互斥 QA route，只能通过同一个
  `createPhoneStoryRuntime()` factory 创建一个 route-local authority，并注入
  `scope: 'brand-lab'`；
- QA scope 只由 normalized pathname `/brand-lab` 选择；删除
  `/?scope=brand-lab` query alias，避免正式 `/` 被 query flag 替换成 QA composition；
- 路由切换时旧 authority、listener、registry、session、RAF、timeout、media lease
  必须 dispose；新路由创建新对象、新 authority id 与新 generation lineage；
- 不追求、也禁止跨两个互斥 route 共享同一个内存 store/orchestrator；
- “一个 authority”的准确含义是：**每个已挂载的 phone route/root 恰好一个**。

**Rejected alternatives**

- 跨 `/` 与 `/brand-lab` 保存同一个 module-scope store/orchestrator；
- QA route fork reducer/projector/input/timing 形成“精简版”状态机；
- 让 `PhoneBrandLabStory` 或 `PhoneLabContactShell` 回流正式 `/` 充当第二 shell；
- 用 query flag 在正式 `/` 内切换到 QA composition。

**Consequences**

- route navigation 不保留内存中的 session/progress；目标 scene 只能经
  hash/history/direct-entry transaction 在新 authority 中恢复；
- 两条 route 的一致性由 shared implementation、同 trace tests 与 frozen contracts
  证明，不由 object identity 证明；
- QA 可以裁剪 mounted subtree 和改变 initial entry，但没有权力裁剪或覆盖状态机规则。

共享 factory 的合同：

```ts
createPhoneStoryRuntime({
  scope: 'formal' | 'brand-lab',
  initialEntry,
  root: () => HTMLElement | null,
  stageViewport: () => HTMLElement | null,
  motionMode
}): PhoneStoryAuthority;
```

`PhoneStoryAuthority` 是 route shell 私有的 lifetime handle，至少包含
`authorityId/scope/port/attach()/dispose()`；`port` 是传入 Context 的受限
`PhoneStoryRuntimePort`，只暴露 snapshot/dispatch/registration API，不暴露
`attach()/dispose()` 或内部 engine。factory construction 本身不得安装 listener、
启动 RAF 或申请 media lease，只有 committed root 上的 `attach()` 可以产生副作用。
`dispose()` 必须幂等，并同步失效该 authority 的全部异步 identity。这样 React
StrictMode 即使执行开发态 probe，也不会留下第二个 live authority。

`authorityId` 是每次 factory construction 注入 snapshot 的不可变 boot identity；
所有 session、scroll command、media/adapter evidence 都必须携带
`authorityId + sessionId + generation + leg`（不适用字段显式为 `null`）。它只用于
拒绝旧 route/旧 generation 的异步回报和诊断，不允许参与 scene/timing/projection
分支。`scope` 不进入 reducer 的行为分支，也不得被用来创建另一套 transition table。

projector 对 document/theme-color 等全局表面的 lease 也必须带 authority ownership
token。旧 route 的迟到 cleanup 只有在 token 仍属于自己时才能 restore/remove；若新
route 已 attach，旧 cleanup 必须 no-op，不能把新 route 的 edge、theme 或 root
diagnostic 清掉。这个 lease/guard 不是共享 story store，也不能被扩展成跨 route
singleton authority。

两条 route 必须复用同一套：

- `reducePhoneStorySnapshot()`；
- projection/transition-leg tables；
- synchronous projector/surface registry；
- input disposition/document scroll runtime；
- run graph、anchor/landing、commit/rollback；
- media identity、timings、hash、persistent compositor contracts。

`scope` 只允许决定：

- 当前 QA shell 挂载哪个 scene subtree；
- initial entry；
- validation/diagnostic attribute。

`scope` 不允许分支 reducer、projection、input、timing、media、edge、commit 或 rollback
规则。

`PhoneBrandLabStory` 的最终职责只能是：

1. 提供 QA root/stage host；
2. 调用共享 runtime hook/factory 并传 `scope:'brand-lab'`；
3. 挂载 `PhoneBrandLabContinuation`；
4. 提供 QA navigation/menu UI；
5. unmount 时 dispose shared authority。

它不得再拥有 durable `currentScene`、`stageScene`、`publishPresentation`、edge
publisher、intent coordinator、scroll listener、run/session/landing/lock 或任何
独立 lifecycle。允许为导航渲染声明只读 selector 结果，但禁止对应
`useState/useRef/setter` 和反向 publication。

**Module boundary**

- 正式 `/` transitive graph 必须是
  `PhoneStoryBootstrap → PhoneStoryShell → shared runtime/continuations`；
- 正式 graph 禁止导入 `PhoneBrandLabStory` 与 `PhoneLabContactShell`；
- QA shell 只能导入 shared runtime API，不得直接导入
  `createPhoneStoryOrchestrator`、`createPhoneOrchestratorPublisher`、
  `createPhoneIntentCoordinator` 或新建第二套 store；
- source gate 检查 factory 只从获准的 route hook/shell assembly path 调用，并检查
  formal graph 无 QA shell；runtime gate 检查每个 connected route root 恰好一个
  **live/attached** authority。不得用源码里的调用次数替代 runtime 断言，也不得把
  module-scope singleton 当作通过方式。

这条决策保留 Unit 4–7A 的融合、手感与时序：场景媒体和时间轴不重写，只把“谁发起、
谁提交、谁切层、谁解锁”收回共享 authority。最终可信度仍以 frozen timings/media/
reverse compositor tests 加实体 iPhone 手势回归为准，不能只看单元测试。

---

## 4. 目标状态机

### 4.1 一个 discriminated snapshot，不重复保存 cursor/session

`PhoneStoryCursor` 不再是独立 store。它变成
`selectPhoneStoryCursor(snapshot)` 的兼容 read model，用于 data attribute 和迁移期
测试；所有写入只经过 `reducePhoneStorySnapshot()`。

```ts
export type PhonePresentationProjection = Readonly<{
  commitState: 'transition' | 'candidate' | 'stable';
  semanticScene: SceneId;
  navigationScene: SceneId;
  checkpoint: PhoneCheckpointId;
  edge: PhoneEdgeScene;
  stageOwner: 'front' | 'grade-a' | 'group45' | 'group67' | 'native';
  stageScene: SceneId | null;
  sourceSurface: PhoneSurfaceId | null;
  receiverSurface: PhoneSurfaceId;
  coverageSurface: PhoneSurfaceId;
  landingResolver: PhoneLandingResolverId;
}>;

export type PhoneStorySnapshot =
  | PhoneStableSnapshot
  | PhoneScrollRunSnapshot
  | PhoneTransactionSnapshot;

export type PhoneFailureReason =
  | 'dependency-timeout'
  | 'capability-failed'
  | 'media-failed'
  | 'projector-failed'
  | 'surface-disconnected'
  | 'registry-invalidated'
  | 'target-verification-failed'
  | 'landing-measure-failed'
  | 'scroll-confirmation-failed'
  | 'stable-verification-failed';

type PhoneSnapshotBase = Readonly<{
  authorityId: string;
  revision: number;
  diagnostics: Readonly<{
    lastRollback: Readonly<{
      run: PhoneRunId;
      reason: PhoneFailureReason;
      generation: number;
    }> | null;
  }>;
  scroll: Readonly<{
    actualY: number;
    corridor: PhoneScrollCorridorId | null;
    progress: number;
    direction: -1 | 0 | 1;
    sampleRevision: number;
  }>;
  input: Readonly<{
    completedEpoch: number | null;
    completedEpochUntil: number | null;
  }>;
  projection: PhonePresentationProjection;
}>;

export type PhoneStableSnapshot = PhoneSnapshotBase & Readonly<{
  status: 'stable';
  scene: SceneId;
  session: null;
}>;

export type PhoneScrollRunSnapshot = PhoneSnapshotBase & Readonly<{
  status: 'scroll-run';
  run: PhoneScrollRunId;
  session: null;
}>;

export type PhoneTransactionSnapshot = PhoneSnapshotBase & Readonly<{
  status: 'transaction';
  session: Readonly<{
    sessionId: string;
    generation: number;
    inputEpoch: number | null;
    operation:
      | Readonly<{
          kind: 'run';
          trigger: 'input' | 'auto';
          run: PhoneRunId;
          direction: 1 | -1;
          legIndex: number;
        }>
      | Readonly<{
          kind: 'entry';
          target: SceneId;
          source: 'initial' | 'hash' | 'menu' | 'history';
          fallbackScene: SceneId;
          cinematic: Readonly<{
            run: PhoneRunId;
            direction: 1;
            legIndex: number;
          }> | null;
        }>;
    phase: PhoneTransactionPhase;
    progress: number;
    anchor: Readonly<{
      policy: PhoneRunAnchorPolicy | 'entry-target';
      y: number | null;
      geometryRevision: number | null;
    }>;
    alignment: PhoneAlignmentAttempt | null;
  }>;
}>;

export type PhoneTransactionPhase =
  | 'preparing'
  | 'animating'
  | 'verifying-target'
  | 'releasing-layout'
  | 'measuring-landing'
  | 'aligning-scroll'
  | 'verifying-stable'
  | 'rollback-rendering'
  | 'rollback-releasing-layout'
  | 'rollback-measuring-landing'
  | 'rollback-aligning-scroll'
  | 'rollback-verifying-stable';

export type PhoneAlignmentAttempt = Readonly<{
  geometryRevision: number;
  targetY: number;
  commandId: number;
  correctionCount: 0 | 1;
  confirmedY: number | null;
  visualViewportOffsetTop: number;
}>;
```

约束：

- `status:stable` 和 `status:scroll-run` 必然没有 session、anchor 或 lock；
- `status:transaction` 必然有唯一 session/generation/operation/anchor policy；
  `trigger:'input'` run 必须有 inputEpoch，AOD semantic-edge
  `trigger:'auto'` 与 bootstrap/hash/menu/history entry 的 inputEpoch 为 `null`；
  entry 在 geometry ready 前允许 anchor `y=null`，但不得进入 animating/alignment；
- `inputLocked` 是 selector：仅 active transaction 为 `true`，不再另存一份 boolean；
- run、direction、leg 只出现在 `session.operation` 一处，phase/progress 只出现在
  session 一处；
- scroll-run 的 direction/progress 只读取 `snapshot.scroll`，不再复制字段；
- run source/target 由 run graph + direction selector 派生；entry target/fallback 只在
  entry operation 中保存；
- `projection` 只能由 reducer 的 finalize 函数产生，没有 component setter；
- projection 必须带 `commitState: 'transition' | 'candidate' | 'stable'`；
  transaction 的 candidate 画面可以使用 stable CSS 几何，但不得发布
  `data-phone-stable-scene` 或 stable surface role；
- `landingY` 不是“纯 projection”。它是 DOM 测量事实，只能进入
  `session.alignment`，必须带 geometry/sample/command revision；
- 每个 event 生成单调递增 snapshot revision；
- stale session/generation/leg/command evidence 返回原 snapshot 且不产生 effect。
- authorityId 不匹配的旧 route evidence 返回原 snapshot 且不产生 effect。

### 4.2 唯一 reducer 与 effect 边界

```ts
export function reducePhoneStorySnapshot(
  state: PhoneStorySnapshot,
  event: PhoneStoryEvent
): Readonly<{
  snapshot: PhoneStorySnapshot;
  effects: readonly PhoneStoryEffect[];
  inputDisposition?: PhoneIntentDisposition;
}>;
```

reducer 必须是纯函数。以下操作只能作为 effect：

- 查询 capability/surface/corridor registry；
- prepare/start/render adapter；
- 测量 boundary、root、visualViewport；
- acquire/release geometry/alignment lease；
- `window.scrollTo()`；
- RAF/timeout；
- WebGL/video 操作；
- DOM stable presentation verifier；
- layout-free resource release。

effect 完成后必须带 identity 回报 event，不得直接修改 snapshot、surface role 或
React scene state。

`dispatch()` 负责把 raw browser event 规范化后再调用 reducer：

- `INTENT_RECEIVED` 先由 controller 同步读取当前 registry 的 adjacent run、
  boundary measurement 与 readiness，生成不含 DOM handle 的
  `INTENT_RESOLVED`；
- `SCROLL_SAMPLED` 由 document runtime 先完成 corridor/visualViewport 测量；
- reducer 只消费数值、id、revision 与 identity，不读取 registry 或 DOM；
- `dispatch(INTENT_RECEIVED)` 同步返回 reducer 的 `inputDisposition`，event listener
  据此决定是否 cancel；
- registry measurement 抛错或返回未知 boundary 时只能 `pass-native`，不得猜测
  claim；active transaction 仍优先 block。stable verifier 必须保证有 adjacent run
  的正式 hold 不会进入这种状态；surface/corridor lease 注销要同步 dispatch
  invalidation，阻止下一 revision 继续冒充 stable。

最终 route shell 只拿到 `PhoneStoryAuthority` lifetime API：

- `authorityId` / `scope` / `port`；
- `attach()`；
- `dispose()`。

continuation 通过 Context 只拿 `PhoneStoryRuntimePort`：

- `getSnapshot()` / `subscribe()` / `dispatch(event)`；
- `registerRunCapability()` / `registerSurface()` / `registerScrollCorridor()`。

`PhoneStoryOrchestrator` 降为 `phone-story-runtime.ts` 内部 engine；正式 production
component 不得直接 import/construct 它。

`cursor()` 只允许作为明确标记 deprecated 的迁移 selector，并在 Task 9 删除 public
API；`requestRun()`、`handleIntent()`、`reconcileHold()`、
`reconcileScrollHold()`、`reconcileScrollRun()`、`activateDirectEntry()`、
`registerStableSceneAdapter()` 都必须在负责迁移的 Task 中删除。

### 4.3 事件类别

| 事件 | 生产者 | reducer 责任 |
| --- | --- | --- |
| `BOOTSTRAP_REQUESTED` | shell | 建立初始/direct-entry transaction，不发布假 hold |
| `SCROLL_SAMPLED` | 唯一 document sampler | 更新 actualY/corridor/progress；在 front scroll segment 间切换 |
| `INTENT_RECEIVED → INTENT_RESOLVED` | 唯一 input coordinator + controller normalizer | reducer 选择 pass/block/consume/claim disposition |
| `BOUNDARY_CLAIMED` | reducer 内部结果 | 从 stable 创建唯一 preparing session |
| `CAPABILITIES_READY` | registry effect | 只唤醒仍匹配的 active session |
| `REGISTRY_INVALIDATED` | surface/corridor lease | active transaction 失败回滚；stable hold 进入 bounded source recovery，不重放 input |
| `PRESENTED_FRAME` | scene/transition adapter | preparing → animating；必须匹配 session/generation/leg |
| `PROGRESS_REPORTED` | clock/media/scroll adapter | 更新唯一 progress，检查方向单调性 |
| `LEG_COMPLETED` | adapter | 进入下一 leg，或 terminal target verification |
| `TARGET_PRESENTED` | DOM verifier | 开始 layout release |
| `LAYOUT_RELEASED` | release effect | 进入 landing measurement |
| `LANDING_MEASURED` | corridor effect | 保存 measured targetY 和 geometry revision |
| `SCROLL_COMMANDED` | scroll effect | 保存 commandId，不得发布 hold |
| `SCROLL_CONFIRMED` | sampler/RAF | 进入 stable projection verification |
| `STABLE_PRESENTATION_VERIFIED` | DOM verifier | 一次提交 stable + free input + no session |
| `FAILED` / `TIMED_OUT` | 任意 effect | 进入 rollback-rendering，拒绝后续旧 evidence |
| `ROLLBACK_*` | 同一 effect pipeline | 对 source 执行 release/measure/align/verify 后一次回到 stable |
| `DIRECT_ENTRY_REQUESTED` | entry hook | 使用同一 transaction，不允许外部循环 scroll |
| `NAVIGATE_REQUESTED` | hash/menu/history | 使用同一 direct-entry/seek transaction |

所有异步 evidence/result event 必须带当前 `authorityId`；session event 还必须带
`sessionId/generation/leg`，scroll result 还必须带 `commandId`。缺字段或任一 identity
不匹配都按 stale event 处理。

### 4.4 合法状态迁移

| 当前状态 | 事件/证据 | 下一状态 | 输入 |
| --- | --- | --- | --- |
| stable | front corridor 进入 segment | scroll-run | 原生 free |
| scroll-run | progress sample | scroll-run | 原生 free |
| scroll-run | 到达相邻 hold | stable | 原生 free |
| stable | 未越边界/无相邻 run | stable | `pass-native` |
| stable | 同 epoch 尾流 | stable | `consume-completed-epoch-tail` |
| stable | 已越 canonical boundary | transaction/preparing | claim + locked |
| stable(aod) | canonical autoplay threshold | transaction/preparing (`trigger:auto`) | locked |
| stable | required surface/corridor invalidated | entry-style source recovery | locked |
| preparing | dependencies/target frame ready | transaction/animating | locked |
| animating | 非 terminal leg 完成 | transaction/preparing(next leg) | locked |
| animating | terminal leg 完成 | transaction/verifying-target | locked |
| verifying-target | target endpoint + structural coverage 通过 | transaction/releasing-layout | locked |
| releasing-layout | layout lease 已释放 | transaction/measuring-landing | locked |
| measuring-landing | targetY 测量成功 | transaction/aligning-scroll | locked |
| aligning-scroll | actualY 与 targetY 确认一致 | transaction/verifying-stable | locked |
| verifying-stable | stable DOM contract 通过 | stable(target) | free |
| 任意 transaction | failure/timeout/disconnect | rollback-rendering | locked |
| rollback-* | source render/release/measure/align/verify 逐步通过 | stable(source) | free |

不允许：

- `preparing → stable`；
- `animating → stable`；
- `hold` 发布后再异步清 lock/anchor；
- capability 注册直接启动没有 active session 的旧手势；
- component 自行发布 leg、scene、role、landing 或 unlock。

---

## 5. Stable commit 不是一次 `scrollTo()`：预提交协议

浏览器滚动、layout 与 React commit 无法和 JS object 真正同一瞬间原子写入。目标不是
伪装原子性，而是保证外部在最终 stable 发布前看不到半提交状态。

### 5.1 Forward terminal commit

1. 保持 `transaction/verifying-target`，input locked；
2. transition/scene adapter 渲染准确 target endpoint；
3. verifier 确认 target root connected、presented evidence identity 正确；
4. projector 把 target 设为 **candidate stable projection**，但 cursor 仍是
   transition，root 不发布 stable token；
5. 释放会影响 layout 的 mask、document alignment、flow geometry lease；
6. 下一帧重新测量 target landing，记录 geometry revision；
7. controller 发出唯一 scroll command；
8. 等待真实 `scroll` sample 或最多两次 RAF，读取：
   - `window.scrollY`
   - `visualViewport.offsetTop/height`
   - target/coverage rect
9. 若实际位置未对齐，最多进行一次 bounded correction；第二次仍失败则 rollback；
10. verifier 在 candidate projection 下检查 stable DOM/coverage；
11. reducer 一次生成 `stable(target)`：
    - session 消失；
    - selector 得出 input free；
    - anchor 消失；
    - target surface 为唯一 stable owner；
    - fixed stage owner/scene 正确；
    - edge/theme-color/checkpoint/navigation 全部来自 target projection；
    - scroll fact 是已确认的 actualY；
12. projector 同步应用 final DOM tokens/roles；
13. 更新 current snapshot 并通知 subscribers；
14. 下一帧只释放不会改变 layout/coverage 的旧 canvas、decoder、timeout、media lease。

只要外部观察到 `data-phone-cursor="hold:*"`，第 1–13 步必须已经完成。

### 5.2 Rollback

rollback 使用完全相同的反向预提交：

1. 进入 `rollback-rendering` 并递增 session generation；
2. 旧 generation 的 frame/media/timeout 全部失效；
3. 所有已进入 leg 被动渲染回 source endpoint；
4. source candidate projection 同步应用；
5. 释放 layout lease；
6. 重测 source landing；
7. 执行并确认 source scroll alignment；
8. verifier 检查 source root/coverage；
9. 一次发布 `stable(source)`；
10. 发布 retry diagnostic，但不得自动重放旧 input epoch。

### 5.3 Projector 提交顺序

删除 `phone-orchestrator-publisher.ts`，由 `phone-story-projector.ts` 成为唯一
projector：

```text
next = reduce(current, event)
plan = projector.preflight(next) # 解析全部 required roots/roles；此步不写 DOM
projector.apply(plan)          # 同步写 root/surface/meta，不触发 React setState
current = next
notifyExternalStore()
runEffects(next.effects)
```

如果 preflight 发现 root/surface disconnect，不得写 DOM 或发布 next；controller 把
失败转换成当前 session 的 `FAILED` event。若 apply 中出现异常，立即重新 apply
`current` 的已缓存 projection plan，再 dispatch `FAILED`；projector write 必须是
幂等的 attribute/style/meta 赋值，不能在 apply 中调用会异步失败的 adapter。

projector 是唯一允许写以下正式状态的模块：

- `data-phone-cursor`
- `data-phone-revision`
- `data-phone-session`
- `data-phone-transition-phase`
- `data-phone-input-state`
- `data-phone-scroll-corridor`
- `data-phone-scroll-progress`
- `data-phone-stage-owner`
- `data-phone-stage-scene`
- `data-phone-projection-state`
- `data-phone-stable-scene`
- `data-phone-anchor-y`
- `data-portrait-checkpoint`
- `data-portrait-checkpoint-trace`
- `data-portrait-edge-scene`
- `data-phone-surface-role`
- document/root/stage edge CSS variables 与 `<meta name="theme-color">`

React subscriber 可以晚一个 commit 更新导航文字或 loader cache，但不能决定
visibility、z-index、inert、pointer ownership 或 stable endpoint。

为保持 Task 2–8 之间每个提交可运行，projector 可以临时从 snapshot 派生旧的
`data-portrait-stage-active`，且 `stageOwner=native` 时必须写 `"false"`；从 Task 2
开始任何 component 都不得再写它。Task 8 在 CSS 全部切到 global role 后删除该
兼容 token。不得为 Grade A、Group 4–5、Group 6–7 新增同类兼容 token。

---

## 6. Surface、projection 与 coverage

### 6.1 Surface registry

删除 `PhoneStableSceneAdapter.commit()`，改为纯能力注册：

```ts
registerSurface({
  id,
  scene,
  kind: 'native' | 'fixed' | 'transition',
  root,
  coverageRoot,
  presented
});
```

registry 只保存 handle/ref 和 evidence；它不保存 active scene。projector 根据 snapshot
同步赋予：

- `stable`
- `candidate-stable`
- `fixed-current`
- `transition-source`
- `transition-receiver`
- `retained-under-stage`
- `retired`

唯一固定层级：

| role | z-index | 用途 |
| --- | ---: | --- |
| edge fallback | 8 | Safari/browser chrome 同色底 |
| retained/native under stage | 9 | reverse source、document receiver 下层 |
| fixed stage current | 10 | 当前 cinematic surface |
| native stable | 11 | Method/Brand/Services/Lab/Education/Contact |
| transition endpoint/effect | 12 | 当前 mask/canvas/receiver；只在 transaction 中 |

### 6.2 所有 stable projection 必须显式登记

四个 cinematic direct-entry scene 即使在正常复合 run 中不 terminal settle，也必须有
完整 stable projection；任何短暂可观察的 `hold:*` 都不能是假状态。

| scene | corridor | stage owner / scene | stable surface | coverage surface | checkpoint / edge | landing resolver |
| --- | --- | --- | --- | --- | --- | --- |
| hero | `front-rail` | `front / hero` | `front:hero` | `front:hero` | `hero-entered / hero` | front corridor sample |
| pattern | `front-rail` | `front / pattern` | `front:pattern` | `front:pattern` | `pattern-complete / pattern` | front corridor sample |
| star-map | `front-rail` | `front / star-map` | `front:star-map` | `front:star-map` | `star-map-reading / star` | front corridor sample |
| aod-animation | `front-rail` | `front / aod-animation` | `front:aod` | `front:aod` | `aod-stage / aod` | AOD semantic edge |
| method-top | `method-grade-a` | `native / null` | `native:method` | `native:method` | `method-intro / method` | native reading edge |
| figure2-animation | `method-grade-a` | `grade-a / figure2-animation` | `grade-a:figure2` | `grade-a:figure2` | `figure2-stage / figure2` | authored marker/current progress |
| figure2-proof | `method-grade-a` | `grade-a / figure2-proof` | `grade-a:proof` | `grade-a:proof` | `figure2-proof-opening / proof` | authored proof panel marker |
| brand | `group45` | `native / null` | `native:brand` | `native:brand` | `brand-reading / brand` | authored Proof→Brand boundary |
| figure3-animation | `group45` | `group45 / figure3-animation` | `group45:figure3` | `group45:figure3` | `figure3-stage / figure3` | Figure3 marker/direct entry |
| services | `group45` | `native / null` | `native:services` | `native:services` | `services-reading / services` | preserve composite |
| ttg-animation | `group45` | `group45 / ttg-animation` | `group45:ttg` | `group45:ttg` | `ttg-stage / ttg` | TTG marker/direct entry |
| lab | `group45` | `native / null` | `native:lab` | `native:lab` | `lab-stable / lab` | preserve composite/shared Lab boundary |
| ph-animation | `group67` | `group67 / ph-animation` | `group67:ph` | `group67:ph` | `ph-stage / ph` | PH marker/direct entry |
| education | `group67` | `native / null` | `native:education` | `native:education` | `education-reading / education` | preserve composite |
| crane-animation | `group67` | `group67 / crane-animation` | `group67:crane` | `group67:crane` | `crane-stage / crane` | Crane marker/direct entry |
| contact | `group67` | `native / null` | `native:contact` | `native:contact` | `contact-stable / contact` | preserve composite/document end |

这张表在 `phone-story-presentation.ts` 中实现为 exhaustive
`satisfies Record<CanonicalSceneId, ...>`；新增 scene 时缺项必须 typecheck 失败。

表中的 checkpoint 是 stable base checkpoint，不代表再创建一份 panel state：

- Method corridor 根据同一个 `scroll.progress` 在 `method-intro` 与
  `method-to-figure2` 间投影；
- Proof corridor 根据同一个 `scroll.progress` 投影
  `figure2-proof-opening/cards/closing`；
- semantic stable scene 仍分别是 `method-top` 与 `figure2-proof`；
- panel/checkpoint/navigation 不允许由 component local state 发布。

### 6.3 每个 transition leg 也必须显式登记

| segment | stage owner | source → receiver | coverage before target verify | anchor/landing | donor constraint |
| --- | --- | --- | --- | --- | --- |
| hero-pattern | front | `front:hero → front:pattern` | source/transition | scroll corridor | Unit 4 front composition |
| pattern-star-map | front | `front:pattern → front:star-map` | source/transition | scroll corridor | 不恢复 Pattern terminal edge profile |
| star-map-aod | front | `front:star-map → front:aod` | source/transition | scroll corridor | AOD exact first frame |
| aod-method-top | front→native | `front:aod → native:method` | AOD/transition | `aod-semantic-edge` | Method 文本在 stable 前已可见 |
| method-bottom-figure2 | grade-a | `native:method → grade-a:figure2` | Method/ink | `authored-boundary` | Unit 4 ink + Figure2 prepared receiver |
| figure2-distance-expand | grade-a | `grade-a:figure2 → grade-a:proof` | Figure2/ink | `authored-boundary` | Figure2 packed-alpha/arch 不变 |
| figure2-proof-brand | grade-a→native | `grade-a:proof → native:brand` | Proof/ink | `authored-boundary` | 一个 Brand canonical root |
| brand-figure3 | group45 | `native:brand → group45:figure3` | Brand/ink | `preserve-composite` | 无临时 Brand clone |
| figure3-services | group45→native | `group45:figure3 → native:services` | retained Figure3 + Services | `preserve-composite` | `persistent-endpoint-opacity`、exact poster |
| services-ttg | group45 | `native:services → group45:ttg` | Services/ink | `preserve-composite` | 一个 Services root |
| ttg-lab | group45→native | `group45:ttg → native:lab` | retained TTG + Lab | `preserve-composite` | reverse 不重建 Lab paper |
| lab-ph | group67 | `native:lab → group67:ph` | Lab/ink | `preserve-composite` | shared Lab boundary |
| ph-education | group67→native | `group67:ph → native:education` | retained PH + Education | `preserve-composite` | `persistent-endpoint-opacity` |
| education-crane | group67 | `native:education → group67:crane` | Education/ink | `preserve-composite` | 一个 Education root |
| crane-contact | group67→native | `group67:crane → native:contact` | retained Crane + Contact | `preserve-composite` | `persistent-endpoint-opacity`、terminal controls native |

复合 run（Brand→Services、Services→Lab、Lab→Education、Education→Contact）只有一个
session/generation；切 leg 不 settle、不解锁、不创建第二个 run。中间 cinematic scene
的 projection 来自当前 leg，不来自 component local state。

edge 切换同样是 transaction policy：forward/reverse 都保持 direction source edge，
直到 receiver opaque coverage 与 target presented evidence 同时通过；candidate
stable projection 才同步切 target edge/theme-color，失败则保持/恢复 source edge。
不得按 `progress > 0` 提前切 Safari edge。

### 6.4 Runtime coverage 与视觉 coverage 分开

永久 runtime verifier 只能检查结构事实：

- root/coverageRoot connected；
- 唯一 stable/fixed/transition role；
- computed `display/visibility/opacity`；
- expected inert/pointer state；
- coverage rect 覆盖 `visualViewport` 的 left/top/right/bottom（允许 1 px tolerance）；
- coverage root 声明 opaque contract，或 computed background alpha 为 1；
- actualY 与 measured targetY 在 tolerance 内；
- 当前 hold 正/逆可达的 canonical boundary marker/resolver 已注册；媒体 capability
  可以尚未 ready，但几何不能等 lazy media 才出现；
- stage owner/scene、edge/checkpoint 与 snapshot 一致。

runtime 不做截图 pixel sampling，也不能因为“像素可能有缝”永久锁住用户。

测试/设备视觉 gate 负责：

- toolbar 展开/收起时底边；
- 右边 1 px seam；
- translucent paper/compositor 重建闪烁；
- Pattern 横条；
- Figure2 透明露底；
- exact endpoint poster 与真实视频帧的视觉连续性。

---

## 7. 输入、滚动、anchor、direct entry

### 7.1 一个 document scroll sampler

新增 authority-scoped `PhoneScrollCorridorRegistry`：

```ts
registerScrollCorridor({
  id,
  scenes,
  sample(viewport),
  boundary(run, direction),
  landing(scene, reason, direction)
});
```

正式路由只允许 `usePhoneDocumentScrollRuntime.ts` 监听：

- document/window scroll；
- resize；
- orientationchange；
- `visualViewport.resize/scroll`。

它每帧只采样一次，只选择 snapshot 允许的一个 corridor，然后 dispatch
`SCROLL_SAMPLED`。ScrollTrigger 可继续计算 front rail progress，但只能把 sample
交给这一个 runtime；不能 reconcile cursor、发布 scene 或直接写 visibility。

单一时钟规则：

- stable/scroll-run 时，authoring progress 只来自当前 corridor sample；
- transaction/animating 时，authoring progress 只来自 controller clock 或带 identity
  的 media evidence；
- transaction 中的普通惯性 scroll sample 只更新 diagnostic actualY，不得推进
  scene/leg/progress；
- aligning-scroll 阶段只接受当前 commandId 的 actualY confirmation；
- reduced motion 仍通过同一个 progress event 直接到 terminal，不另开 instant path。

### 7.2 精确 input disposition

```ts
export type PhoneIntentDisposition =
  | 'pass-native'
  | 'claim-boundary'
  | 'block-active-session'
  | 'consume-completed-epoch-tail';
```

规则：

- active transaction：`block-active-session`；
- 同一完成 epoch 的惯性尾流：`consume-completed-epoch-tail`；
- 当前 stable hold 存在 canonical adjacent run、boundary 已知且手势确实越界：
  `claim-boundary`；
- 阅读章节内部、没有相邻 run、boundary 未越过：`pass-native`；
- `pass-native` 不得 `preventDefault()`、`stopImmediatePropagation()` 或同步
  `scrollTo()`。

越过 boundary 后立即创建 `preparing` session；不再保存 free-floating pending
intent。dependency 尚未 ready 时 source 保持完整可见、input locked、session 带
deadline。late capability 只能向仍匹配的 session 发 `CAPABILITIES_READY`，不能从
stable 状态重放旧手势。

### 7.3 WebKit native-scroll fallback

`pass-native` 后可以安排一次 probe，但不能取消原事件：

1. 记录 epoch、revision、startY、projectedY；
2. 下一 RAF 读取 actualY；
3. 浏览器已移动：结束；
4. 完全未移动且仍是同一 stable revision/corridor：执行一次 clamp 后的 bounded
   corrective scroll；
5. corrective scroll 只产生 `SCROLL_SAMPLED`，不能产生 run intent；
6. 每 epoch 最多一次。

### 7.4 Anchor policy 真正进入 resolver

`resolvePhoneRunLanding()` 必须 exhaustive consume：

- `aod-semantic-edge`：使用 AOD 已验证的正/逆 semantic edge；
- `authored-boundary`：使用 Grade A 注册的 source/target marker；
- `preserve-composite`：保留触发位置和当前 composite marker，不跳 generic target
  top。

`PhoneRunDefinition.anchor` 不允许 default branch。每种 policy 必须有 forward、
reverse、direct entry、rollback 测试。

### 7.5 Direct entry / hash / menu

删除“外部 positioner 先循环 scroll、Orchestrator 后激活”的路径：

1. `usePhoneStoryEntry()` 只解析计划并 dispatch `DIRECT_ENTRY_REQUESTED`；
2. controller 等待 module/surface/corridor ready；
3. stable entry 走 measure → align → verify → stable；
4. cinematic entry 创建同一个 session，从指定 leg 开始；
5. navigation/hash/history dispatch `NAVIGATE_REQUESTED`，复用同一流程；
6. `usePhoneStoryNavigationRuntime()` 只保留 menu open UI state，current scene 来自
   snapshot selector；
7. Contact 控件、mailto、pointer、focus 始终是 native，不被 cinematic input owner
   拦截。

---

## 8. Component 本地状态边界

允许：

- lazy module loaded/failed；
- adapter handle/ref；
- decoder/WebGL/video ready；
- session identity 下的 resource lease；
- `lastRenderedProgress` 等幂等 render cache；
- menu open；
- callback ref 引起的 adapter revision；
- prewarm cache，但它不能决定 root visibility。

禁止：

- `currentScene`、`stageScene`、`runView`、`activeRunRef` 作为画面真相；
- component-owned transition phase/leg；
- component-owned stable role、landing、anchor、lock；
- component-owned edge/checkpoint/navigation scene；
- group-specific active/snap/stage scene token 决定可见性；
- 正式 child 调用 `window.scrollTo/scrollBy/scrollIntoView`；
- 正式 child 增加 wheel/touch/document-scroll owner；
- stable adapter 的 React `commit()` callback。

scene 的 `active` prop 只可控制媒体播放、decoder/prewarm 和 accessibility adapter
动作；root 的 visibility/z-index/coverage 必须由 global surface role 决定。

### 8.1 Startup、reduced motion 与 media failure

- `PhoneStoryBootstrap` 继续只拥有 loader/startup visibility，不拥有 story scene；
- bootstrap target 在 module/surface/corridor ready 前保持 entry transaction，不得先
  发布目标 hold；
- motion mode 是 controller 的 boot fact；`full` 与 `reduced` 使用同一 reducer、
  projection、precommit 和 stable verifier；
- reduced motion 的 adapter effect 可以直接渲染 terminal endpoint，但仍必须报告
  presented evidence，不能绕过 landing/coverage/rollback；
- media decode failure 使用已冻结 poster/static fallback，并继续走同一 target
  verification；poster 也无法满足 coverage 时 rollback；
- boot target 无可用 fallback 时保留 startup failure UI，不伪造 stable story
  snapshot；
- 每个 session effect 使用 AbortController/identity cleanup；dispose、generation
  change、rollback 后不得残留 RAF、timeout、video callback 或 WebGL lease。

---

## 9. 实施计划

每个 Task 都遵循：

1. 先写一个会因当前架构缺口失败的最小测试；
2. 运行定向命令并保存失败原因；
3. 实现最小的**目标架构完整切片**，不保留新旧 runtime feature flag；
4. 删除同一切片被替代的代码/token；
5. 定向测试、typecheck、build 通过；
6. donor freeze 检查通过；
7. 才提交。

### Task 0：冻结 baseline、donor 与失败合同

**Files**

- Modify: `app/src/production/phone/phone-story-sequence.test.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.test.ts`
- Modify: `app/src/production/phone/phone-transition-coordinator.test.ts`
- Modify: `app/src/production/phone/phone-story-presentation.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabStory.test.ts`
- Modify: `app/e2e/r5-phone-story.spec.ts`
- Create: `app/src/production/phone/phone-stable-presentation.test.ts`
- Create: `docs/react-refactor/reports/r5-phone-execution-layer-baseline.md`

**Red tests**

- [ ] 捕获 `hold` 已发布但 lock/anchor 仍存在的中间帧。
- [ ] 捕获 projector/stable adapter callback 分两次决定 scene。
- [ ] 捕获 unclaimed wheel 被取消并同步 `scrollTo()`。
- [ ] 捕获 late capability 在 source revision 改变后复活旧 intent。
- [ ] 捕获 Figure2 hold 中 actualY 改变但 Figure2 progress 固定。
- [ ] 捕获 `/brand-lab` shell 仍持有 `currentScene/stageScene/edge/onPresentation`
  独立 lifecycle；标注由 Task 2 建立 shared factory、Task 6 完成删除。
- [ ] 为 16 个 canonical scene 建 projection completeness test。
- [ ] 为 12 个正常可停驻 hold 建 `assertStablePhoneHold()` 合同。
- [ ] 为 Figure3/TTG/PH/Crane direct cinematic entry 建 frame/identity 合同。
- [ ] baseline 文档记录 HEAD、测试命令、build bytes、Chrome 390×844 与 iOS
  Simulator Safari 的已知症状；不写主观“看起来正常”。

先以普通 `it/test` 运行并把预期失败输出写入 baseline 文档；确认失败原因后，提交前将
尚未修复的单元合同暂时标成 Vitest `it.fails`，并写明负责解除它的 Task 编号。
E2E 只在本 Task 加 helper/fixture，不提交 `skip/fixme` 的永久门禁。Task 1–8 开始时
先把本 Task 对应的 `it.fails` 改回普通 `it`，观察 Red，再实现并转 Green。这样保留
真实失败证据，同时每个提交仍保持测试绿色。

**Run Red once, then run the committed expected-failure form**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app
pnpm exec vitest run \
  src/production/phone/phone-story-sequence.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/phone-transition-coordinator.test.ts \
  src/production/phone/phone-story-presentation.test.ts \
  src/production/phone/PhoneBrandLabStory.test.ts \
  src/production/phone/phone-stable-presentation.test.ts
```

提交前同一命令必须 exit 0；若 `it.fails` 因当前实现意外通过而失败，说明合同分类错误，
必须修正文档/测试，不能改成 `skip`。

**Donor baseline must remain green**

```bash
pnpm exec vitest run \
  src/production/phone/PhoneGradeAStory.test.ts \
  src/production/phone/scenes/PhoneFigure2.test.tsx \
  src/production/phone/scenes/PhonePattern.test.tsx \
  src/production/phone/phone-edge-surface.test.ts \
  src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx \
  src/transitions/figure3-services/phone.test.ts \
  src/transitions/ph-education/phone.test.ts \
  src/transitions/crane-contact/phone.test.ts \
  src/production/phone/phone-lab-contact-timeline.test.ts \
  src/runtime/semantic-data-attribute.test.ts \
  src/media/packed-alpha-video.test.ts
node scripts/verify-boolean-data-contract.mjs
node scripts/verify-homepage-module-boundaries.mjs
node scripts/verify-phone-packed-alpha-masters.mjs
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/phone-story-sequence.test.ts \
  app/src/production/phone/phone-story-orchestrator.test.ts \
  app/src/production/phone/phone-transition-coordinator.test.ts \
  app/src/production/phone/phone-story-presentation.test.ts \
  app/src/production/phone/PhoneBrandLabStory.test.ts \
  app/src/production/phone/phone-stable-presentation.test.ts \
  app/e2e/r5-phone-story.spec.ts \
  docs/react-refactor/reports/r5-phone-execution-layer-baseline.md
git commit -m "test(r5): expose phone execution ownership gaps"
```

### Task 1：用唯一 snapshot reducer 替换 cursor store

**Files**

- Modify: `app/src/production/phone/phone-story-state.ts`
- Modify: `app/src/production/phone/phone-story-state.test.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.types.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.test.ts`
- Modify: `app/src/production/phone/phone-orchestrated-session.ts`
- Modify: `app/src/production/phone/PhoneStoryOrchestratorContext.tsx`
- Modify: `app/src/production/phone/PhoneStoryOrchestratorContext.test.tsx`
- Modify: `app/src/production/phone/phone-story-presentation.ts`
- Modify: `app/src/production/phone/phone-story-presentation.test.ts`

**TDD steps**

- [ ] 在 `phone-story-state.test.ts` 写 discriminated snapshot invariant：
  stable/scroll-run 无 session，transaction 必须有唯一 identity/anchor。
- [ ] 写完整 legal transition table 和 illegal transition no-op 测试。
- [ ] 写 session/generation/leg/scroll-command stale evidence 拒绝测试。
- [ ] `authorityId` 成为 snapshot 的不可变 boot identity；不匹配 authority 的
  session/media/scroll evidence 必须 no-op，且不得产生 effect。
- [ ] 写 forward/reverse monotonic progress 与 multi-leg single-session 测试。
- [ ] 写 rollback generation invalidation 测试。
- [ ] 实现 `reducePhoneStorySnapshot()` 和 effect result。
- [ ] 将 `PhoneStoryCursor` 改为 selector read model；删除独立
  `reducePhoneStoryCursor()` publication path。
- [ ] Orchestrator 只保存一个 `currentSnapshot`，新增 canonical
  `getSnapshot()/subscribe()/dispatch()`；迁移 wrapper 不得保存状态，
  `cursor()` 只调用 selector，并按 Task 3/4/9 的删除点退出。
- [ ] 删除 options 中的 `onCursor`/`onLockChange` publication callback；测试从同一
  snapshot trace 断言 cursor/input。
- [ ] `phone-orchestrated-session.ts` 只把 adapter 回调翻译成 identity event 和执行
  clock effect；删除 `publishCursor/publishLock/publishAnchor/publishPresentation`。
- [ ] Context 使用 `useSyncExternalStore` 暴露
  `usePhoneStorySnapshot()` / `usePhoneStorySelector()`。
- [ ] projection table 对 16 scene exhaustive；没有 default fallback。

**Targeted gate**

```bash
pnpm exec vitest run \
  src/production/phone/phone-story-state.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/phone-story-presentation.test.ts \
  src/production/phone/PhoneStoryOrchestratorContext.test.tsx \
  src/production/phone/phone-story-sequence.test.ts
pnpm typecheck
pnpm build
```

build 超限时不能提交“先加新 reducer、以后再删旧代码”的状态；必须在本 Task 内继续
删除被替代 cursor/session publication code，直到不超过 `663,552`。

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/phone-story-state.ts \
  app/src/production/phone/phone-story-state.test.ts \
  app/src/production/phone/phone-story-orchestrator.types.ts \
  app/src/production/phone/phone-story-orchestrator.ts \
  app/src/production/phone/phone-story-orchestrator.test.ts \
  app/src/production/phone/phone-orchestrated-session.ts \
  app/src/production/phone/PhoneStoryOrchestratorContext.tsx \
  app/src/production/phone/PhoneStoryOrchestratorContext.test.tsx \
  app/src/production/phone/phone-story-presentation.ts \
  app/src/production/phone/phone-story-presentation.test.ts
git commit -m "refactor(r5): replace phone cursor store with one snapshot reducer"
```

### Task 2：建立 route-local runtime factory、同步 projector 与 stable transaction

这是唯一允许跨多个 group 的原子切换 Task：factory/facade、publisher 删除、surface
registration、release lease 与所有直接 caller 必须在同一提交完成，否则会出现第二套
publication path 或无法通过 23-byte headroom。实现时可分小步本地 TDD，但中间态不得
提交、不得用 compatibility overload/feature flag 维持双 runtime。

**Files**

- Modify: `app/scripts/verify-homepage-module-boundaries.mjs`
- Modify: `app/scripts/verify-homepage-module-boundaries.test.mjs`
- Modify: `app/src/main.tsx`
- Create: `app/src/production/phone/phone-route-scope.ts`
- Create: `app/src/production/phone/phone-route-scope.test.ts`
- Create: `app/src/production/phone/phone-story-runtime.ts`
- Create: `app/src/production/phone/phone-story-runtime.test.ts`
- Delete: `app/src/production/phone/phone-orchestrator-publisher.ts`
- Create: `app/src/production/phone/phone-story-projector.ts`
- Create: `app/src/production/phone/phone-story-projector.test.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.ts`
- Modify: `app/src/production/phone/phone-story-sequence.test.ts`
- Modify: `app/src/production/phone/phone-orchestrated-session.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.types.ts`
- Modify: `app/src/production/phone/types.ts`
- Modify: `app/src/production/phone/phone-presentation-contract.test.ts`
- Modify: `app/src/production/phone/PhoneStoryOrchestratorContext.tsx`
- Modify: `app/src/production/phone/PhoneStoryOrchestratorContext.test.tsx`
- Modify: `app/src/production/phone/phone-surface-roles.ts`
- Modify: `app/src/production/phone/phone-surface-roles.test.ts`
- Modify: `app/src/production/phone/phone-boundary-geometry.ts`
- Modify: `app/src/production/phone/phone-boundary-geometry.test.ts`
- Modify: `app/src/production/phone/phone-document-endpoint-alignment.ts`
- Modify: `app/src/production/phone/phone-document-endpoint-alignment.test.ts`
- Modify: `app/src/production/phone/phone-run-landing.ts`
- Modify: `app/src/production/phone/phone-run-landing.test.ts`
- Delete: `app/src/production/phone/usePhoneEdgeSurface.ts`
- Delete: `app/src/production/phone/usePhoneCheckpointPublisher.ts`
- Modify: `app/src/production/phone/usePhoneStoryNavigationRuntime.ts`
- Modify: `app/src/production/phone/usePhoneStoryOrchestratorRuntime.ts`
- Modify: `app/src/production/phone/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone/PhoneBrandLabStory.tsx`
- Modify: `app/src/production/phone/PhoneBrandLabStory.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabContinuation.tsx`
- Modify: `app/src/production/phone/PhoneBrandLabContinuation.test.ts`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.tsx`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.test.ts`
- Modify: `app/src/production/phone/usePhoneStageRuntime.ts`
- Modify: `app/src/production/phone/usePhoneStageRuntime.test.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.test.ts`
- Modify: `app/src/production/phone/phone-composite-runner.ts`
- Modify: `app/src/production/phone/phone-composite-runner.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabStory.visual-contract.test.ts`
- Modify: `app/src/production/portrait-spike/PortraitScrollSpike.contract.test.ts`
- Create: `app/src/production/phone/phone-presentation-transaction.test.ts`
- Create: `app/src/production/phone/phone-stable-presentation.ts`
- Modify: `app/src/production/phone/phone-stable-presentation.test.ts`

**TDD steps**

- [ ] 建立唯一 assembly root `createPhoneStoryRuntime()`；它生成唯一
  `authorityId`，组合 reducer/orchestrator/projector/registry，并返回幂等
  `attach()/dispose()`。
- [ ] factory construction 必须 side-effect free；listener、RAF、timeout、media
  lease 只能在 `attach()` 后产生。用 StrictMode mount/probe 测试证明同一 connected
  root 最多一个 live authority，cleanup 后为零。
- [ ] `usePhoneStoryOrchestratorRuntime` 变成 factory 的薄 React lifetime adapter；
  `PhoneStoryShell` 传 `scope:'formal'`，`PhoneBrandLabStory` 传
  `scope:'brand-lab'`，两者都不得直接调用底层 orchestrator/publisher/coordinator
  constructor。
- [ ] `main.tsx` 只在 normalized pathname 为 `/brand-lab` 时加载 QA scope；删除
  `?scope=brand-lab` alias。验证 `/`、`/?scope=brand-lab` 都进入 formal shell，
  `/brand-lab` 与 `/brand-lab/` 进入 QA shell。
- [ ] Provider 由 route shell 接收 `PhoneStoryAuthority`，但 Context value 只能是其
  `PhoneStoryRuntimePort`；continuation 只能拿 snapshot/dispatch/registration API，
  不能取得内部 engine 或自行 attach/dispose。
- [ ] 对 formal 与 brand-lab QA authority 输入相同 initial entry/event trace，
  去掉 `authorityId`/diagnostic 后 snapshot/effect trace 必须相同；`scope` 不得分支
  reducer、projection、input、timing、media、commit/rollback。
- [ ] sequential mount → dispose → remount 必须得到新 authority identity；旧
  listener/registry/session/RAF/timeout/lease 全部清零，旧 authority evidence
  不能改变新 snapshot。禁止 module-scope runtime singleton。
- [ ] 在 phone adapter contract 定义不可变 `PhoneExecutionIdentity`
  (`authorityId/sessionId/generation/leg/direction`) 与 identity-capturing cinematic
  request；executor 在 start 时注入，adapter 的 progress/complete/failure 必须回传
  捕获值，禁止 callback 发生时再读取“当前 session”冒充 identity。
- [ ] 写 old-dispose-after-new-attach race：旧 projector/document lease 的迟到 cleanup
  不能清除新 root 的 edge/theme/diagnostic；ownership token 不匹配时 cleanup no-op。
- [ ] projector 只把 `data-phone-authority-id` 与
  `data-phone-authority-scope` 作为诊断属性写到当前 root；它们不能成为 CSS
  visibility selector。
- [ ] 写 projector-before-subscriber ordering test。
- [ ] 写 target candidate projection 仍保持 transition/locked 的测试。
- [ ] 写 layout release → remeasure → scroll command → actual scroll confirmation →
  stable verify → final hold 的逐事件测试。
- [ ] 写 final hold 从未与 session/anchor/locked 同时出现的 exhaustive test。
- [ ] 写最多一次 bounded scroll correction，第二次失败 rollback。
- [ ] 写 root disconnect/projector failure 不发布 next snapshot。
- [ ] 写 rollback 使用同一 source precommit pipeline。
- [ ] 将 stable adapter 改为纯 surface registration，删除 `commit()`。
- [ ] 同一 Task 将 Group 4–5/6–7 的 stable registration 改为
  `registerSurface()`；stable scene 先改读 snapshot selector，不能等 Task 6/7 后再
  修复 type/runtime。Task 6/7 继续删除各自 transition/media 的 local state。
- [ ] 将 release lease 拆成 `releaseGeometry()` 与 `releaseResources()`；前者 stable
  前执行，后者 stable 后执行。
- [ ] 同一 Task 更新 AOD、Grade A、composite runner 三个现有
  `provideRelease()` caller：endpoint/alignment/role cleanup 归
  `releaseGeometry()`，AbortController/timeout/media/decoder cleanup 归
  `releaseResources()`；不得靠 overload 暂存旧单回调 API。
- [ ] projector 同步写 root、registered surfaces、edge CSS、theme-color、
  checkpoint；不得调用 React setter。
- [ ] 删除 callback 型 `phone-orchestrator-publisher.ts`，以纯 projection input +
  同步 DOM apply 的 `phone-story-projector.ts` 取代；不得保留同名兼容 wrapper。
- [ ] edge mapping 保留在 frozen pure contract `phone-edge-surface.ts`，但同步写入并入
  projector；同一 Task 删除 `usePhoneEdgeSurface.ts`，不能留下 formal/QA React
  edge publisher。
- [ ] 同一提交更新 module verifier：把“恰好一个
  `usePhoneEdgeSurface()`”旧规则替换为“edge/theme 写入只来自 projector”，并先
  建立 runtime factory/获准 route scope 的基础 gate，保证 Task 2 提交自身通过，
  Task 9 再升级为完整 transitive ownership gate。
- [ ] checkpoint trace 并入 projector，同一 Task 删除独立
  `usePhoneCheckpointPublisher` hook。
- [ ] 删除 orchestrator options 的 `onPresentation` callback；edge/checkpoint/
  navigation 只从 snapshot projection 读取。
- [ ] 删除 `onRetryable` callback；rollback reason/run/generation 写入同一 snapshot
  diagnostics，projector 从该 revision 派生 `data-phone-retryable-run`。新
  transaction 清理旧 diagnostic，shell/QA 不再直接写 retry dataset。
- [ ] 同一 Task 把 `PhoneBrandLabStory` 收窄为 shared-authority QA shell：删除其
  `currentScene/stageScene/publishPresentation/usePhoneEdgeSurface` owner；导航 scene
  读 shared snapshot selector，navigation action 发 shared entry event。Group 4–5
  continuation 内部尚未迁移的 transition render cache 留到 Task 6，但不得再向 QA
  shell 发布 canonical scene/stage truth。
- [ ] navigation scene 改为 snapshot selector；checkpoint trace 由 revision 生成。
- [ ] runtime verifier 只做结构/geometry/opaque contract，不做像素采样。

**Targeted gate**

```bash
pnpm exec vitest run \
  scripts/verify-homepage-module-boundaries.test.mjs \
  src/production/phone/phone-route-scope.test.ts \
  src/production/phone/phone-story-runtime.test.ts \
  src/production/phone/phone-story-projector.test.ts \
  src/production/phone/PhoneStoryOrchestratorContext.test.tsx \
  src/production/phone/phone-presentation-contract.test.ts \
  src/production/phone/phone-presentation-transaction.test.ts \
  src/production/phone/phone-stable-presentation.test.ts \
  src/production/phone/phone-surface-roles.test.ts \
  src/production/phone/phone-boundary-geometry.test.ts \
  src/production/phone/phone-document-endpoint-alignment.test.ts \
  src/production/phone/phone-run-landing.test.ts \
  src/production/phone/PhoneBrandLabContinuation.test.ts \
  src/production/phone/PhoneLabContactContinuation.test.ts \
  src/production/phone/PhoneBrandLabStory.test.ts \
  src/production/phone/usePhoneStageRuntime.test.ts \
  src/production/phone/phone-grade-a-runtime.test.ts \
  src/production/phone/phone-composite-runner.test.ts \
  src/production/phone/PhoneBrandLabStory.visual-contract.test.ts \
  src/production/portrait-spike/PortraitScrollSpike.contract.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/phone-story-sequence.test.ts
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/scripts/verify-homepage-module-boundaries.mjs \
  app/scripts/verify-homepage-module-boundaries.test.mjs \
  app/src/main.tsx \
  app/src/production/phone/phone-route-scope.ts \
  app/src/production/phone/phone-route-scope.test.ts \
  app/src/production/phone/phone-orchestrator-publisher.ts \
  app/src/production/phone/phone-story-projector.ts \
  app/src/production/phone/phone-story-projector.test.ts \
  app/src/production/phone/phone-story-runtime.ts \
  app/src/production/phone/phone-story-runtime.test.ts \
  app/src/production/phone/phone-story-orchestrator.ts \
  app/src/production/phone/phone-story-sequence.test.ts \
  app/src/production/phone/phone-orchestrated-session.ts \
  app/src/production/phone/phone-story-orchestrator.types.ts \
  app/src/production/phone/types.ts \
  app/src/production/phone/phone-presentation-contract.test.ts \
  app/src/production/phone/PhoneStoryOrchestratorContext.tsx \
  app/src/production/phone/PhoneStoryOrchestratorContext.test.tsx \
  app/src/production/phone/phone-surface-roles.ts \
  app/src/production/phone/phone-surface-roles.test.ts \
  app/src/production/phone/phone-boundary-geometry.ts \
  app/src/production/phone/phone-boundary-geometry.test.ts \
  app/src/production/phone/phone-document-endpoint-alignment.ts \
  app/src/production/phone/phone-document-endpoint-alignment.test.ts \
  app/src/production/phone/phone-run-landing.ts \
  app/src/production/phone/phone-run-landing.test.ts \
  app/src/production/phone/usePhoneEdgeSurface.ts \
  app/src/production/phone/usePhoneCheckpointPublisher.ts \
  app/src/production/phone/usePhoneStoryNavigationRuntime.ts \
  app/src/production/phone/usePhoneStoryOrchestratorRuntime.ts \
  app/src/production/phone/PhoneStoryShell.tsx \
  app/src/production/phone/PhoneBrandLabStory.tsx \
  app/src/production/phone/PhoneBrandLabStory.test.ts \
  app/src/production/phone/PhoneBrandLabContinuation.tsx \
  app/src/production/phone/PhoneBrandLabContinuation.test.ts \
  app/src/production/phone/PhoneLabContactContinuation.tsx \
  app/src/production/phone/PhoneLabContactContinuation.test.ts \
  app/src/production/phone/usePhoneStageRuntime.ts \
  app/src/production/phone/usePhoneStageRuntime.test.ts \
  app/src/production/phone/phone-grade-a-runtime.ts \
  app/src/production/phone/phone-grade-a-runtime.test.ts \
  app/src/production/phone/phone-composite-runner.ts \
  app/src/production/phone/phone-composite-runner.test.ts \
  app/src/production/phone/PhoneBrandLabStory.visual-contract.test.ts \
  app/src/production/portrait-spike/PortraitScrollSpike.contract.test.ts \
  app/src/production/phone/phone-presentation-transaction.test.ts \
  app/src/production/phone/phone-stable-presentation.ts \
  app/src/production/phone/phone-stable-presentation.test.ts
git commit -m "refactor(r5): establish route-local phone authority and projector"
```

### Task 3：统一 input、scroll、anchor、navigation 与 direct entry

**Files**

- Modify: `app/src/production/phone/phone-story-runtime.ts`
- Modify: `app/src/production/phone/phone-story-runtime.test.ts`
- Modify: `app/src/production/phone/phone-transition-coordinator.ts`
- Modify: `app/src/production/phone/phone-transition-coordinator.test.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.types.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.test.ts`
- Modify: `app/src/production/phone/phone-story-sequence.test.ts`
- Modify: `app/src/production/phone/phone-story-runs.ts`
- Modify: `app/src/production/phone/phone-story-runs.test.ts`
- Modify: `app/src/production/phone/phone-run-landing.ts`
- Modify: `app/src/production/phone/phone-run-landing.test.ts`
- Modify: `app/src/production/phone/phone-entry-plan.ts`
- Modify: `app/src/production/phone/phone-entry-plan.test.ts`
- Modify: `app/src/production/phone/phone-direct-entry-position.ts`
- Modify: `app/src/production/phone/phone-direct-entry-position.test.ts`
- Modify: `app/src/production/phone/usePhoneStoryEntry.ts`
- Modify: `app/src/production/phone/usePhoneStoryNavigationRuntime.ts`
- Modify: `app/src/production/phone/usePhoneStoryOrchestratorRuntime.ts`
- Modify: `app/src/production/phone/PhoneStoryShell.tsx`
- Create: `app/src/production/phone/phone-scroll-corridor-registry.ts`
- Create: `app/src/production/phone/phone-scroll-corridor-registry.test.ts`
- Create: `app/src/production/phone/usePhoneDocumentScrollRuntime.ts`
- Create: `app/src/production/phone/usePhoneDocumentScrollRuntime.test.ts`

**TDD steps**

- [ ] 为四种 disposition 分别测试 preventDefault/stop/scroll 行为。
- [ ] `pass-native` 明确断言三个 API 都未调用。
- [ ] WebKit probe：浏览器已移动时不 correction；未移动时同 epoch 最多一次。
- [ ] 删除 free-floating `pendingIntent`；boundary claim 立即创建 preparing session。
- [ ] capability late registration 只唤醒 identity 匹配 session。
- [ ] 一个 frame 只采样一个 corridor；多个 registry 同时 mounted 也不能同时 dispatch。
- [ ] shared factory 的 `attach()` 为任意 scope 组装恰好一个 input coordinator 与一个
  document sampler；route shell/hook 不再各自 new。`dispose()` 必须先停止输入与采样，
  再注销 corridor/surface，最后失效 authority identity。
- [ ] front、method-grade-a、group45、group67 corridor 的 boundary/landing 测试。
- [ ] 三种 anchor policy 正逆 exhaustive test，无 default branch。
- [ ] direct stable entry、direct cinematic leg entry、hash/menu/history、rollback 共用同一
  alignment test harness。
- [ ] 删除 direct-entry positioner 的 RAF scroll loop；文件只保留纯 plan/landing
  resolver 或被 corridor resolver 取代。
- [ ] 删除 orchestrator public `handleIntent()` 与 `activateDirectEntry()`；coordinator/
  entry/navigation 只 dispatch event。
- [ ] 正式 shell 创建唯一 coordinator 与唯一 document scroll runtime；Task 4–7
  分组注册 corridor，并在各自提交中删除旧 listener。迁移期间旧 listener 只能做
  尚未迁移 group 的 render cache，禁止写 snapshot/root role；Task 7 结束时旧
  document listener 数必须为零。

**Targeted gate**

```bash
pnpm exec vitest run \
  src/production/phone/phone-story-runtime.test.ts \
  src/production/phone/phone-transition-coordinator.test.ts \
  src/production/phone/phone-scroll-corridor-registry.test.ts \
  src/production/phone/usePhoneDocumentScrollRuntime.test.ts \
  src/production/phone/phone-story-runs.test.ts \
  src/production/phone/phone-run-landing.test.ts \
  src/production/phone/phone-entry-plan.test.ts \
  src/production/phone/phone-direct-entry-position.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/phone-story-sequence.test.ts
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/phone-transition-coordinator.ts \
  app/src/production/phone/phone-story-runtime.ts \
  app/src/production/phone/phone-story-runtime.test.ts \
  app/src/production/phone/phone-transition-coordinator.test.ts \
  app/src/production/phone/phone-story-orchestrator.types.ts \
  app/src/production/phone/phone-story-orchestrator.ts \
  app/src/production/phone/phone-story-orchestrator.test.ts \
  app/src/production/phone/phone-story-sequence.test.ts \
  app/src/production/phone/phone-story-runs.ts \
  app/src/production/phone/phone-story-runs.test.ts \
  app/src/production/phone/phone-run-landing.ts \
  app/src/production/phone/phone-run-landing.test.ts \
  app/src/production/phone/phone-entry-plan.ts \
  app/src/production/phone/phone-entry-plan.test.ts \
  app/src/production/phone/phone-direct-entry-position.ts \
  app/src/production/phone/phone-direct-entry-position.test.ts \
  app/src/production/phone/usePhoneStoryEntry.ts \
  app/src/production/phone/usePhoneStoryNavigationRuntime.ts \
  app/src/production/phone/usePhoneStoryOrchestratorRuntime.ts \
  app/src/production/phone/PhoneStoryShell.tsx \
  app/src/production/phone/phone-scroll-corridor-registry.ts \
  app/src/production/phone/phone-scroll-corridor-registry.test.ts \
  app/src/production/phone/usePhoneDocumentScrollRuntime.ts \
  app/src/production/phone/usePhoneDocumentScrollRuntime.test.ts
git commit -m "refactor(r5): unify phone input scroll and entry ownership"
```

### Task 4：迁移 Front / AOD 到 snapshot

**Files**

- Modify: `app/src/production/phone/phone-story-orchestrator.types.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.test.ts`
- Modify: `app/src/production/phone/PhoneUnit7BIntegration.test.ts`
- Modify: `app/src/production/phone/usePhoneStageRuntime.ts`
- Modify: `app/src/production/phone/usePhoneStageRuntime.test.ts`
- Modify: `app/src/production/phone/phone-stage-timeline.ts`
- Modify: `app/src/production/phone/phone-stage-timeline.test.ts`
- Modify: `app/src/production/phone/phone-transition-stage.ts`
- Modify: `app/src/production/phone/phone-transition-stage.test.ts`
- Modify: `app/src/production/phone/aod-autoplay.ts`
- Modify: `app/src/production/phone/aod-autoplay.test.ts`
- Modify: `app/src/production/phone/usePhoneFrontHalfAdapters.ts`
- Modify: `app/src/production/phone/usePhoneFrontHalfAdapters.test.ts`
- Modify: `app/src/production/phone/adapter-groups/front-half.ts`
- Modify: `app/src/production/phone/scenes/PhoneHero.tsx`
- Modify: `app/src/production/phone/scenes/PhoneHero.test.tsx`
- Modify: `app/src/production/phone/scenes/PhonePattern.tsx`
- Modify: `app/src/production/phone/scenes/PhonePattern.test.tsx`
- Modify: `app/src/production/phone/scenes/PhoneStarMap.tsx`
- Create: `app/src/production/phone/scenes/PhoneStarMap.test.tsx`
- Modify: `app/src/production/phone/scenes/PhoneAod.tsx`
- Create: `app/src/production/phone/scenes/PhoneAod.test.tsx`
- Modify: `app/src/production/phone/PhoneStoryShell.tsx`
- Modify: `app/src/production/phone/PhoneStageRail.css`
- Modify: `app/src/production/phone/PhoneStoryShell.css`
- Modify: `app/src/production/phone/scenes/PhoneHero.css`
- Modify: `app/src/production/phone/scenes/PhonePattern.css`
- Modify: `app/src/production/phone/scenes/PhoneStarMap.css`
- Modify: `app/src/production/phone/scenes/PhoneAod.css`

**TDD steps**

- [ ] ScrollTrigger 只生成 `front-rail` sample，不直接 reconcile hold/run。
- [ ] 删除 runtime durable `aodRun`；AOD session/generation/phase/progress 来自 snapshot。
- [ ] AOD promise/progress/complete/failure event 全部带
  authorityId/sessionId/generation/leg。
- [ ] 删除 `setOwnership()`、`setHeroFigureActive()`、`setPatternActive()`、
  `setStarVisible()`、`setAodFigureActive()` 的 canonical visibility 责任。
- [ ] Hero/Pattern/Star/AOD surface 全部注册到 global registry。
- [ ] scene `active` 只控制 media/resource，不决定 root role。
- [ ] AOD→Method 使用统一 target verify/precommit/stable transaction。
- [ ] 删除 `requestRun()`、`reconcileHold()`、`reconcileScrollHold()`、
  `reconcileScrollRun()` compatibility API；front/AOD 只 dispatch sample/evidence。
- [ ] 删除 Pattern bottom gradient pseudo-element，不新增替代遮挡条。
- [ ] 保留 Unit 4 edge、packed-alpha、AOD semantic edge 与现有 timing。

**Targeted gate**

```bash
pnpm exec vitest run \
  src/production/phone/usePhoneStageRuntime.test.ts \
  src/production/phone/phone-stage-timeline.test.ts \
  src/production/phone/phone-transition-stage.test.ts \
  src/production/phone/aod-autoplay.test.ts \
  src/production/phone/usePhoneFrontHalfAdapters.test.ts \
  src/production/phone/scenes/PhoneHero.test.tsx \
  src/production/phone/scenes/PhonePattern.test.tsx \
  src/production/phone/scenes/PhoneStarMap.test.tsx \
  src/production/phone/scenes/PhoneAod.test.tsx \
  src/production/phone/phone-edge-surface.test.ts \
  src/production/phone/phone-stable-presentation.test.ts \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/PhoneUnit7BIntegration.test.ts
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/phone-story-orchestrator.types.ts \
  app/src/production/phone/phone-story-orchestrator.ts \
  app/src/production/phone/phone-story-orchestrator.test.ts \
  app/src/production/phone/PhoneUnit7BIntegration.test.ts \
  app/src/production/phone/usePhoneStageRuntime.ts \
  app/src/production/phone/usePhoneStageRuntime.test.ts \
  app/src/production/phone/phone-stage-timeline.ts \
  app/src/production/phone/phone-stage-timeline.test.ts \
  app/src/production/phone/phone-transition-stage.ts \
  app/src/production/phone/phone-transition-stage.test.ts \
  app/src/production/phone/aod-autoplay.ts \
  app/src/production/phone/aod-autoplay.test.ts \
  app/src/production/phone/usePhoneFrontHalfAdapters.ts \
  app/src/production/phone/usePhoneFrontHalfAdapters.test.ts \
  app/src/production/phone/adapter-groups/front-half.ts \
  app/src/production/phone/scenes/PhoneHero.tsx \
  app/src/production/phone/scenes/PhoneHero.test.tsx \
  app/src/production/phone/scenes/PhonePattern.tsx \
  app/src/production/phone/scenes/PhonePattern.test.tsx \
  app/src/production/phone/scenes/PhoneStarMap.tsx \
  app/src/production/phone/scenes/PhoneStarMap.test.tsx \
  app/src/production/phone/scenes/PhoneAod.tsx \
  app/src/production/phone/scenes/PhoneAod.test.tsx \
  app/src/production/phone/PhoneStoryShell.tsx \
  app/src/production/phone/PhoneStageRail.css \
  app/src/production/phone/PhoneStoryShell.css \
  app/src/production/phone/scenes/PhoneHero.css \
  app/src/production/phone/scenes/PhonePattern.css \
  app/src/production/phone/scenes/PhoneStarMap.css \
  app/src/production/phone/scenes/PhoneAod.css
git commit -m "refactor(r5): migrate front stage and aod to phone snapshot"
```

### Task 5：迁移 Grade A，并关闭三个原始症状

**Files**

- Modify: `app/src/production/phone/PhoneGradeAStory.tsx`
- Modify: `app/src/production/phone/PhoneGradeAStory.test.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.ts`
- Modify: `app/src/production/phone/phone-grade-a-runtime.test.ts`
- Modify: `app/src/production/phone/usePhoneGradeAAdapters.ts`
- Modify: `app/src/production/phone/adapter-groups/grade-a.ts`
- Modify: `app/src/production/phone/transitions/method-bottom-figure2.ts`
- Modify: `app/src/production/phone/transitions/figure2-distance-expand.tsx`
- Modify: `app/src/production/phone/transitions/figure2-proof-brand.ts`
- Modify: `app/src/production/phone/transitions/PhoneInkTransition.tsx`
- Modify: `app/src/production/phone/transitions/PhoneEndpointTransition.ts`
- Modify: `app/src/production/phone/transitions/grade-a-transitions.test.ts`
- Modify: `app/src/production/phone/scenes/PhoneMethodTop.tsx`
- Modify: `app/src/production/phone/scenes/PhoneMethodTop.test.ts`
- Modify: `app/src/production/phone/scenes/PhoneMethodTop.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.tsx`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.test.tsx`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2Proof.tsx`
- Modify: `app/src/production/phone/scenes/PhoneFigure2Proof.test.tsx`
- Modify: `app/src/production/phone/scenes/PhoneFigure2Proof.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2Arch.tsx`
- Modify: `app/src/production/phone/PhoneGradeAStory.css`
- Modify: `app/src/production/phone/PhoneStageRail.css`

**TDD steps**

- [ ] 删除 `PhoneGradeARunView`、component `runView`、local scroll/resize/orientation
  listeners。
- [ ] 删除 `stableGradeAHold` 提前 return；所有 frame 只由 snapshot selector 决定。
- [ ] Grade A 只注册 corridor、surface、boundary、adapter capability。
- [ ] `phone-grade-a-runtime.ts` 只做 effect/adapter 翻译，不保存第二份 phase/step。
- [ ] `hold:method-top`：`stageOwner=native`，Method root 唯一 stable，文字可见且原生滚动。
- [ ] `hold:figure2-animation`：Figure2 progress 来自 snapshot scroll sample；新手势可继续
  更新并进入 Proof，不固定为 0。
- [ ] `hold:figure2-proof`：Proof panel progress 来自 snapshot corridor。
- [ ] Method→Figure2、Figure2→Proof、Proof→Brand 正逆均使用 authored boundary。
- [ ] Figure2 root/depth/arch 与 stage 使用同一 opaque paper；full-screen box 只保留一套
  尺寸约束。
- [ ] transition endpoint 与 stable first frame DOM/media 完全连续。
- [ ] 保留 Figure2 packed-alpha hash、poster、foreground arch、playMs 与 Unit 4 ink。

**Required symptom gate before proceeding**

- [ ] Method 五步文字不消失；
- [ ] Figure2 hold 可继续滚动并进入 Proof，也可反向回 Method；
- [ ] Pattern 无底横条，Figure2 无底边/右边露底；
- [ ] Chrome 390×844 与 iOS Simulator Safari 都通过，才进入 Group 4–5。

**Targeted gate**

```bash
pnpm exec vitest run \
  src/production/phone/PhoneGradeAStory.test.ts \
  src/production/phone/phone-grade-a-runtime.test.ts \
  src/production/phone/transitions/grade-a-transitions.test.ts \
  src/production/phone/scenes/PhoneMethodTop.test.ts \
  src/production/phone/scenes/PhoneFigure2.test.tsx \
  src/production/phone/scenes/PhoneFigure2Proof.test.tsx \
  src/production/phone/phone-presentation-transaction.test.ts \
  src/production/phone/phone-stable-presentation.test.ts
node scripts/verify-phone-packed-alpha-masters.mjs
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/PhoneGradeAStory.tsx \
  app/src/production/phone/PhoneGradeAStory.test.ts \
  app/src/production/phone/phone-grade-a-runtime.ts \
  app/src/production/phone/phone-grade-a-runtime.test.ts \
  app/src/production/phone/usePhoneGradeAAdapters.ts \
  app/src/production/phone/adapter-groups/grade-a.ts \
  app/src/production/phone/transitions/method-bottom-figure2.ts \
  app/src/production/phone/transitions/figure2-distance-expand.tsx \
  app/src/production/phone/transitions/figure2-proof-brand.ts \
  app/src/production/phone/transitions/PhoneInkTransition.tsx \
  app/src/production/phone/transitions/PhoneEndpointTransition.ts \
  app/src/production/phone/transitions/grade-a-transitions.test.ts \
  app/src/production/phone/scenes/PhoneMethodTop.tsx \
  app/src/production/phone/scenes/PhoneMethodTop.test.ts \
  app/src/production/phone/scenes/PhoneMethodTop.css \
  app/src/production/phone/scenes/PhoneFigure2.tsx \
  app/src/production/phone/scenes/PhoneFigure2.test.tsx \
  app/src/production/phone/scenes/PhoneFigure2.css \
  app/src/production/phone/scenes/PhoneFigure2Proof.tsx \
  app/src/production/phone/scenes/PhoneFigure2Proof.test.tsx \
  app/src/production/phone/scenes/PhoneFigure2Proof.css \
  app/src/production/phone/scenes/PhoneFigure2Arch.tsx \
  app/src/production/phone/PhoneGradeAStory.css \
  app/src/production/phone/PhoneStageRail.css
git commit -m "refactor(r5): migrate grade a execution to phone snapshot"
```

### Task 6：迁移 Group 4–5，并保留 Unit 5 / 7A compositor

**Files**

- Modify: `app/src/production/phone/PhoneBrandLabStory.tsx`
- Modify: `app/src/production/phone/PhoneBrandLabStory.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabStory.visual-contract.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabContinuation.tsx`
- Modify: `app/src/production/phone/PhoneBrandLabContinuation.test.ts`
- Modify: `app/src/production/phone/phone-composite-runner.ts`
- Modify: `app/src/production/phone/phone-composite-runner.test.ts`
- Modify: `app/src/production/phone/phone-brand-lab-runtime.ts`
- Modify: `app/src/production/phone/phone-brand-lab-runtime.test.ts`
- Modify: `app/src/production/phone/usePhoneGroup45Adapters.ts`
- Modify: `app/src/production/phone/usePhoneGroup45Adapters.test.ts`
- Modify: `app/src/production/phone/adapter-groups/group4-5.ts`
- Modify: `app/src/production/phone/adapter-groups/group4-5.test.ts`
- Modify: `app/src/production/phone/adapter-groups/group4-5-native-autoplay.ts`
- Modify: `app/src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts`
- Modify: `app/src/production/phone/PhoneBrandLabStory.css`
- Modify: `app/src/scenes/brand/phone/PhoneBrand.tsx`
- Modify: `app/src/scenes/brand/phone/PhoneBrand.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.css`
- Modify: `app/src/scenes/services/phone/PhoneServices.tsx`
- Modify: `app/src/scenes/services/phone/PhoneServices.test.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.tsx`
- Modify: `app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx`
- Modify: `app/src/scenes/lab/phone/PhoneLab.tsx`
- Modify: `app/src/scenes/lab/phone/PhoneLab.test.tsx`
- Modify: `app/src/transitions/brand-figure3/phone.ts`
- Modify: `app/src/transitions/brand-figure3/phone.test.ts`
- Modify: `app/src/transitions/figure3-services/phone.ts`
- Modify: `app/src/transitions/figure3-services/phone.test.ts`
- Modify: `app/src/transitions/services-ttg/phone.ts`
- Modify: `app/src/transitions/services-ttg/phone.test.ts`
- Modify: `app/src/transitions/ttg-lab/phone.ts`
- Modify: `app/src/transitions/ttg-lab/phone.test.ts`
- Modify: `app/src/transitions/group45-phone-transition-lifecycle.test.ts`

**TDD steps**

- [ ] 删除 continuation 内的 `currentScene`、`stageScene`、`scrollDirection`
  presentation state 和 `activeRunRef`；删除 QA shell 的 `entryScene` publication
  path，initial/hash/menu/history 全部进入 shared entry transaction。
- [ ] 删除 `visualActivity` presentation state 与 `onStageSceneChange` callback；
  media active/prewarm 由 snapshot selector + dependency closure 决定。
- [ ] `PhoneBrandLabStory` 最终只保留 root/stage host、`menuOpen` 与 validation UI：
  authority 来自 `createPhoneStoryRuntime(scope:'brand-lab')` 的共享 hook，
  current navigation/edge/stage scene 全读同一个 snapshot/projector；document
  diagnostics 由 authority attach/projector 发布，shell 不再维护 layout lifecycle。
- [ ] `/brand-lab` 与 formal `/` 针对相同 Group 4–5 event trace 的 reducer、
  projection、input disposition、run/commit trace 必须相同；允许差异只有 mounted
  subtree、initial entry 与 QA diagnostic。
- [ ] unmount QA shell 后 authority live count、document listener、scroll sampler、
  registry、RAF/timeout/media lease 全部归零；再次挂载必须是新 authorityId，旧
  evidence no-op。
- [ ] `adapterScene` 只能是 lazy/prewarm cache；visibility 与 active leg 来自 snapshot。
- [ ] composite runner 变成 effect executor：不保存 active/step，不调用
  `onRunState/onRunBegin/onMediaActive` 建第二套状态。
- [ ] Figure3/TTG progress、direction、media event 全部匹配
  authorityId/sessionId/generation/leg/direction。
- [ ] Figure3/TTG executor 通过 identity-capturing cinematic request 启动 adapter；
  每个 progress/complete/failure 回调回传启动时捕获的 identity，禁止从
  `activeRunRef` 或 callback 时刻的 snapshot 补标签。
- [ ] Brand/Services/Lab stable visibility 只读 surface role；scene `active` 不再是
  canonical visibility owner。
- [ ] 删除 group45 local stage-active/stage-scene/snap token。
- [ ] Brand→Services、Services→Lab 各自保持一个 session，切 leg 不解锁。
- [ ] `preserve-composite` forward/reverse/direct/rollback 全部对齐。
- [ ] Figure3→Services 保留两端 persistent opacity layer；不得把 stable cleanup 改回
  clear/recreate。
- [ ] 保留 Figure3 exact initial/terminal poster、240 ms fallback 和 theme-color path。

**Targeted gate**

```bash
pnpm exec vitest run \
  src/production/phone/phone-story-runtime.test.ts \
  src/production/phone/PhoneBrandLabContinuation.test.ts \
  src/production/phone/PhoneBrandLabStory.test.ts \
  src/production/phone/PhoneBrandLabStory.visual-contract.test.ts \
  src/production/phone/phone-composite-runner.test.ts \
  src/production/phone/phone-brand-lab-runtime.test.ts \
  src/production/phone/usePhoneGroup45Adapters.test.ts \
  src/production/phone/adapter-groups/group4-5.test.ts \
  src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts \
  src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx \
  src/transitions/figure3-services/phone.test.ts \
  src/transitions/group45-phone-transition-lifecycle.test.ts \
  src/production/phone/phone-presented-reverse-playback.test.ts \
  src/production/phone/phone-stable-presentation.test.ts
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/PhoneBrandLabStory.tsx \
  app/src/production/phone/PhoneBrandLabStory.test.ts \
  app/src/production/phone/PhoneBrandLabStory.visual-contract.test.ts \
  app/src/production/phone/PhoneBrandLabContinuation.tsx \
  app/src/production/phone/PhoneBrandLabContinuation.test.ts \
  app/src/production/phone/phone-composite-runner.ts \
  app/src/production/phone/phone-composite-runner.test.ts \
  app/src/production/phone/phone-brand-lab-runtime.ts \
  app/src/production/phone/phone-brand-lab-runtime.test.ts \
  app/src/production/phone/usePhoneGroup45Adapters.ts \
  app/src/production/phone/usePhoneGroup45Adapters.test.ts \
  app/src/production/phone/adapter-groups/group4-5.ts \
  app/src/production/phone/adapter-groups/group4-5.test.ts \
  app/src/production/phone/adapter-groups/group4-5-native-autoplay.ts \
  app/src/production/phone/adapter-groups/group4-5-native-autoplay.test.ts \
  app/src/production/phone/PhoneBrandLabStory.css \
  app/src/scenes/brand/phone/PhoneBrand.tsx \
  app/src/scenes/brand/phone/PhoneBrand.test.tsx \
  app/src/scenes/figure3-animation/phone/PhoneFigure3.tsx \
  app/src/scenes/figure3-animation/phone/PhoneFigure3.test.tsx \
  app/src/scenes/figure3-animation/phone/PhoneFigure3.css \
  app/src/scenes/services/phone/PhoneServices.tsx \
  app/src/scenes/services/phone/PhoneServices.test.tsx \
  app/src/scenes/ttg-animation/phone/PhoneTtg.tsx \
  app/src/scenes/ttg-animation/phone/PhoneTtg.test.tsx \
  app/src/scenes/lab/phone/PhoneLab.tsx \
  app/src/scenes/lab/phone/PhoneLab.test.tsx \
  app/src/transitions/brand-figure3/phone.ts \
  app/src/transitions/brand-figure3/phone.test.ts \
  app/src/transitions/figure3-services/phone.ts \
  app/src/transitions/figure3-services/phone.test.ts \
  app/src/transitions/services-ttg/phone.ts \
  app/src/transitions/services-ttg/phone.test.ts \
  app/src/transitions/ttg-lab/phone.ts \
  app/src/transitions/ttg-lab/phone.test.ts \
  app/src/transitions/group45-phone-transition-lifecycle.test.ts
git commit -m "refactor(r5): migrate group45 execution to phone snapshot"
```

### Task 7：迁移 Group 6–7、direct entry，并保留 Unit 6 reverse

**Files**

- Modify: `app/src/production/phone/PhoneLabContactContinuation.tsx`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.test.ts`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.css`
- Modify: `app/src/production/phone/phone-lab-contact-runtime.ts`
- Modify: `app/src/production/phone/phone-lab-contact-runtime.test.ts`
- Modify: `app/src/production/phone/phone-lab-contact-timeline.ts`
- Modify: `app/src/production/phone/phone-lab-contact-timeline.test.ts`
- Modify: `app/src/production/phone/scenes/usePhoneCinematicRun.ts`
- Create: `app/src/production/phone/scenes/usePhoneCinematicRun.test.ts`
- Modify: `app/src/production/phone/usePhoneGroup67Adapters.ts`
- Modify: `app/src/production/phone/usePhoneGroup67Adapters.test.ts`
- Modify: `app/src/production/phone/adapter-groups/group6-7.ts`
- Modify: `app/src/production/phone/adapter-groups/group6-7.test.ts`
- Modify: `app/src/production/phone/PhoneGroup67DirectEntry.tsx`
- Modify: `app/src/production/phone/PhoneGroup67DirectEntry.css`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.tsx`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.test.tsx`
- Modify: `app/src/scenes/education/phone/PhoneEducation.tsx`
- Modify: `app/src/scenes/education/phone/PhoneEducation.test.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.tsx`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.test.tsx`
- Modify: `app/src/scenes/contact/phone/PhoneContact.tsx`
- Modify: `app/src/scenes/contact/phone/PhoneContact.test.tsx`
- Modify: `app/src/transitions/lab-ph/phone.ts`
- Modify: `app/src/transitions/lab-ph/phone.test.ts`
- Modify: `app/src/transitions/ph-education/phone.ts`
- Modify: `app/src/transitions/ph-education/phone.test.ts`
- Modify: `app/src/transitions/education-crane/phone.ts`
- Modify: `app/src/transitions/education-crane/phone.test.ts`
- Modify: `app/src/transitions/crane-contact/phone.ts`
- Modify: `app/src/transitions/crane-contact/phone.test.ts`

**TDD steps**

- [ ] 删除 `focus/currentScene/stageScene/prewarmScene/activeRunRef` 的 durable
  presentation 责任。
- [ ] 删除 `onStageSceneChange` presentation callback；direct-entry parent 只传
  capability boundary，不接收 scene owner 回调。
- [ ] dependency focus/prewarm 从 snapshot run dependency closure 派生。
- [ ] PH/Crane autoplay custom event 必须包含并匹配
  authorityId/sessionId/generation/leg/direction；`PhonePh`、`PhoneCrane` 与
  `usePhoneCinematicRun` 只能回传 controller 注入的 active identity，旧 route 或旧
  generation event 被拒绝。
- [ ] legacy isolated `PhoneLabContactShell` 若继续调用无 identity 的
  `enter/reverse`，event detail 必须把 identity 字段显式置 `null`；formal
  `PhoneLabContactContinuation` 一律拒绝 nullable identity。不得让 legacy shell
  成为 `/brand-lab` 或 formal evidence。
- [ ] 删除 group67 local stage-active/layer-active/active-scene token 的 visibility
  责任。
- [ ] Lab→Education、Education→Contact 各自只有一个 session，切 leg 不 settle。
- [ ] PH→Education 与 Crane→Contact 保留 persistent endpoint opacity/inert policy。
- [ ] `phoneLabContactRetainsPhTerminal()` 与
  `phoneLabContactRetainsCraneTerminal()` 继续通过。
- [ ] Education/Contact 原生 wheel/touch/key/focus/pointer 不被 cinematic owner 拦截。
- [ ] Group45/Group67 direct entry 与冷启动复用同一 surface/corridor/transaction，
  不创建第二个 shell store。
- [ ] `PhoneLabContactShell.tsx` 只保留独立验证用途，不进入正式
  `PhoneStoryShell` 模块图。

**Targeted gate**

```bash
pnpm exec vitest run \
  src/production/phone/PhoneLabContactContinuation.test.ts \
  src/production/phone/phone-lab-contact-runtime.test.ts \
  src/production/phone/phone-lab-contact-timeline.test.ts \
  src/production/phone/scenes/usePhoneCinematicRun.test.ts \
  src/production/phone/usePhoneGroup67Adapters.test.ts \
  src/production/phone/adapter-groups/group6-7.test.ts \
  src/scenes/ph-animation/phone/PhonePh.test.tsx \
  src/scenes/crane-animation/phone/PhoneCrane.test.tsx \
  src/transitions/lab-ph/phone.test.ts \
  src/transitions/ph-education/phone.test.ts \
  src/transitions/education-crane/phone.test.ts \
  src/transitions/crane-contact/phone.test.ts \
  src/production/phone/phone-presented-reverse-playback.test.ts \
  src/production/phone/phone-stable-presentation.test.ts
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/PhoneLabContactContinuation.tsx \
  app/src/production/phone/PhoneLabContactContinuation.test.ts \
  app/src/production/phone/PhoneLabContactContinuation.css \
  app/src/production/phone/phone-lab-contact-runtime.ts \
  app/src/production/phone/phone-lab-contact-runtime.test.ts \
  app/src/production/phone/phone-lab-contact-timeline.ts \
  app/src/production/phone/phone-lab-contact-timeline.test.ts \
  app/src/production/phone/scenes/usePhoneCinematicRun.ts \
  app/src/production/phone/scenes/usePhoneCinematicRun.test.ts \
  app/src/production/phone/usePhoneGroup67Adapters.ts \
  app/src/production/phone/usePhoneGroup67Adapters.test.ts \
  app/src/production/phone/adapter-groups/group6-7.ts \
  app/src/production/phone/adapter-groups/group6-7.test.ts \
  app/src/production/phone/PhoneGroup67DirectEntry.tsx \
  app/src/production/phone/PhoneGroup67DirectEntry.css \
  app/src/scenes/ph-animation/phone/PhonePh.tsx \
  app/src/scenes/ph-animation/phone/PhonePh.test.tsx \
  app/src/scenes/education/phone/PhoneEducation.tsx \
  app/src/scenes/education/phone/PhoneEducation.test.tsx \
  app/src/scenes/crane-animation/phone/PhoneCrane.tsx \
  app/src/scenes/crane-animation/phone/PhoneCrane.test.tsx \
  app/src/scenes/contact/phone/PhoneContact.tsx \
  app/src/scenes/contact/phone/PhoneContact.test.tsx \
  app/src/transitions/lab-ph/phone.ts \
  app/src/transitions/lab-ph/phone.test.ts \
  app/src/transitions/ph-education/phone.ts \
  app/src/transitions/ph-education/phone.test.ts \
  app/src/transitions/education-crane/phone.ts \
  app/src/transitions/education-crane/phone.test.ts \
  app/src/transitions/crane-contact/phone.ts \
  app/src/transitions/crane-contact/phone.test.ts
git commit -m "refactor(r5): migrate group67 and direct entry to phone snapshot"
```

### Task 8：统一 CSS surface role 与 full-bleed coverage

**Files**

- Modify: `app/src/production/phone/phone-story-projector.ts`
- Modify: `app/src/production/phone/phone-story-projector.test.ts`
- Modify: `app/src/production/phone/PhoneStageRail.css`
- Modify: `app/src/production/phone/PhoneStoryShell.css`
- Modify: `app/src/production/phone/PhoneGradeAStory.css`
- Modify: `app/src/production/phone/PhoneBrandLabStory.css`
- Modify: `app/src/production/phone/PhoneLabContactContinuation.css`
- Modify: `app/src/production/phone/PhoneGroup67DirectEntry.css`
- Modify: `app/src/production/phone/scenes/PhonePattern.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2.css`
- Modify: `app/src/production/phone/scenes/PhoneFigure2Proof.css`
- Modify: `app/src/scenes/figure3-animation/phone/PhoneFigure3.css`
- Modify: `app/src/scenes/ph-animation/phone/PhonePh.css`
- Modify: `app/src/scenes/crane-animation/phone/PhoneCrane.css`
- Modify: `app/src/scenes/brand/phone/PhoneBrand.css`
- Modify: `app/src/scenes/services/phone/PhoneServices.css`
- Modify: `app/src/scenes/lab/phone/PhoneLab.css`
- Modify: `app/src/scenes/education/phone/PhoneEducation.css`
- Modify: `app/src/scenes/contact/phone/PhoneContact.css`
- Modify: `app/src/production/phone/phone-layer-contract.test.ts`
- Modify: `app/src/production/phone/phone-stable-presentation.test.ts`

**TDD steps**

- [ ] CSS visibility 只读取 `data-phone-surface-role` 与 root stage owner/scene。
- [ ] 删除：
  - `data-portrait-stage-active`
  - `data-phone-grade-a-active`
  - `data-phone-group45-snap`
  - `data-phone-group45-stage-active`
  - `data-phone-group45-stage-scene`
  - `data-phone-group67-stage-active`
  - `data-phone-group67-layer-active`
  - 等价 group-local visibility token。
- [ ] projector 同一提交停止派生迁移期
  `data-portrait-stage-active`；对应测试改为只认 global stage owner/surface role。
- [ ] 删除 Group 6–7 `:has()` cross-group ownership。
- [ ] 删除 group-specific z-index exception；只保留 §6.1 层级。
- [ ] fixed full-screen box 在每个 selector 中只使用一套尺寸：
  `position + inset`，不得再同时写 `left/right/width` 或
  `top/bottom/height/min-height`。
- [ ] coverage root 用 `100dvh` + `100svh` fallback，统一处理 visualViewport；
  不新增伪元素遮挡底边。
- [ ] Pattern background 自身不透明，删除 bottom gradient。
- [ ] Figure2、Proof、Figure3、PH、Crane 的 poster/canvas 后面都有同色 opaque
  coverage surface。
- [ ] native article 在其 stable landing 覆盖 visual viewport；document edge fallback
  与 theme-color 同色。

**Targeted gate**

```bash
pnpm exec vitest run \
  src/production/phone/phone-story-projector.test.ts \
  src/production/phone/phone-layer-contract.test.ts \
  src/production/phone/phone-stable-presentation.test.ts \
  src/production/phone/PhoneGradeAStory.test.ts \
  src/production/phone/PhoneBrandLabStory.visual-contract.test.ts \
  src/production/phone/PhoneLabContactContinuation.test.ts \
  src/production/phone/phone-edge-surface.test.ts
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/src/production/phone/PhoneStageRail.css \
  app/src/production/phone/phone-story-projector.ts \
  app/src/production/phone/phone-story-projector.test.ts \
  app/src/production/phone/PhoneStoryShell.css \
  app/src/production/phone/PhoneGradeAStory.css \
  app/src/production/phone/PhoneBrandLabStory.css \
  app/src/production/phone/PhoneLabContactContinuation.css \
  app/src/production/phone/PhoneGroup67DirectEntry.css \
  app/src/production/phone/scenes/PhonePattern.css \
  app/src/production/phone/scenes/PhoneFigure2.css \
  app/src/production/phone/scenes/PhoneFigure2Proof.css \
  app/src/scenes/figure3-animation/phone/PhoneFigure3.css \
  app/src/scenes/ph-animation/phone/PhonePh.css \
  app/src/scenes/crane-animation/phone/PhoneCrane.css \
  app/src/scenes/brand/phone/PhoneBrand.css \
  app/src/scenes/services/phone/PhoneServices.css \
  app/src/scenes/lab/phone/PhoneLab.css \
  app/src/scenes/education/phone/PhoneEducation.css \
  app/src/scenes/contact/phone/PhoneContact.css \
  app/src/production/phone/phone-layer-contract.test.ts \
  app/src/production/phone/phone-stable-presentation.test.ts
git commit -m "fix(r5): unify phone surface roles and viewport coverage"
```

### Task 9：删除旁路并把 architecture gate 升级为所有权门禁

**Files**

- Modify: `app/scripts/verify-homepage-module-boundaries.mjs`
- Modify: `app/scripts/verify-homepage-module-boundaries.test.mjs`
- Modify: `app/scripts/verify-boolean-data-contract.mjs`
- Modify: `app/scripts/verify-boolean-data-contract.test.mjs`
- Modify: `app/src/production/phone/phone-story-orchestrator.types.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.ts`
- Modify: `app/src/production/phone/phone-story-orchestrator.test.ts`
- Modify: `app/src/production/phone/PhoneUnit7BIntegration.test.ts`
- Modify: `app/src/production/phone/phone-presentation-contract.test.ts`
- Modify: `app/src/production/phone/phone-story-sequence.test.ts`
- Modify: `app/src/production/portrait-spike/PortraitScrollSpike.contract.test.ts`

**Gate rules**

- [ ] 从 `PhoneStoryBootstrap.tsx` / `PhoneStoryShell.tsx` 递归解析 static + literal
  dynamic imports；formal `/` transitive graph 必须排除
  `PhoneBrandLabStory.tsx`、`scenes/PhoneBrandLabScope.tsx` 与
  `PhoneLabContactShell.tsx`，但继续允许 shared continuations/runtime。
- [ ] route selector 只允许 normalized `/brand-lab` 进入 QA scope；formal `/` 上的
  query/hash 不得替换 authority owner。
- [ ] 正式 production 模块图只允许一个 snapshot store/runtime factory；底层
  `createPhoneStoryOrchestrator` 只能由 `phone-story-runtime.ts` assembly 调用。
- [ ] `createPhoneStoryRuntime` 的 production call site 只允许 shared React lifetime
  adapter；`PhoneStoryShell` 必须注入 literal `scope:'formal'`，
  `PhoneBrandLabStory` 必须注入 literal `scope:'brand-lab'`。禁止
  module-scope authority/store singleton。
- [ ] Context export 只能暴露 `PhoneStoryRuntimePort`，不得包含
  `attach/dispose` 或内部 engine；full `PhoneStoryAuthority` 只能停留在 route
  lifetime hook 与对应 shell。
- [ ] QA shell 禁止直接导入/调用底层 orchestrator、publisher、intent coordinator、
  document sampler；禁止 `useState/useRef/setter` 形式的
  `currentScene/stageScene` owner、`onPresentation`、edge publisher、scroll
  listener、run/session/lock owner；允许只读 snapshot selector。
- [ ] runtime contract 断言每个 connected route root 恰好一个 live authority；
  dispose 后为零，remount 得到新 identity，绝不能断言两个互斥 route 共用同一对象。
- [ ] global presentation tokens 只允许 projector 文件写。
- [ ] `phoneSurfaceRole` 只允许 surface/projector 文件写。
- [ ] 正式 child 禁止 `window.scrollTo/scrollBy/scrollIntoView`。
- [ ] 正式 child 禁止 wheel/touch/document-scroll listener。
- [ ] Shell 只实例化一个 intent coordinator 和一个 document scroll runtime。
- [ ] Grade A、Group 4–5、Group 6–7 禁止 group-local stage/snap/scene visibility
  attributes。
- [ ] `PhoneStableSceneAdapter` 不再存在 `commit()`。
- [ ] 删除 public `cursor()` compatibility API；所有正式 caller/test 改用
  `getSnapshot()` 或 selector。
- [ ] formal component 禁止以 `useState<SceneId | ...>`、`activeRunRef`、
  `runView` 维护 presentation truth；loader/prewarm allowlist 必须显式列出。
- [ ] `PhoneRunDefinition.anchor` 三种值被 exhaustive resolver 消费。
- [ ] `PhoneLabContactShell` 只可留在显式 legacy/isolated validation allowlist，不得
  作为 `/brand-lab` implementation，也不得进入正式 shell transitive import graph。
- [ ] `data-phone-authority-id/scope` 只允许 projector 写入 root diagnostics，CSS
  禁止读取这两个 attribute 决定可见性、层级或时序。
- [ ] gate 扫描行为/API/attribute 写入，不只禁止旧变量名。
- [ ] 现有 semantic boolean 与 module budget 规则继续保留。

**Run**

```bash
node scripts/verify-homepage-module-boundaries.mjs
node scripts/verify-boolean-data-contract.mjs
pnpm exec vitest run \
  scripts/verify-homepage-module-boundaries.test.mjs \
  scripts/verify-boolean-data-contract.test.mjs \
  src/production/phone/phone-story-orchestrator.test.ts \
  src/production/phone/PhoneUnit7BIntegration.test.ts \
  src/production/phone/phone-story-runtime.test.ts \
  src/production/phone/PhoneBrandLabStory.test.ts \
  src/production/phone/phone-presentation-contract.test.ts \
  src/production/phone/phone-story-sequence.test.ts \
  src/production/portrait-spike/PortraitScrollSpike.contract.test.ts
pnpm typecheck
pnpm build
```

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/scripts/verify-homepage-module-boundaries.mjs \
  app/scripts/verify-homepage-module-boundaries.test.mjs \
  app/scripts/verify-boolean-data-contract.mjs \
  app/scripts/verify-boolean-data-contract.test.mjs \
  app/src/production/phone/phone-story-orchestrator.types.ts \
  app/src/production/phone/phone-story-orchestrator.ts \
  app/src/production/phone/phone-story-orchestrator.test.ts \
  app/src/production/phone/PhoneUnit7BIntegration.test.ts \
  app/src/production/phone/phone-presentation-contract.test.ts \
  app/src/production/phone/phone-story-sequence.test.ts \
  app/src/production/portrait-spike/PortraitScrollSpike.contract.test.ts
git commit -m "test(r5): enforce one phone execution owner"
```

### Task 10：浏览器、Simulator、实体 iPhone 完整验收

**Files**

- Modify: `app/e2e/r5-phone-story.spec.ts`
- Create: `app/playwright.phone.config.ts`
- Create: `docs/react-refactor/reports/r5-phone-state-machine-acceptance.md`
- Modify: `docs/react-refactor/reports/r5-phone-execution-layer-baseline.md`

**10.1 E2E helper 必须检查完整 stable contract**

`assertStablePhoneHold(page, scene)` 每次一次性读取同一 revision，并断言：

1. 当前 connected route root 恰好一个 live authority，`authorityId` 非空且 revision
   取自该 authority；
2. status/cursor 是目标 stable hold；
3. session 为空；
4. input 为 free；
5. anchor attribute 不存在；
6. actualY/corridor/progress 与 landing contract 对齐；
7. stage owner/scene 正确；
8. 恰好一个 stable surface；
9. root connected、非 hidden、opacity > 0、inert/pointer 正确；
10. coverageRoot 覆盖 visualViewport 四边；
11. edge/root/document/theme-color 同一颜色；
12. checkpoint/navigation 与 scene 一致；
13. 下一次新 epoch 输入能原生滚动或 claim 唯一 adjacent run。

helper 不得只等待 `data-phone-cursor`。

**10.2 Transition helper**

每个 leg 的 0%、中点、terminal 都检查：

- authorityId/sessionId/generation/leg 未改变或按规定推进；
- source/receiver role；
- progress 单调；
- coverage owner；
- edge 在 target presented 前不提前切换；
- multi-leg 中间不 settle/不 unlock；
- final stable 发布前不存在 `hold:*`。

**10.3 Automated commands**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm run verify:media:phone-masters
pnpm exec playwright test \
  --config playwright.phone.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=phone-chromium
pnpm exec playwright test \
  --config playwright.phone.config.ts \
  e2e/r5-phone-story.spec.ts \
  --project=phone-webkit
```

`playwright.phone.config.ts` 使用 production preview，精确定义两个 project：

- `phone-chromium`：390×844、touch/mobile；
- `phone-webkit`：iPhone 15 portrait；
- 单 worker；
- R5 spec timeout 120 s；
- 失败时 trace + screenshot。

Playwright WebKit 只是快速 engine gate，不等同于 iOS Simulator Safari。

**10.4 Required automated journeys**

- [ ] cold Hero→Contact；
- [ ] Contact→Hero 完整 reverse；
- [ ] 第二次完整 forward/reverse；
- [ ] 每个相邻 run 快速、慢速输入；
- [ ] 同 epoch 惯性尾流；
- [ ] opposite input during preparing/animating；
- [ ] dependency late ready；
- [ ] timeout rollback；
- [ ] Method 五步原生阅读；
- [ ] Figure2 progress 正向、反向、停住、继续；
- [ ] Proof 三 panel；
- [ ] Figure3→Services reverse compositor；
- [ ] TTG→Lab reverse；
- [ ] PH→Education reverse compositor；
- [ ] Crane→Contact reverse compositor；
- [ ] direct entry：Method、Figure2、Proof、Brand、Figure3、Services、TTG、Lab、PH、
  Education、Crane、Contact；
- [ ] hash/menu/history 同一 entry pipeline；
- [ ] WebGL/video owner 数量不增长；
- [ ] stale media event 不改变新 generation。
- [ ] reduced-motion endpoint jump 仍执行 target verify/landing/stable commit。
- [ ] formal `/` 的 root scope 是 `formal`，且页面内只有一个 live authority。
- [ ] `/brand-lab` 的 root scope 是 `brand-lab`，Group 4–5 forward/reverse 使用
  同一 snapshot/projector/input contract，且页面内只有一个 live authority。
- [ ] `/?scope=brand-lab` 仍挂载 formal `PhoneStoryShell`，不能作为 QA 旁路。
- [ ] unit/integration mount harness 顺序执行 formal mount → dispose → QA mount →
  dispose → formal remount：每次最多一个 live authority、dispose 后 listener/
  sampler/RAF/lease 为零、旧 evidence no-op。这里必须断言对象/identity **不同**，
  不得追求跨互斥 route 共享同一内存实例。

**10.5 iOS Simulator Safari**

在 acceptance 文档记录设备/OS/Safari build、URL、时间和每步结果：

1. cold/warm startup；
2. 完整 forward/reverse 两轮；
3. toolbar 展开与收起；
4. orientation change 后恢复；
5. 前后台切换；
6. Pattern、Figure2、Figure3、PH、Crane 的 bottom/right edge；
7. Method/Services/Lab/Education 原生阅读；
8. direct entry 与 back/forward history；
9. media fallback 与正常 decode 两种路径；
10. `portrait-spike-motion=reduce` 使用同一 stable contract 完整 forward/reverse。
11. 分别打开 formal `/` 与 `/brand-lab`，确认 scope 正确、各自只有一个 live
    authority，QA route 无第二套 stage/edge/input 行为。

**10.6 实体 iPhone Safari release gate**

实体设备必须重复 10.5，并额外验证：

- 快速连续 swipe；
- 慢拖；
- 触摸结束后的 momentum tail；
- Safari 地址栏完全展开/收起；
- 电话前后台/锁屏恢复；
- 无假 hold、无锁死、无跳 Proof、无空白、无 compositor 双进场；
- 每个 stable scene 底边/右边无 1 px 缝；
- Contact link、focus、pointer 可用。
- `/brand-lab` Group 4–5 正逆手势与正式 `/` 同手感、同 landing、同 endpoint；
  route 重新进入后无旧 listener、旧媒体 completion 或旧 momentum 尾流复活。

没有实体 iPhone 证据时，可以标记“实现与自动门禁完成”，但不得标记 release DoD
完成。

**Commit**

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b
git add app/e2e/r5-phone-story.spec.ts \
  app/playwright.phone.config.ts \
  docs/react-refactor/reports/r5-phone-state-machine-acceptance.md \
  docs/react-refactor/reports/r5-phone-execution-layer-baseline.md
git commit -m "test(r5): gate stable phone presentation on every hold"
```

---

## 10. 每个生产 Task 的固定回归

Task 1–9 每次都执行：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r5-unit7b/app
node scripts/verify-boolean-data-contract.mjs
node scripts/verify-homepage-module-boundaries.mjs
node scripts/verify-phone-packed-alpha-masters.mjs
pnpm typecheck
pnpm build
git -C .. diff --exit-code d4d29bc -- \
  assets \
  app/scripts/homepage-media-contract.mjs \
  app/src/story/timings.ts \
  app/src/story/copy.ts
```

预期：

- verifiers exit 0；
- build exit 0；
- `dist/r5-performance-budget.json` 中 phone JS `<= 663,552`；
- frozen paths diff 为空；
- 推荐 headroom 至少恢复到 4 KiB；未达到 4 KiB 可以继续，但 acceptance 文档必须记录
  warning，且绝不提高 hard cap。

每个 Task 还必须重复 §2 donor tests。任何 donor test 失败时，先修复 regression，不能
删除断言、放宽 endpoint/coverage tolerance 或改 timing。

---

## 11. 迁移与性能规则

- 不打包两个 story state/input runtime；Task 3–7 期间尚未迁移 group 的旧
  render listener 只可短暂保留为 view adapter，不能写 snapshot/role，并必须在该
  group 提交中删除；
- 不用 feature flag 保留第二个 cursor/session/publisher；
- 新 reducer 接线的同一提交必须删除旧 publication path；
- 每个 group 接入 global role 的同一提交必须删除 group-local role/token；
- 新增 abstraction 必须以删除重复 listener/state/callback 抵消；
- 测试和 type-only 代码可先出现；被 production entry 引用的新 runtime 不得与被替代
  runtime 同时存在；
- build 超限时优先删除：
  1. duplicate local state；
  2. duplicate publisher；
  3. duplicate scroll listener；
  4. compatibility callback；
  5. obsolete CSS token；
- 禁止通过提高预算、关闭 minification、减少 donor 验证来解决体积。

---

## 12. 风险与停止条件

| 风险 | 处理 |
| --- | --- |
| React commit 晚于 DOM role | visibility-critical role 由同步 projector 写；React 只被动订阅 |
| `scrollTo()` 后浏览器未移动 | stable 前等 actual sample；一次 bounded correction；再失败 rollback |
| layout release 改变 landing | release geometry 在 measure 之前；resource release 在 stable 之后 |
| capability late ready | 只向 active session identity 发 event；无 pending intent replay |
| media event 晚到 | 校验 session/generation/leg/direction |
| surface 在 commit 时 unmount | projector 拒绝发布并 rollback |
| persistent compositor 被 cleanup | release lease 分类；Unit 5/6 donor tests 阻断 |
| CSS seam 被局部遮挡“修好” | runtime structural coverage + device visual gate；禁止补丁 pseudo-element |
| JS budget 只有 23 bytes | 每个切片同时删除旧实现；不允许先并存后清理 |
| 为了“两条 route 共用”引入全局 singleton | authority 定义为 route-local；factory side-effect free；unmount dispose；remount 新 identity |
| QA shell 再长出 lifecycle | shared factory + formal graph traversal + QA forbidden-import/state gate |
| Simulator 通过、实体 Safari 失败 | release DoD 保持未完成，记录设备证据并回到对应 owner 修复 |

出现以下情况必须停止当前 Task，不得靠放宽合同继续：

- 需要修改 frozen media/hash/timing/copy；
- 需要提高 phone JS hard cap；
- 需要恢复 component local scene/run owner；
- 需要增加第二个 input/scroll publisher；
- 无法在 target/root coverage 验证失败时安全 rollback；
- 实体 iPhone 未执行却准备宣称 release 完成。

---

## 13. Definition of Done

只有以下全部成立，才能说“完整修复为统一状态机，并达到桌面级稳定性”：

- [ ] 每个已挂载 phone route/root 恰好一个 live route-local authority；不存在跨
  route module-scope singleton；
- [ ] 正式 `/` 只有 `PhoneStoryShell` 持有 authority，root scope 为 `formal`；
- [ ] `/brand-lab` 只是 `scope:'brand-lab'` 的 QA 外壳，复用同一
  reducer/projector/runtime factory/input/run/commit 合同，无独立 lifecycle；
- [ ] route unmount 后 listener/registry/session/RAF/timeout/media lease 全部释放；
  remount 是新 authority identity，旧 route evidence 不可改变新 snapshot；
- [ ] formal `/` transitive graph 不含 `PhoneBrandLabStory`、
  `PhoneBrandLabScope` 或 `PhoneLabContactShell`；
- [ ] 只有 normalized pathname `/brand-lab` 可选择 QA composition；正式 `/` 不受
  `scope` query/hash 改写；
- [ ] 每个 authority 只有一个 `PhoneStorySnapshot` store；
- [ ] 所有状态写入只经过 `reducePhoneStorySnapshot()`；
- [ ] `PhoneStoryCursor` 只是 snapshot selector，不是第二个 store；
- [ ] 任意时刻最多一个 scroll-run 或 transaction；
- [ ] transaction 只有一个 authority/session/generation/leg/progress source；
- [ ] stable hold 发布时 session/anchor 已消失、input 已 free、actual scroll 已确认；
- [ ] scroll/layout 通过预提交确认，不伪称和 JS state 同步原子写入；
- [ ] projector 在 subscriber 之前同步提交 root/surface/theme/checkpoint；
- [ ] component 只注册 capability/surface/corridor、报告 identity evidence、被动 render；
- [ ] Front/AOD 无 durable `aodRun` 与 local visibility owner；
- [ ] Grade A 无 `runView + geometry + cursor` 三套真相；
- [ ] Group 4–5/6–7 无 local currentScene/stageScene/activeRun presentation owner；
- [ ] composite runner 不拥有第二套 phase/step；
- [ ] unclaimed input 完全原生；WebKit correction 同 epoch 最多一次；
- [ ] 没有 free-floating pending intent；
- [ ] 三种 anchor policy 正逆/direct/rollback 全部执行；
- [ ] direct entry、hash、menu、history 与正常播放共用同一 transaction；
- [ ] full/reduced motion 与 poster/media failure 共用同一 commit/rollback 合同；
- [ ] 16 个 canonical scene projection exhaustive；
- [ ] 15 个 transition leg projection exhaustive；
- [ ] 12 个正常 stable hold 使用同一个完整 E2E assertion；
- [ ] Figure3/TTG/PH/Crane direct cinematic identity/coverage 有专项合同；
- [ ] Method 文本稳定可见且原生滚动；
- [ ] Figure2 可正逆滚动、停住、继续进入 Proof；
- [ ] Pattern 无横条，所有关键 scene 底边/右边完整；
- [ ] Unit 4、5、6、7A 与 `82a4e68` donor 合同全部通过；
- [ ] Figure3→Services、PH→Education、Crane→Contact persistent compositor 未回退；
- [ ] theme-color 与 exact endpoint poster 未回退；
- [ ] media/hash/copy/timing 未改变；
- [ ] 两条 route 未通过复用内存对象伪造一致性，而是以相同输入 trace 证明 reducer、
  projector、input 与 transaction 行为等价；
- [ ] full Vitest、lint、typecheck、build、media/module/boolean gates 通过；
- [ ] phone JS 不超过 `663,552 bytes`，hard cap 未提高；
- [ ] Chrome 390×844 与 Playwright WebKit 完整正逆两轮通过；
- [ ] iOS Simulator Safari 完整证据通过；
- [ ] 实体 iPhone Safari 完整证据通过。

达到这些条件后，手机端虽然继续使用原生 document scroll，而不是桌面 Director 的内部
scrollport，但在最重要的运行时不变量上与桌面一致：单一仲裁、单一时钟、单一
presentation owner、一次 settle、首帧连续、正逆对称、失败可回滚。
