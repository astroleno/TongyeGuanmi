# 逐帧 Seek 与时间轴同帧锁定设计

**状态：** 待评审

**日期：** 2026-08-30

**范围：** 桌面端与手机版首页叙事运行时、透明视频表面和媒体资产契约

## 结论

采用“先可丢弃 Spike，再按证据决定全量迁移、受控部分迁移或停止”的路线。Spike 的正式结论只有三种：`GO_FULL`、`GO_PARTIAL`、`NO_GO`。

这里的“迁移”有一个严格边界：迁移的是媒体时钟和呈现协议，不在同一批工作里改变交互产品形态。现有桌面端和手机版的 `snap`、`stagedSnap`、`reading`、手势触发、暂停点与阅读区语义保持不变；通过迁移的方向具备逐帧寻址和双向 seek 能力，但是否进一步开放连续滚轮/手指 scrub，另立产品验收任务。

`GO_PARTIAL` 不是把失败资源勉强上线，而是把迁移资格冻结到 manifest 的明确“运行时 × 方向”集合：合格方向在声明的支持矩阵内使用严格 frame-lock；不合格方向继续使用已验证的 legacy 时钟或静态 fallback，并在证据报告中登记原因、影响范围和重试条件。Crane figure/flock 等原子组只能整组迁移或整组保留，不能拆半。

目标不是让 `video.currentTime` 看起来接近时间轴，而是让“已经提交给浏览器合成器的具体视频帧”成为媒体区间的主时钟：视频帧未确认，视觉层、墨迹、文案 cue 和状态机进度都不得越过它。

本设计中的“逐帧”是**逐帧可寻址且提交帧精确**，不是强制展示请求之间的每一个中间帧。设备来不及解码时，latest-wins 会丢弃过时目标，页面停在上一个已呈现帧，随后原子跳到最新的正确帧；它可以降采样，但不能错帧或让其他时间轴层偷跑。如果产品要求任何速度下都不跳过中间帧，那是另一种离线帧序列/WebCodecs 级需求，不属于本次 seek 迁移。

## 为什么必须先做 Spike

桌面 VP9 WebM 当前最大 GOP 约 8–13 帧，Safari HEVC alpha 契约上限为 8 帧，逐帧 seek 的资源基础相对较好；手机版使用 H.264 packed RGB+alpha 加 WebGL Canvas 合成，现有关键帧间隔从约 8 帧到 49 帧不等。浏览器能否在真机上以可接受延迟完成反向、乱序和连续 seek，不能只靠代码推演。

当前代码已经有成熟的 seek 合并、生命周期、透明视频 Canvas 和失败关闭能力，因此不需要先推翻运行时。真正未知的是：

- iPhone Safari 对现有长 GOP packed-alpha 资源的 seek-to-present 延迟；
- 暂停 seek 后 `requestVideoFrameCallback` 与 Canvas 实际绘制的可靠性；
- 双视频 Crane 在同一逻辑进度上的最慢表面延迟；
- 严格同帧提交是否会造成视觉卡顿、输入积压或超过现有内存上限；
- GOP 8 或 GOP 1 的体积、解码和 CDN 成本是否必要。

因此 Spike 只验证这些未知量。Spike 不作为生产实现的起点，生产模块不得 import Spike 目录中的代码。

## 现状基线

### 运行时

- `TimelineVideoDriver` 已有单 seek in-flight、latest-wins 合并、`requestVideoFrameCallback`、`seeked` 兼容回退和 abort/dispose。
- 当前 `TIMELINE_VIDEO_PRESENTATION_TOLERANCE_SECONDS = 0.05`。在 24/30 fps 下相当于容许约 1–1.5 帧，不能作为“同帧锁定”的验收依据。
- 桌面 `SegmentPlayer` 与各 timeline 仍以同步 `progress(value)` 提交视觉；`play()`/`reverse()` 或 staged RAF 会先推进时间，再由场景自行驱动视频。
- 手机版 runtime 以 RAF/时间先推进 `transaction.progress`，随后同步调用所有 leaf 的 `render(progress)`。
- 手机版已有 `mediaClockOwner`，但它目前只决定谁接收媒体 phase，不代表该 leaf 的已呈现帧控制全局 progress。
- `PhoneStoryShell` 的一次新手势仍是一次 segment 请求，不是连续手指位移 scrub。

### 媒体资源抽样

2026-08-30 使用本地 `ffprobe` 得到：

| 资源族 | 帧率/帧数 | 关键帧情况 | 结论 |
|---|---:|---:|---|
| 桌面 VP9 WebM | 24/30 fps，46–156 帧 | 最大约 8–13 帧间隔 | 可用现有资源进入严格 seek Spike |
| 桌面 Safari HEVC alpha | 24/30 fps | 契约上限 8 帧间隔 | 必须纳入 WebKit 验证 |
| 手机 Hero packed H.264 | 49 帧 | 只有首帧关键帧，尾段约 49 帧 | 反向随机 seek 高风险 |
| 手机 AOD packed H.264 | 78 帧 | 最大约 8 帧间隔 | 可作为较短 GOP 对照 |
| 手机 Figure2 packed H.264 | 156 帧 | 最大约 30 帧/1 秒间隔 | 长资源高风险 |
| 手机 PH packed H.264 | 46 帧 | 最大约 30 帧间隔 | 适合单表面 Spike |
| 手机 Crane figure/flock | 75/74 帧 | 最大约 30 帧间隔 | 适合双表面压力 Spike |

这些数字只用于确定实验顺序，不直接证明用户体验合格。

### 资产体积与预算基线

- AOD packed 当前为 3344×942、78 帧、最大 GOP 8、2,637,788 bytes；GOP 1 是否超过预算必须以实际候选编码为准，不能按固定倍数推断。
- Figure2 packed 当前为 1584×660、156 帧、最大 GOP 30、8,180,603 bytes，因现有体积更大且帧数更长，应与 AOD 一起作为 GOP 1 体积高风险项。
- 仓库当前没有 16 MiB 单资产硬门。现有静态门禁包含 80 MiB homepage runtime media、4 MiB Hero pre-scroll、4 MiB presentation WebP、冻结的 all-WebP 上限和 32 MiB desktop static path；`largestHomepageMediaBytes` 当前只记录、不限额。checked-in CDN policy 也只声明扩展名分流，没有 per-object 大小上限；任何托管商外部限制都必须在 Spike 中标记为已验证或未知，不能从代码缺失反推不存在。
- 本迁移不得把“16 MiB”写成既有事实，也不得为了候选资源提高现有预算。Spike 必须记录每个候选的字节数、相对增量、替换后的 aggregate 预算投影和剩余 headroom。若未来要新增单资产上限，必须作为独立预算决策写入 verifier 和测试，不能只出现在文档里。

## 设计不变量

1. **整数帧是正确性单位。** 严格路径的验收比较目标帧和实际帧索引，不能用 50ms 时间容差代替。
2. **desired 与 presented 分离。** 输入/墙钟可以不断产生 `desiredProgress`；只有呈现凭证可以更新 `presentedProgress`。
3. **媒体拥有区间时，媒体是主时钟。** 所有场景层在同一个 `presentedProgress` 上提交。
4. **一次只解码一个目标。** 每个媒体表面最多一个 in-flight seek；新请求覆盖 queued 目标，旧凭证返回 `stale`。
5. **完成由端点凭证决定。** 状态机不能因 desired 到 0/1 就完成，必须收到当前 run/sequence 的端点呈现凭证。
6. **手机版透明帧以 Canvas 绘制为准。** `video.currentTime`、`seeked` 或 `readyState` 单独都不是 packed-alpha 的可见凭证。
7. **多表面原子提交。** Crane 的 figure/flock 必须在相同 sequence 上全部给出正确帧后才提交视觉；快的一侧不能先推进页面。
8. **生命周期不回退。** activation、formal playback、soft release、terminal dispose、BFCache 和 fail-closed 语义继续有效。
9. **资源上限不增加。** 迁移不能通过长期保留更多 decoder、video 或 WebGL Canvas 来换取流畅度。
10. **原生播放不再是正式媒体时钟。** `video.play()` 只能作为用户激活后的 decoder/compositor nudge，且必须发生在既有 cover/inert candidate plane 后、正式曝光前暂停；它不能独立推进生产进度或把未确认帧暴露给用户。
11. **迁移资格按方向/原子组冻结。** `GO_PARTIAL` 时，只有 Spike 报告批准的方向可以切换；共享失败资源的所有依赖方向必须一起保留 legacy/static，Crane 双表面不得拆分资格。

## 目标时钟模型

```text
输入 / RAF / staged leg
          |
          v
  desiredProgress
          |
          v
progress -> integer frame -> media PTS
          |
          v
latest-wins seek / decode / compose
          |
          v
presented-frame receipt
          |
          v
actual frame -> presentedProgress
          |
          +----> 场景、墨迹、文案、层级统一 render
          |
          +----> runtime/machine 进度与完成判断
```

非媒体区间仍可由 runtime 墙钟驱动，但必须经过同一 receipt 接口返回 `evidence: 'runtime'`，使上层只有一条提交路径。

## 精确帧映射

新增 `app/src/media/frame-timebase.ts`，所有严格媒体显式声明：

```ts
export type VideoFrameMap = Readonly<{
  fpsNumerator: number;
  fpsDenominator: number;
  firstPtsSeconds: number;
  frameCount: number;
  startFrame: number;
  endFrame: number;
}>;

export function frameIndexForProgress(
  map: VideoFrameMap,
  progress: number
): number;

export function mediaTimeForFrame(
  map: VideoFrameMap,
  frameIndex: number
): number;

export function frameIndexForMediaTime(
  map: VideoFrameMap,
  mediaTimeSeconds: number
): number;

export function progressForFrameIndex(
  map: VideoFrameMap,
  frameIndex: number
): number;
```

规则如下：

- `progress` 先 clamp 到 `[0, 1]`，再映射到 `[startFrame, endFrame]` 并按最近帧取整；
- media time 使用有理帧率计算：`firstPts + frameIndex * fpsDenominator / fpsNumerator`；
- 从 `metadata.mediaTime` 或 Canvas media time 反算帧索引时使用同一量化函数；
- 端点直接映射到声明的整数帧，禁止使用 `duration - epsilon` 猜测；
- build/verify 脚本用 `ffprobe` 校验 frame map 与冻结资源一致。

生产映射集中在 `app/src/media/video-frame-maps.ts`，按语义媒体 key 导出；WebM、HEVC alpha 和 packed H.264 三种容器若表达同一动画，必须通过深度校验证明它们共享同一帧数、帧率和 PTS 映射。场景不得自行复制 fps/duration 常量。

## 已呈现帧协议

新增 `app/src/media/presented-frame-clock.ts`：

```ts
export type PresentedFrameEvidence =
  | 'video-frame-callback'
  | 'packed-canvas-draw'
  | 'scene-canvas-draw'
  | 'runtime';

export type PresentedFrameRequest = Readonly<{
  runId: string;
  direction: 1 | -1;
  sequence: number;
  desiredProgress: number;
  frameMap: VideoFrameMap;
  signal?: AbortSignal;
}>;

export type PresentedFrameReceipt = Readonly<{
  status: 'presented' | 'stale';
  runId: string;
  sequence: number;
  desiredFrameIndex: number;
  presentedFrameIndex: number;
  mediaTimeSeconds: number;
  presentedProgress: number;
  evidence: PresentedFrameEvidence;
}>;

export type PresentedFrameClock = Readonly<{
  request(request: PresentedFrameRequest): Promise<PresentedFrameReceipt>;
  snapshot(): PresentedFrameClockSnapshot;
  dispose(): void;
}>;
```

实现复用并收紧 `TimelineVideoDriver`，不能另写一套并发 seek 队列。Driver 的 ready result 扩展为实际 `mediaTimeSeconds`、`presentedFrameIndex` 和 evidence；严格模式禁用通用 `seeked` 50ms 回退。桌面/原生 alpha 的正式凭证来自 `requestVideoFrameCallback` 的 `metadata.mediaTime`。

手机版扩展 `PhonePackedAlphaSurfaceFrame`，让 `onFrame` 携带实际 `mediaTimeSeconds` 和量化后的 `frameIndex`。只有对应 generation 的 WebGL draw 成功、目标帧相等、sequence 仍为最新时，才返回 `packed-canvas-draw` 凭证。

这里的“呈现”是浏览器 API 能提供的最强应用层保证：帧已交给视频/Canvas 合成路径；它不是对屏幕扫描线或显示器光子的硬实时测量。

## 上层进度提交协议

### 桌面端

扩展 `SegmentTimelineHandle`：

```ts
export type SegmentProgressRequest = Readonly<{
  runId: SegmentRunId;
  direction: Direction;
  sequence: number;
  desiredProgress: number;
  signal: AbortSignal;
}>;

export type SegmentProgressReceipt = Readonly<{
  status: 'presented' | 'stale';
  runId: SegmentRunId;
  sequence: number;
  desiredProgress: number;
  presentedProgress: number;
  evidence: PresentedFrameEvidence;
}>;

export type SegmentTimelineHandle = {
  // 现有 legacy 方法保留到切换完成。
  presentProgress?(request: SegmentProgressRequest): Promise<SegmentProgressReceipt>;
  progress(value: number): void; // 对 frame-lock timeline 只提交视觉，不再发起 seek。
  // ...
};
```

`MediaPlaybackDirectionContract.mode` 增加 `'frame-lock'`。当本方向的 required media contract 是 `frame-lock` 时：

- `SegmentPlayer` 统一产生 desired progress；
- 调用 `timeline.presentProgress(request)`；
- 仅接受当前 run + 最新 sequence 的 `presented` receipt；
- 用 receipt 的 `presentedProgress` 调用 `timeline.progress()`；
- 更新 `run.progress`、copy cue、暂停点和完成状态；
- legacy `timeline.play()`/`reverse()` 不再作为该 segment 的时钟。

`snap`、`scrub` 和 `stagedSnap` 都走同一个提交器。没有媒体拥有权的局部区间由 timeline 立即返回 `evidence: 'runtime'`。因此 PH 的媒体腿会等待视频帧，后续 dissolve 腿仍按现有时长运行。

### 手机版

扩展 `PhoneLeafCommandHandle`：

```ts
export type PhoneMediaFrameRequest = Readonly<{
  frameToken: PhoneFrameToken;
  transactionId: string;
  direction: 1 | -1;
  sequence: number;
  desiredProgress: number;
  signal: AbortSignal;
}>;

export type PhoneMediaFrameReceipt = Readonly<{
  status: 'presented' | 'stale';
  frameToken: PhoneFrameToken;
  sequence: number;
  desiredProgress: number;
  presentedProgress: number;
  evidence: PresentedFrameEvidence;
}>;

export type PhoneLeafCommandHandle = Readonly<{
  presentFrame?(request: PhoneMediaFrameRequest): Promise<PhoneMediaFrameReceipt>;
  render(progress: number): Readonly<{ ownership: PhoneInkOwnership }> | void;
  // ...
}>;
```

手机版 runtime 仍按原 choreography 的 `mediaClockOwner` 找到唯一 owner，但改为：先向 owner 请求帧，再把 receipt 的 `presentedProgress` 同步广播给 source、target、ink 与 plane，最后才发送 `transition-progressed`。generation、frameToken、transactionId 或 sequence 不匹配的 receipt 一律丢弃。

`PhoneSegmentChoreography` 增加显式 `mediaClockMode: 'none' | 'legacy' | 'frame-lock'`，迁移期按 segment 切换；`mediaClockOwner !== 'none'` 且 mode 为 `frame-lock` 时才允许 owner 驱动严格 receipt。`GO_FULL` 的最终契约禁止仍有 owner 的 frame 留在 `legacy`；`GO_PARTIAL` 只允许 Spike 例外清单中的精确方向继续为 `legacy`，其余方向不得漏迁或静默回退。

### Crane 双表面

新增 `PresentedFrameBarrier`：

- 同一 request sequence 同时请求 figure 和 flock；
- 两个资源各自使用自己的 frame map；
- 两边都返回目标整数帧才提交；
- 任一返回 stale，整个 barrier 返回 stale；
- 任一 fail/timeout，沿现有 fail-closed 路径降级，不让单面继续播放；
- 不分配第三个 video/canvas，不保留下一段 decoder。

## Spike 设计

### 选择 PH 作为主 Spike

PH 同时覆盖：

- 桌面正向 `native-preferred` 与反向 timeline 的现状差异；
- 手机版正向 `video.play()` 与反向 seek 的现状差异；
- packed-alpha WebGL 可见帧凭证；
- PH → Education staged handoff 和媒体腿/非媒体腿切换；
- 46 帧短资源，便于真机逐帧人工核验。

### 加入 Crane 压力门

仅 PH 不能证明双解码器原子对齐，因此 Spike 的退出门必须再跑 Crane figure/flock：随机正反向帧序列、长 GOP、双 Canvas barrier、失败关闭和资源释放。

### 加入全量媒体表面扫描

PH 和 Crane 负责验证真实运行时集成，但它们不能代表 Hero 的 49 帧 GOP、Figure2 的 156 帧长资源以及 Figure3/TTG 的 HEVC/WebM 路径。决策前必须用同一个严格 probe 扫描 `homepage-media-contract.mjs` 中全部 cinematic WebM、HEVC alpha 和 packed H.264 资源。每个资源都执行正向、反向、端点、固定随机序列和 latest-wins 压力；任一资源失败都不能判 `GO_FULL`，只有在失败可按方向/原子组完全隔离、产品接受保留 legacy/static 且其余资格组仍通过全部硬门时，才可判 `GO_PARTIAL`。

### Spike 载体

- 新增 DEV-only route `/harness/frame-lock-spike`，由 `HarnessRouter` 控制；release build 默认不可达。
- harness 可选择 desktop PH、phone PH、phone Crane，也可按冻结 asset key 运行单媒体表面扫描，并显示 desired/presented frame、lag、evidence、seek latency 和 stale 数量。
- 自动序列至少包括：顺序前进、顺序后退、0↔末帧跳转、固定随机种子乱序、每 16ms 覆盖目标的 latest-wins 压力。
- Spike 实现只允许 import 生产媒体 primitive；生产模块不得 import harness。
- Spike 结束后保留报告和通用测试，删除实验 route 与专用 UI。

## iOS / Safari 支持矩阵

严格 video receipt 依赖 `requestVideoFrameCallback` 的 `metadata.mediaTime`；缺少该 API 时，现有 `MEDIA_FRAME_CALLBACK_UNAVAILABLE` 分支会失败关闭。packed-alpha 还必须等待目标 generation 的 Canvas draw；当前 compositor 的 `requestAnimationFrame` 回退只能维持宽松渲染，不能自动升级为严格同帧凭证。

Spike 报告必须给出以下支持结论，不能只记录一台真机版本：

- `declaredProductMinimumIOS`：仓库或产品明确声明的最低版本；当前若无声明必须写 `UNDECLARED`，等待决策，不能用测试设备替代产品要求；
- `minimumSupportedIOSForFrameLock`：实际通过完整严格序列的最低已认证 iOS/Safari 版本；
- 测试过的真实设备型号、iOS/Safari 版本、RVFC 是否存在以及所有硬门结果；
- 最低候选版本与当前版本的真机行；若无法获得足够版本覆盖，只能声明“已认证版本集合”，不能推断一个更低的最低版本；
- 低于最低认证版本或 RVFC 缺失时的产品策略：不支持严格动画或静态 fallback。若产品要求继续提供 legacy 动画，则对应“运行时 × 方向”必须整体进入 `GO_PARTIAL` 例外清单，不能让一个已迁移方向按 OS 永久携带两套正式时钟；
- 不按 user-agent 猜测能力。API 存在只表示可以进入 Spike，不等于性能或准确性已达标。

若产品要求覆盖的最低 iOS 低于技术认证下限，而又不接受静态/不支持策略，则不得把对应手机版方向列为 frame-lock；只有将这些手机版方向整体隔离为 `GO_PARTIAL` 例外后才可继续其他范围。不得用 UA 分支让同一已迁移方向长期维持 frame-lock/legacy 双时钟。

## Go / Partial / No-Go 门槛

所有硬门必须同时通过：

| 指标 | 门槛 |
|---|---:|
| 当前 receipt 错帧数 | 0 |
| 端点错帧数 | 0 |
| stale receipt 被提交数 | 0 |
| 正向/反向已提交帧单调性错误 | 0 |
| seek-to-present P95 | ≤ 100 ms |
| seek-to-present P99 | ≤ 180 ms |
| 连续 UI 长帧 | 不允许连续 2 帧 > 50 ms |
| Canvas 白底/alpha matte 失败 | 0 |
| PH staged pause/copy cue 错位 | 0 帧 |
| Crane figure/flock 提交差 | 0 逻辑帧 |
| decoder/Canvas 峰值 | 不高于现有预算 |
| 候选替换后的媒体体积 | 通过全部现有 aggregate 预算，不提高预算 |

所有被选为 `frame-lock` 的方向/原子组都必须通过上述全部硬门。测试矩阵至少包括桌面 Chromium、桌面 WebKit、Playwright phone Chromium、Playwright phone WebKit，以及 iOS 支持矩阵中声明的真实 iPhone Safari 行。Playwright WebKit 不能替代真机退出门。

| 决策 | 条件 | 后续 |
|---|---|---|
| `GO_FULL` | 所有 cinematic 方向/原子组在支持矩阵与预算内通过 | 执行全量迁移，最终删除 legacy 正式时钟 |
| `GO_PARTIAL` | 共享严格时钟成立；合格方向全部通过；失败方向可完整隔离且产品明确接受例外 | 只迁移批准集合，冻结 legacy/static 例外清单与复验条件 |
| `NO_GO` | 严格凭证/共享时钟普遍不成立、没有可安全隔离的合格集合、预算无法通过，或最低 iOS 策略不被接受 | 停止生产迁移，保留现有时钟 |

若任一现有资源未通过，按下列顺序重新编码该格式的候选资源并重复同一测试：

1. 保持现有编码参数，仅将最大 GOP 调到 8；
2. 若仍失败，再生成 GOP 1 候选；
3. 选择满足全部门槛的最小体积方案；
4. 只重编码失败的资源，不默认全量 GOP 1；
5. 更新冻结 SHA-256、frame map、构建脚本、库存和 CDN 发布清单。

候选编码必须能从仓库中受冻结契约保护的 canonical master 可重复生成。若失败资源没有合格 master，不能用再次压缩的临时文件直接替换生产资源；该资源及其全部依赖方向不得进入 frame-lock 资格集合，直到补齐源资产与质量门。

重编码候选还必须通过现有视觉/alpha 质量门。缺少专用重建脚本的 Hero packed 资源，以当前冻结文件相对 canonical WebM 的 color/alpha SSIM 为基线，候选两个通道均不得低于该基线 0.001 以上。

若某资源 GOP 1 仍无法满足真机或预算门槛，该资源及其依赖方向必须保留 legacy/static。只有获得明确的 `GO_PARTIAL` 批准才可继续迁移其他隔离方向；否则判 `NO_GO`。任何情况下都不得降低正确性标准掩盖失败。

## 迁移顺序

1. 若 Spike 只有候选 GOP 通过，先提升对应的最小合格编码；通过的现有资源不动；
2. 通用 frame timebase、严格凭证和 barrier；
3. 桌面 SegmentPlayer 提交协议；
4. 桌面 PH vertical slice（含 staged handoff）；
5. 桌面单表面：Hero/AOD/Figure2，再迁移 Figure3/TTG；
6. 桌面双表面：Crane；
7. **Phase C 出口评审：** 运行完整生产矩阵、预算与桌面验收，批准后才能改手机版 runtime；
8. 手机版 runtime owner 协议；
9. 手机版 PH vertical slice；
10. 手机版单表面：Hero/AOD/Figure2，再迁移 Figure3/TTG；
11. 手机版双表面：Crane，然后按 `GO_FULL` 或 `GO_PARTIAL` 完成批准范围内的 manifest 切换。

每一波都必须在 manifest 中逐方向从 legacy `play`/`timeline` 切到 `frame-lock`，且只能修改 Spike 资格清单批准的方向。迁移期保留一个 kill switch：它仍走 `presentProgress()`，但发起 tolerant timeline seek 后立即提交 requested progress，不重新启用 native `play()` 时钟。批准范围完成并通过全矩阵后删除该 helper 与迁移专用 legacy evidence；`GO_PARTIAL` 仍可保留例外方向原有的正式 legacy 实现，但不得让已迁移方向长期保留两套时钟。

## 失败、降级与恢复

- request 超时、媒体错误、WebGL context lost、Canvas draw false、错帧 receipt 都视为媒体准备失败；
- 复用现有 static fallback / recovery / terminal scene，不提交未经证明的近似帧；
- abort、seek、supersede、dispose 会递增 generation 并使所有未完成 receipt stale；
- BFCache pagehide/pageshow 后必须重新绑定 generation，旧 callback 不得恢复提交；
- reduced motion 仍要准备并确认目标端点；若该设备/资源不能证明端点，走静态 fallback；
- 批准范围切换前的 rollback 通过对应 manifest direction/开发期 kill switch 恢复 legacy；已完成方向删除迁移 helper 后，通过 reviewed code revert 回到最后通过版本。`GO_PARTIAL` 例外方向继续走其冻结的 legacy/static 契约，均不回滚生命周期和资源完整性修复。

## 诊断与可观测性

开发/测试环境在媒体表面写入：

- `data-frame-clock-desired-frame`
- `data-frame-clock-presented-frame`
- `data-frame-clock-lag-frames`
- `data-frame-clock-sequence`
- `data-frame-clock-evidence`
- `data-frame-clock-seek-ms`
- `data-frame-clock-stale-count`

这些字段只反映当前 generation。dispose/retire 必须清除，避免 E2E 误读已退休表面。

## 明确不做

- 本迁移不把手机版手势改成连续拖拽 scrub；
- 不改现有段落顺序、视觉设计、copy cue 阈值、staged pause 或阅读区行为；
- 不新增常驻 worker、WebCodecs 解码栈或第三方播放器；
- 不用抽帧图片序列替代视频，除非未来另开资产架构评审；
- 不用 50ms 容差、`seeked`、`currentTime` 或“肉眼差不多”作为同帧证明；
- 不为通过性能门槛增加常驻 decoder/Canvas 数量。

## 完成定义

只有满足以下条件，才称为“时间轴可以对齐”：

- 目标进度映射到唯一整数帧；
- 当前 generation 的可见呈现路径返回相同整数帧；
- 所有视觉通道只使用由该凭证反算的 `presentedProgress`；
- 正反向、乱序、端点、暂停恢复和双表面均通过自动测试与真机矩阵；
- `GO_FULL` 时，production manifest 不再让 cinematic media 用 `play`/legacy `timeline` 独立推进正式时间；`GO_PARTIAL` 时，只有冻结例外清单中的方向可以继续使用 legacy/static，且不能把它们宣传为已同帧锁定；
- Spike harness 与迁移 kill switch 已删除，回退仍通过既有静态 fallback/recovery 契约完成。
