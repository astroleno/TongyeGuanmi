# 阶段 2 修复计划（基于验证失败）

## 验证结果总结

### ❌ 失败的 3 个核心问题

1. **snapEntryVh 理解错误**：
   - 当前 `DEFAULT_SNAP_ENTRY_VH = 0.1` 
   - 触发公式：`forwardEntry = hostTop - viewportHeight * snapEntryVh`
   - 0.1 = 转场容器顶部到达视口顶部下方 10vh 才触发（**几乎过了整屏**）
   - 正确应该是 0.9（转场容器刚露出 10vh 就触发）

2. **home-belief 仍是 scroll-driven**：
   - 截图显示第一幕→第二幕 pattern 仍然 `snap=false`，随滚动进度走
   - 需要删除 `data-transition-drive="scroll"`，改为 snapped autoplay

3. **转场和动画混在同一个 playhead**：
   - belief-method 把"墨滴转场 + AOD 动画 + method 文案"都塞进一个 snap 周期
   - 截图显示 AOD video 已播放到 5.013s，method 文案已出现
   - 不符合定义：转场完成后，再滚动 10vh，才触发 AOD 动画

### ❌ AOD 布局问题（新发现）

截图显示 AOD 动画播放过程中，**文案和图案偏右**，不居中。
- 原因：JS 播放逻辑修改了 `--aod-transition-sun-x` 等变量
- 需要对比根目录 main 的 AOD 播放逻辑

---

## 修复优先级

### P0：修复 AOD 布局（立即）
查找 aod-homepage-adapter.js 中设置 CSS 变量的逻辑，对比根目录 main

### P1：修正 snapEntryVh（核心）
`DEFAULT_SNAP_ENTRY_VH = 0.9`（不是 0.1）

### P2：home-belief 改为 snapped autoplay
删除 `data-transition-drive="scroll"`

### P3：拆分转场和动画（架构级）
这是最大的改动，需要重新设计 belief-method 的多阶段结构：
1. 阶段 A：belief → AOD 首帧墨滴转场（snap + autoplay 2s）
2. 释放 scroll
3. 阶段 B：用户滚动 10vh，触发 AOD 动画 snap（snap + video autoplay 2-3s）
4. 动画 80% 时 method 文案淡入
5. 释放 scroll

---

## 执行顺序

1. 修复 AOD 布局（P0）
2. 修正 snapEntryVh（P1）
3. home-belief snapped（P2）
4. 验证前 3 项
5. 如果通过，再做 P3（拆分转场/动画）

P3 是架构级改动，需要修改 adapter + window-spec，暂缓到前 3 项验证通过后。

---

## 下一步

立即执行 P0：修复 AOD 布局偏移问题
