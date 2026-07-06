# R6 Goal：清理与巩固

## 目标

删除迁移期死代码和一次性脚本，把新 runtime 的开发流程固化为长期维护规则。

阶段位置见 `../ROADMAP.md` 的 R6；架构依据见 `../ARCHITECTURE.md`；旧站复用和退役边界见 `../MIGRATION.md`；总入口见 `../README.md`。

## 输入

- R5 切换后的默认新应用
- R5 回归记录
- 迁移期 diff 脚本与 harness

## 输出

- 死代码清理提交
- ESLint 规则 error 级
- harness 使用文档
- 新 scene checklist

## 执行步骤

1. 从 R5 收口提交创建 `codex/react-refactor-r6-cleanup`。
2. 删除迁移期一次性 diff 脚本。
3. 删除不可达旧 runtime 代码和预览入口。
4. 把 ESLint 契约规则提升到 error。
5. 文档化 harness 路由：scene harness、segment harness、machine harness。
6. 编写新 scene checklist：SceneModule、copy baseline、renderer 幂等、transition timeline、reducedMotion、harness、manifest 接入。
7. 跑全量测试和基础手工 smoke。

## 禁止事项

- 不删除仍被 R5 默认入口引用的 assets。
- 不删除有长期价值的 harness。
- 不把旧 runtime 以隐藏入口方式保留。

## 验收

- `pnpm -C app test` 通过。
- repo 中无默认可达旧 runtime。
- 新 scene checklist 可直接指导后续新增 scene。
- ESLint 契约规则为 error。

## 人工确认点

确认 archive 边界：哪些旧文件永久归档，哪些 assets 继续保留。

## 并行拆分

可并行：

- dead-code scan
- 文档化 harness
- ESLint 提级

删除文件前需要统一确认引用关系。
