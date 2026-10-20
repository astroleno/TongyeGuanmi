# 旧官网迁移至 /experience/

## 2026-10-19 线上状态与边界

- 旧官网入口：`https://tongye.me/experience/`。
- 根地址及 `/index.html` 暂时 **302** 到 `/experience/`，保留查询参数；浏览器验证旧 `/#education` 书签仍进入对应章节。新首页完成后再撤销这两条临时跳转。
- `/experience`、`/experience/index.html` 规范化到带尾斜杠入口；Brand 调试入口为 `/experience/brand-lab`，仍为 noindex。
- `/services/`、`/faq/`、备案链接、HTTPS、www 规范化、真实 404 保留。
- 原有显式预览 cookie 仍读取其原预览目录，不受根地址临时跳转影响；`/experience/` 不随预览 cookie 切换版本。
- **没有构建或上线 main 的连续滚动迭代，也没有创建新 R5 候选或新的性能资格。** 这是给当前公开 v55 增加的独立路径适配层，不是旧站性能优化或新首页交付。

## 冻结的 donor 与适配层

`current` 仍指向 `/www/wwwroot/tongye.me/releases/r5-ef69e06`。

- Source commit：`ef69e06a3c9f6e6624c7beb0acf903afae55e32e`。
- 原候选：`react-refactor-r5-parity-repair-candidate-v55`。
- 原资格清单 SHA-256：`46609b35907e855e6be6bd8763a9a9b589be1910801e5cd106e537cd3aa67c4f`。
- 原 HTML SHA-256：`fc904f6e1f7a23f1fa1238e6049f94a032f647dad00e49dd6401697d17d97fa7`。
- 原入口 `assets/index-CexTKEg.js` SHA-256：`aa327b78ccacf92838f5ad53097a37cd54bf76eca164612126c91b99fab96692`。
- CDN 仍为 `assets.tongye.me/releases/r5-ef69e06/` 与 `media.tongye.me/releases/r5-ef69e06/`，无对象覆盖、上传或删除。

独立 mount：`experience-v55-20261019-02`，目录为 `/www/wwwroot/tongye.me/mounts/experience-v55-20261019-02`。

只对冻结包做确定性的路径适配：路由分类、手机预启动/Brand 路径、CSS 预加载与 Worker 地址、恢复清单地址、HTML/图标/Web App 清单/页面元数据路径。保留原模块相对导入关系，避免加载两份 React。动画、样式与媒体源不作重构。

- 7 个 JS 路径覆盖文件、HTML、3 个 Web App 清单，共 11 个文件；未改动文件由 `/experience/assets/` 映射到固定 v55 目录，而不是未来会切换的 `current`。
- 覆盖文件采用 `no-cache`；固定 donor 的其余资源维持 immutable。原根路径资源也保持原字节，兼容已打开的旧页面。
- `/experience/mount-manifest.json` 单独记录每项 base/override 哈希，并明确声明原 R5 资格只描述 donor，不能用于证明路径适配层或 main 的发布资格。
- `/experience/r5-release-manifest.json` 保留 donor 原字节，专供旧版手机恢复控制器识别其自身版本，不跟随未来新首页的清单。

Mount 清单 SHA-256：`a8c155dc3c2e9f3cf0c8ce276d724a8f80b7757332ddab98ae6ec5d78df81ed8`。

## 已执行验证

- 路径适配单测 6/6；配置事务/拒绝覆盖/失败回退/验收记录测试 12/12。
- 7 个生成的 JS 覆盖文件语法检查通过；冻结包所有声明文件均核验字节数及哈希，CDN 文件从原发布包声明的 sibling `cdn/` 读取，不跳过缺失素材。
- 本地 HTTP 130 项通过；服务器另起仅监听 loopback 的独立 Nginx 实例，123 项真实处理器验证通过，再切换公网配置。
- 公网 HTTP **135 项通过**，其中 112 个 JS/CSS 文件逐一检查状态、MIME 与预期 SHA-256；覆盖根跳转、带参数规范化、Brand、Web App 清单、原恢复清单、服务/FAQ、404、www、HTTP→HTTPS、预览 cookie 隔离、原入口字节和 CDN 视频 CORS/206 Range。
- 公网 Chromium 桌面 1280×800：从带查询参数和 `#education` 的旧根地址进入新路径；脚本只读取 `/experience/assets/`；场景可交互，未观察到同源资源 4xx/5xx。
- 公网 Chromium 手机模拟 390×844、coarse pointer：Hero、菜单→留学→联系、刷新、后退、Brand 入口均达到 stable/readable 状态，同源资源未观察到 4xx/5xx。
- 关闭 JavaScript 后，静态正文可见，主标题及章节链接正确，加载遮罩隐藏。
- 切换后再次通过 SSH 核验原 HTML、入口 JS、资格清单及 `current`：均未变更。Nginx 配置检查通过。

浏览器截图用于入口与排版抽查，不是逐像素逐帧黄金图比较；未重跑完整性能、内存和真机发布资格，不据此改变此前 main 的未通过项或验收标准。

本机原始证据在 `/tmp/tongye-experience-20261019-J3euT4/`，包括 `public-http.json`、迁移前截图和 `public-*` 截图；公网 HTTP 报告同时持久保存到下述服务器备份目录。

## 配置、故障记录与回退

- Vhost：`/www/server/panel/vhost/nginx/html_tongye.me.conf`。
- 路由 include：`/www/server/panel/vhost/nginx/tongye-experience-routes.inc`；原 SEO include 和预览映射不修改。
- 活动配置原 SHA-256：`ea6b5819b0867ed5ad133a0eca478c8a926ae6ab1f21e5907df1b7f37bc1be65`。
- 活动配置新 SHA-256：`559c31979eea33210ae78872e1cab86d4dbcae94a9551dd9f039aac486b996e4`。路由规则本体在独立 include 内，其 SHA 由事务记录另行保存，不能只核验 vhost。
- 备份目录：`/www/wwwroot/tongye.me/route-backups/experience-v55-20261019-02/`，包含 `vhost.before.conf`、`transaction.json`、`http-smoke.json` 及回退脚本。

首次切换中，字面文件 alias 用于尾斜杠 `/experience/`，触发 Nginx index 模块拼接出 `index.htmlindex.html`，公网检查发现 500 后立即恢复原 vhost 并重新加载。失败事务 `experience-v55-20261019` 与规则副本保留在其备份目录。修复为 `root <mount>; try_files /index.html =404`，在真实隔离 Nginx 中验证不会追加文件名、不会与规范化跳转形成循环后，使用新事务 `-02` 再次切换成功。

必要时，在服务器上执行：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/experience-v55-20261019-02/apply-experience-mount.py rollback
```

回退会核验当前 vhost、mount 清单和路由 include，拒绝覆盖他人后续改动；恢复原配置后检查并重新加载 Nginx。保留适配层文件和证据，不删除旧发布、源码或 CDN 对象。

## 新首页接入时

1. 新站使用独立构建入口及自己的资源命名空间，不导入或预加载旧版运行时。
2. 保留 `/experience/` 的固定 v55 资源映射和覆盖规则；不要随新首页的 `current` 切换旧站资源。
3. 只撤销公共 `/`、`/index.html` 的临时 302，接入经批准的新首页；按当时需求确认是否继续保留历史预览 cookie 入口。
4. 重新验证新根入口没有加载旧站 JS/CSS/视频，同时复测旧体验、服务/FAQ、书签、缓存和 404。

重建适配层仅使用 `scripts/prepare-experience-mount.mjs` 的固定 v55 donor；上线前用 `scripts/probe-experience-nginx.py` 验证真实 Nginx 规则，再使用带预期 vhost 哈希的事务脚本。不得拿这套路径适配脚本绕过任何未来新版的完整发布门禁。

## 原生新版的发布边界（2026-10-20，未上线）

源码现支持 `R5_BASE_PATH=/experience/` 原生构建：路由、手机预启动、恢复清单、图标与 Web App scope 使用同一前缀；未设置时保留根路径开发构建。构建入口不引入另一套路由库或提前导入场景。Canonical 的 WebPage 标识跟随体验路径，组织、全站、服务与 FAQ 的公开身份仍留在原根地址。

发布草稿及打包清单记录 `basePath`；冻结内存资格完成前不得更换构建前缀。原 `scripts/deploy-r5-release.mjs` 只切根站点的 `current`，现会在任何 SSH／上传之前拒绝显式非根路径发布包。上面的 v55 适配脚本也不是新版发布器，不能换一个 release ID 就复用。

原生新版需要独立的 `/experience/` 发布事务：新不可变目录、活动路由 include 的比较后切换及精确回退；保留临时根跳转、预览 cookie 隔离、根服务／FAQ，以及旧体验已打开页面按旧哈希延迟加载资源的能力。不能只把 `/experience/assets/` 换成新目录后移除旧覆盖文件或旧 donor。下节已补齐实现，但实际合格候选仍须先验证真实隔离 Nginx，再做公网身份、缓存、MIME、404、书签与浏览器交互复验。

原逐帧画面、性能矩阵、冻结身份两轮内存与适用的真机检查仍是发布条件。源码提交或普通 `build` 通过不等于这些条件已经满足；当前公开站点仍为上文固定 v55。

### 原生发布事务接口（2026-10-20）

沿用已确认的独立路由设计，不更换应用架构或根站点发布器：

- `scripts/deploy-experience-release.mjs`：客户端预检、唯一远端暂存目录、真实隔离 Nginx、不可变 CDN 上传／验证、切换和公网 HTTP 检查；公网检查失败时调用同一事务的回退。`--check` 只做本地检查，不 SSH、不上传。
- `scripts/publish-experience-release.py`：服务器端 `validate / probe / apply / verify / rollback`。拒绝根路径／dirty／pending-memory／借用其他产物的证据；逐文件及完整 artifact tree、CDN 路径、两轮原内存资格再次核对。保留原 `chrome` 身份约束，不将 Ego 诊断报告改名当合格报告。
- `probe` 只运行 loopback 实例，不改活动配置；报告绑定候选清单、原 vhost、原 include 和待切换 include 的哈希。`apply` 必须提供该报告；只替换 include，`current` 和 vhost 始终不改。保存切换中状态，进程在替换前后被中断时仍可显式回退。
- 首次原生发布只接受已检查的 `experience-v55-20261019-02` 前态。备份在 `route-backups/native-<releaseId>/`；回退恢复的是这个 v55 mount，而不是迁移前根站点。已有目标目录、资源同 URL 异字节、配置并发改动或不匹配的回退前态均拒绝覆盖。
- 固定保留 donor 全部旧 JS／CSS 的精确 URL，包括 7 个改写过的 JS 覆盖文件；其余新资源落在新不可变目录。若新资源与旧 URL 冲突且字节不同，拒绝发布，不让已打开的 v55 页面加载到错误模块。

仅在应用原门禁全部通过、干净提交和 annotated candidate tag 绑定后，使用 `release:package` 生成的新路径合格包。命令参数中的两项 SHA 须在实际切换前重新读取，不能把历史值当成未来值：

```sh
node scripts/deploy-experience-release.mjs --package <qualified-package> --expected-vhost-sha <inspected-sha256> --expected-include-sha <inspected-sha256> --check
node scripts/deploy-experience-release.mjs --package <qualified-package> --expected-vhost-sha <inspected-sha256> --expected-include-sha <inspected-sha256>
```

必要时服务器端显式回退（不调用旧 mount 的根站点回退）：

```sh
sudo -n python3 /www/wwwroot/tongye.me/route-backups/native-<releaseId>/publish-experience-release.py rollback --release-id <releaseId>
```

离线事务测试与传输前拒绝测试覆盖身份、字节、原子切换、错误回退及并发保护；`scripts/test-publish-experience-nginx.py` 另用明确标记的临时合成 fixture 检查真实 Nginx 的尾斜杠、哈希、MIME、缓存、404 和旧资源处理。合成 fixture 不是应用发布候选，不能替代实际合格包的强制 probe。脚本、证据和暂存目录不会因成功或失败而删除已有发布或 CDN 对象。

## ego-lite 验收入口（2026-10-20）

用户已选择使用现有 ego-lite，不安装或恢复 Chrome／WebKit。开发复测可以直接使用 `app/scripts/verify-scroll-scrub-ego.mjs`，不需要 Playwright 或另一台浏览器进程。它与原 `verify-scroll-scrub.mjs` 共用 `scroll-performance-probe.mjs` 和原指标汇总，不维护另一套宽松采样。

先按 ego-browser 的操作边界取得本任务已批准、仍由 agent 控制的 TaskSpace ID 和已有 Page 标签，再在 `ego-browser nodejs` 中调用，例如：

```js
const { runEgoScrollVerification } = await import(
  'file:///Users/aitoshuu/Documents/GitHub/TongyeGuanmi/app/scripts/verify-scroll-scrub-ego.mjs'
);
const report = await runEgoScrollVerification({
  taskSpaceId: 12, // 历史示例，必须替换为当前批准且有效的组 ID
  pageLabel: 'p1',
  platform: 'desktop', // 另一轮使用 phone
  baseURL: 'http://127.0.0.1:4197/experience/',
  outputPath: '/tmp/tongye-scroll-ego-20261020-desktop.json'
});
if (!report.passed) process.exitCode = 1;
```

`12` 仅是历史示例，不是通用配置；本轮的组 12 和另经批准新建的组 6 均曾返回找不到组，不能直接复制该 ID 继续运行。每次须核对本任务当前已批准且有效的组。入口不自动新建／认领组、选择 profile、安装依赖或结束调用方的持续任务；用户接管或标签组失效时停止，不通过另一组绕过。报告必须使用仓库外的新绝对路径；已有报告拒绝覆盖，进度采用原子保存，避免空间不足截断上一份完整记录。

采样仍为原八段，每段预定位 20%、连续 10 秒到 80%；保留 P95 ≤20ms、姿态滞后 ≤100ms、停止收敛 ≤150ms、零次 >50ms 长任务及暂停视频、完整前台采样、区间／epoch／最终姿态检查。缺少 LongTasks 能力仍为 `null`／不可测，不能算 0 次通过。

导航显式沿用原独立 Playwright runner 的默认 30 秒，而不是 Ego 包装层的默认 15 秒；ready 仍为 30 秒、逐段准备仍为 25 秒。上述性能数值门槛不变，不能靠延长画面收敛预算消除失败。

Ego 入口额外固定桌面 1440×900／手机模拟 390×844、DPR 1 和页面级焦点模拟，逐帧记录并检查视口／DPR／焦点，避免 CLI 轮次间视口恢复或后台降频混入结果。焦点模拟属于测试调度，不是真实物理输入，不改变全局浏览器或电源设置。Runtime 事件按上下文与导航顺序分类：只有明确属于 `chrome-extension://` 且非默认世界的异常单独保留；网站默认世界、未知来源、日志错误仍失败。不会按错误文案或页面 URL 忽略异常。

报告记录产物清单哈希、实际采样函数哈希、Ego／Chromium 身份和环境；清单在段间及最终采样后再次核对。Browser.getVersion 不可用时如实记录 `null` 和原因，不伪装成另一浏览器。即使八段通过，`releaseQualified`、`memoryQualified` 仍明确为 `false`：共享 Ego 的整棵进程树包含其他标签，不能用本站 renderer RSS 替代原 1.5GB 整树门槛；Ego Chromium 也不能替代 WebKit 或真机证据。公开发布、冻结两轮内存和独立子路径发布事务的原要求不变。
