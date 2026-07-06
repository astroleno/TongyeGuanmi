# R5 Goal：平价验收与切换

## 目标

完成新 React app 与旧站的平价验收，切换默认入口。

阶段位置见 `../ROADMAP.md` 的 R5；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- R4 完整 app
- `main` 旧站 baseline
- R-1 SEO 决策
- 全量 harness

## 输出

- 全站回归矩阵
- 性能预算记录
- SEO / 无 JS 验收记录
- cutover / rollback runbook
- 部署切换提交
- README / ADR 更新

## 执行步骤

1. 从 R4 收口提交创建 `codex/react-refactor-r5-parity-cutover`。
2. 跑全站正向全程。
3. 跑关键反向：`hero → pattern → star-map`、`star-map → aod-animation → method-top`、figure2 复杂段。
4. 验证全部 hash 直达。
5. 验证 reduced-motion。
6. 验证桌面、移动、触控板、触屏。
7. 验证慢网和媒体 recovery。
8. 验证阅读区内部滚动到边缘后的蓄力交接。
9. 采样 LCP、播放期帧率、三层驻留内存/GPU。
10. 验证构建产物正文可提取，符合 R-1 SEO 方案。
11. 编写 cutover / rollback runbook：切换步骤、旧构建产物恢复方式、archive/assets 边界、失败回滚触发条件。
12. 切默认入口到 `app/` 构建产物。
13. 归档旧 runtime 入口，更新 README 与 ADR。

## 禁止事项

- 不在 R5 大幅改视觉。
- 不保留可达的 legacy runtime fallback。
- 不把 SEO 正文可见性推迟到上线后。

## 验收

- 新应用为默认入口。
- 全站回归矩阵通过。
- cutover / rollback runbook 可执行。
- 性能不劣于旧站可接受范围。
- 构建产物可提取核心正文。
- README 与 ADR 反映新默认路径。

## 人工确认点

上线前确认视觉平价、移动端可用性、SEO 方案。

## 并行拆分

可并行：

- 性能采样
- SEO 验收
- 回归矩阵
- 文档更新

切入口必须最后串行执行。
