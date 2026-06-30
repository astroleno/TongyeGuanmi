# 同野观幂首页转场时序架构校正版诊断

**日期**: 2026-06-24
**状态**: 校正版诊断，只分析根因，不修改运行代码。
**依据范围**: `index.html`、`js/ui/reveal.js`、`js/transitions/homepage-transition-runtime.js`、`js/transitions/homepage/*adapter.js`、`js/transitions/pattern-bloom-adapter.js`、Shopify Winter 2026 本地抓包产物。

## 核心结论

这些问题成立的核心不是“某一个 adapter 写错”，也不只是“scroll progress 和 playback progress 两套速度不同”。更准确的根因是：

```txt
首页缺少一个单一的 scene ownership contract。

同一帧里，runtime、adapter、handoff receiver、global reveal、CSS gate
都可能在决定同一段画面是否可见、属于谁、何时提交。
```

所以用户看到的黑屏、空白、文字被吃掉、旧幕残留、contact 闪两次，本质上都是“视觉所有权”和“内容呈现提交点”分裂。

## 哪些说法成立

成立：

- `reveal.js` 会先把全部 `.reveal` 隐藏，再用 ScrollTrigger 播放入场。
- homepage runtime 会 snap、锁滚动、播放固定时长 playhead、释放 target gate、处理 after-playback 和 post-scroll handoff。
- `handoff-receiver.js` 会把真实 DOM 从目标 section 搬进 transition 容器，再搬回去。
- `section-presentation-controller.js` 会先 `markPresented()`，随后可能 `suppressEntryOnce()`。
- `pattern-bloom-adapter.js` 有自己的 pin、overlay、belief copy opacity、top scene opacity 逻辑。
- Shopify 抓包里能看到中心化 section/background 状态，例如 `activeSection`、`sectionMap`、`transitionProgress`、next-section 渲染、crossfade shader。这个方向值得学。

## 哪些说法需要校正

需要校正：

- Shopify 不能简单写成“核心就是 Rive State Machine”或“核心就是 Theatre.js”。抓包里有 Rive 资源和 `*.theatre-project-state*.js` 资源引用，但也有 React Three Fiber/WebGL background、crossfade shader、section sync store；部分 Theatre project-state 资源在本地 crawl 里还是 404。安全结论是“中心化 section state 驱动多渲染层”，不是“必须迁移到 Rive 或 Theatre”。
- 不能把所有问题都归结为 scroll-driven vs playback-driven。playback 本身不是罪魁，问题是 playback、copy reveal、DOM receiver、CSS gate、section commit 没有一个共同 owner。
- `home-belief` 是 `data-transition-drive="scroll"`，不应说它的 handoff 由 snap playback 驱动。它的问题主要在 pattern-bloom 局部阈值、body cover、belief pin/copy CSS 变量与真实 section/reveal 的权属分裂。
- 图三的 perlin/no-stretch 和文字居中，首先是 scene variant、asset fit、copy layout contract 漂移，不应归因到 AOD 的 receiver。
- AOD 的 `fadeOutStart: 0.82` 是 fade-out 开始，不代表墨滴在 0.82 已结束。AOD 空白更可能来自 receiver restore、after-playback 立即滚动、target gate、reveal suppress 的顺序竞争。
- Figure2 的 `0.72` 是阶段分界，不是“intro 瞬间从 1 跳到 0”。真正危险的是 stage 完成、post-scroll handoff、brand receiver、brand `.reveal` 之间没有共同提交点。
- `DIRECT_HASH_ALIGNMENT_DELAYS` 主要服务直接 hash 进入页面的恢复路径。普通 crane 动画后的 contact 闪现，更直接的原因是 receiver 中先展示 contact，再 restore 到原生 contact，然后 runtime 滚过去。

## 当前系统的五个控制者

| 控制者 | 控制内容 | 风险 |
| --- | --- | --- |
| `homepage-transition-runtime.js` | snap playhead、scroll lock、target gate、after-playback/post-scroll commit | 认为 transition 完成时，目标文案可能还没归位或仍被 gate |
| `pattern-bloom-adapter.js` | `overlayActive`、`secondRevealProgress`、`beliefPinned`、copy opacity | 第二幕上/下和真实 `#belief` section 不是同一套提交状态 |
| `handoff-receiver.js` | target DOM adopt/restore | 同一份真实 DOM 短时间内属于 transition layer，又属于 native section |
| `section-presentation-controller.js` | presented/active/suppress once | 刚标记 presented 又 suppress，容易和 `.reveal` 互相覆盖 |
| `reveal.js` + CSS gates | `.reveal` 初始隐藏、ScrollTrigger 入场、target hidden gate | transition 认为完成，但 CSS/ScrollTrigger 仍可让文字不可见 |

## 8 个问题的校正版归因

| 问题 | 校正版根因 |
| --- | --- |
| 图一：home → belief 后黑一下 | pattern-bloom 的 previous scene、belief scene、belief copy、body cover、真实 `#belief` section 没有同一个 commit 点。 |
| 图二：莲花未完全收束就进第二幕下 | `secondRevealProgress`、lotus exit、belief pin/copy progress 是 adapter 局部阈值，文案完成边界不是 scene commit 边界。 |
| 图三：第二幕下不是指定 perlin/no-stretch，文字不居中 | scene variant、asset fit、copy layout 没有被 manifest 锁定。这个是视觉契约漂移，不是单纯时序 bug。 |
| 图四：第二幕下转 AOD 后仍看到旧幕 | AOD visual、旧 belief section、method target gate、receiver restore 互相独立，target presentation 没有在 AOD 完成时原子提交。 |
| 图五：AOD 后空白 | after-playback immediate scroll、method receiver restore、`completeHandoff()`、`.reveal` suppress/gate 的顺序竞争。 |
| 图六：figure2 后空白 | figure2 staged playback、post-scroll handoff、brand receiver、brand reveal 没有共同 target commit。 |
| 图七：figure3 后文字不见 | figure3 是纯视觉桥，`#services` 没有 handoff/scene owner，services copy 仍交给全局 `.reveal`。 |
| 图八：crane 后 contact 闪两次 | contact 先在 receiver 中作为 transition preview 出现，再 restore，随后 native contact 被滚动/呈现。 |

## Shopify 对我们的真正启示

可确认的原则：

- 有中心化 section state。
- 渲染层读取同一个 section/transition state。
- 背景层用 current scene + next scene + `transitionProgress` 做 crossfade。
- scene identity 是稳定的，不靠每个 adapter 自己猜下一幕。

不应直接照搬的部分：

- 不应把 Rive 当成必要方案。
- 不应把 Theatre.js 当成必要方案。它更像复杂 3D/关键帧资产的 authoring/编排工具，不是解决 DOM ownership 的核心。
- 不应在这轮重构里强制把所有转场改成纯 scroll-driven。
- 不应把 Canvas/WebGL 化作为修 bug 的前置条件。

## 建议实施方向

短期根治路径：

1. 建立 `homepage scene timeline manifest`，每条边界声明 `from`、`to`、`progressPolicy`、`visualOwner`、`copyOwner`、`commitAt`。
2. runtime 成为唯一 target presentation owner。adapter 只汇报 progress 和渲染视觉，不再决定 target copy 是否已经呈现。
3. 禁止 handoff receiver 移动真实目标 DOM。可以保留视觉桥，但目标文案始终留在 native section。
4. `.reveal` 跳过 timeline-owned sections。普通滚动内容继续用 ScrollTrigger。
5. pattern-bloom 的第二幕 variant、perlin/no-stretch、copy layout 写进 manifest 或 adapter config，不能散落在 CSS/常量里。
6. Figure3 增加真实 target commit，让 `#services` 不再只靠 `.reveal`。

中长期方向：

- 如果之后要做更复杂的叙事型滚动，可以再考虑固定 Canvas/WebGL 主舞台、Rive、Theatre.js 或状态机 blend。
- 这不是当前修复的前置条件。当前最先要修的是所有权，不是换引擎。

## 最终判断

“多套时序抢画面”这个判断成立。
“必须全部改成 scroll-driven / Shopify 是 Rive State Machine / 所有问题都来自 scroll-vs-playback”这些说法不够准确。

实施计划应围绕一个目标展开：

```txt
每一帧只有一个 scene state；
每一段 copy 只有一个 owner；
每一次 transition completion 和 target presentation 是同一个事务。
```
