# Tongye Guanmi

同野观幂网站当前处于 React runtime 迁移的 R4 收口状态：R4 scene / transition 已完成人工视觉验收；R5 将负责生产 StoryApp 组装、全站验收与可回滚 cutover。默认发布入口在 R5 HITL 批准前仍是旧静态站。

## 环境

- Node.js 22
- pnpm 8.15.1

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
corepack enable
corepack prepare pnpm@8.15.1 --activate
pnpm install --frozen-lockfile
```

## 当前开发命令

旧静态站基线：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm dev
```

React app / R4 harness：

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app dev --host 127.0.0.1
```

人工主 review 只使用以下无额外后缀的路由：

- `http://127.0.0.1:5173/harness/r4-g1`
- `http://127.0.0.1:5173/harness/r4-g2`
- `http://127.0.0.1:5173/harness/r4-g3`
- `http://127.0.0.1:5173/harness/r4-g4`
- `http://127.0.0.1:5173/harness/r4-g5`
- `http://127.0.0.1:5173/harness/r4-g6`
- `http://127.0.0.1:5173/harness/r4-g7`

## 验证

```bash
cd /Users/aitoshuu/Documents/GitHub/TongyeGuanmi-r4-scene-identity
pnpm -C app test
pnpm -C app typecheck
pnpm -C app lint
pnpm -C app build
```

R5 完成后，根目录命令将切换为新 app 的默认命令；切换前不要把当前根目录 `pnpm dev` 误认为 React 生产入口。

## 阶段入口

- [React refactor 文档索引](docs/react-refactor/README.md)
- [R4 收口记录](docs/react-refactor/R4-CLOSEOUT.md)
- [R5 Goal](docs/react-refactor/goals/R5-parity-cutover.md)
- [R6 Goal](docs/react-refactor/goals/R6-cleanup.md)
