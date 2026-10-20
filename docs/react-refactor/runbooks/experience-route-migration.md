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
