# Tongye 生产发布架构：阿里云网站 + 腾讯 COS/CDN

**日期：** 2026-07-16  
**状态：** 已实施并发布；HTTPS 生产链路已通过，待完成阿里云 `tongye.me` 接入备案以解除公网 80 端口拦截  
**适用范围：** `tongye.me` / `www.tongye.me` 的 R5 静态站发布。`aitoshuu.me`、`aitoshuu.art` 的既有站点不在本发布流程内。

> **纠正后的生产边界：** 网站和 `dist` 的唯一 Web 承载端是 **阿里云服务器**。腾讯云只承载 COS 对象存储与两个 CDN 域名：`assets.tongye.me`、`media.tongye.me`。腾讯云服务器不承载 Tongye 公司网站，也不接收 `tongye.me` / `www.tongye.me` 的站点流量。

本文件取代任何“Tongye 主站部署到腾讯云服务器”或“把完整 `dist` 直接复制到 CDN 即完成分流”的表述。

## 0. 生产实施结果

- 当前生产 release：`r5-7900333`。
- 源码 commit：`7900333af2358b4938e335fbb125c59992f45870`。
- 候选标签：`react-refactor-r5-parity-repair-candidate-v13`。
- 阿里云当前软链接：`/www/wwwroot/tongye.me/current -> /www/wwwroot/tongye.me/releases/r5-7900333`。
- 腾讯 COS/CDN：40 个版本化对象，共 `44,619,863` bytes；图片、字体走 `assets.tongye.me`，WebM 走 `media.tongye.me`。
- R5 两轮正式内存资格均通过；发布清单状态为 `qualified`。
- CDN 的 HTTPS、MIME、不可变缓存、CORS 和 WebM Range `206` 均已逐对象校验。
- Hero → Pattern → Star Map 已在生产域名用真实浏览器验证，控制台 0 error / 0 warning。
- `aitoshuu.me` 与 `www.aitoshuu.me` 保持独立站点，发布后均返回 200。

## 1. 目标拓扑

```text
浏览器 ── tongye.me / www.tongye.me ──→ 阿里云 Nginx
                                             │
                                             └── /www/wwwroot/tongye.me/releases/<release-id>/
                                                   current -> 当前已验证 release

浏览器 ── assets.tongye.me ────────────→ 腾讯 CDN ─→ 腾讯 COS（images / fonts / posters）

浏览器 ── media.tongye.me ─────────────→ 腾讯 CDN ─→ 腾讯 COS（WebM / 后续视频回退文件）
```

- `tongye.me` 与 `www.tongye.me`：阿里云网站证书、阿里云 Nginx、阿里云静态 release 目录。
- `assets.tongye.me`：腾讯 CDN + COS，只提供版本化图片、字体和 poster。
- `media.tongye.me`：腾讯 CDN + COS，只提供版本化视频；必须支持 `Range`。
- CDN 证书与网站证书独立。CDN 更新不会更新阿里云网站证书，反之亦然。
- `assets` / `media` 的 CNAME、CDN 回源、缓存和 HTTPS 已是独立基础设施；发布脚本只上传版本化对象，不能修改 DNS 或把 CDN 根目录改为公开目录。

## 2. 发布产物如何分流

R5 的生产 Vite 构建已实现显式 CDN URL 映射和发布清单。构建期把二进制运行资源分流到版本化 CDN URL；HTML、JS、CSS 仍留在阿里云站点 release。发布流程不采用构建后的字符串替换。

| 目标 | 上传内容 | 不上传内容 | 缓存策略 |
|---|---|---|---|
| 阿里云站点 release | `index.html`、JS chunks、CSS chunks、站点 favicon、运行期 JSON（发布清单/健康检查需要的最小文件） | CDN 图片/字体/视频的源文件、源码、测试、文档、`node_modules`、`archive/` | HTML `no-cache`/短缓存；带内容 hash 的 JS/CSS 可长期缓存 |
| `assets.tongye.me` → COS | `.webp`、`.avif`、`.png`、`.jpg`/`.jpeg`、`.svg`、`.ttf`/`.woff2`、Hero poster 及其他运行期图片 | 原始生成素材、被淘汰的变体、调试图、源 PSD/视频、source map | `public, max-age=31536000, immutable` |
| `media.tongye.me` → COS | `.webm`；未来明确使用时的 `.mp4`/字幕等视频配套文件 | 未被发布清单引用的试验视频、reverse 旧文件、原始母版 | `public, max-age=31536000, immutable`，保留 byte-range |

首发推荐把 HTML、JS、CSS 留在阿里云站点，不把主应用入口也放入 CDN。这样发布/回滚只需切换阿里云的 `current` 软链接；媒体和视觉资源则用不可变版本路径走 CDN。

## 3. 版本化 URL 与构建契约

每个发布先生成不可变 `release-id`，当前约定使用已验证 Git commit 的短 SHA，例如：

```text
r5-7900333
```

CDN 对象必须使用版本前缀，不能覆盖稳定同名文件：

```text
assets.tongye.me/releases/<release-id>/assets/...
media.tongye.me/releases/<release-id>/assets/...
```

应用构建时必须将每个逻辑资产键映射到上述完整 HTTPS URL。例如：

```text
hero-back        -> https://assets.tongye.me/releases/<release-id>/assets/hero-back-<hash>.webp
qiji-title       -> https://assets.tongye.me/releases/<release-id>/assets/qiji-title-<hash>.ttf
figure2-motion   -> https://media.tongye.me/releases/<release-id>/assets/figure2-pair-motion-<hash>.webm
```

已实现契约：

1. 受版本控制的资产策略与构建期生成器负责生产 CDN URL；开发环境仍可使用本地资源。
2. `cdn-publish-manifest.json` 逐项记录对象 URL、通道、SHA-256、字节数、MIME 和缓存策略。
3. 生产资产 URL 在构建阶段生成；禁止发布后字符串替换 JS/CSS。
4. 站点 bundle 不保留由 CDN 管理的图片、字体或视频副本。

## 4. 自动化发布脚本设计

发布必须使用脚本，不使用宝塔文件管理器或 COS 控制台逐个手传。当前命令为：

```text
pnpm run deploy:prepare
pnpm run deploy:evidence
pnpm run deploy:finalize
pnpm run deploy:package
pnpm run deploy:cdn:verify
node scripts/deploy-r5-release.mjs --package .release/<release-id>
```

脚本执行顺序：

1. 读取 R5 发布清单。只有 `qualification.status = qualified` 时允许继续；`pending-memory`、缺失身份或未通过媒体验证时必须失败退出。
2. 生成 release-id 和 CDN 发布清单，并执行 `deploy:cdn:check --dry-run`。此步骤不上传、不改服务器。
3. 用受限腾讯 CAM 凭据把图片/字体上传到 assets COS 前缀，把 WebM 上传到 media COS 前缀；上传后逐项核对 SHA-256/长度/MIME。
4. 对每个 CDN URL 做 HTTPS、`Cache-Control`、CORS 和对象完整性校验；对至少一个 WebM 做 `Range: bytes=0-1023` 并要求 `206 Partial Content`。
5. 构建已嵌入该 release-id CDN URL 的站点 bundle，通过 SSH/rsync 上传到阿里云 staging release。
6. 校验 `index.html`、首屏 JS/CSS、字体、图片和首次可见视频都引用同一个 release-id；检查没有 CNAME 目标、COS 直连 URL 或本地路径泄漏。
7. 通过 `nginx -t` 后原子替换 `current` 软链接并重载；公网冒烟失败时脚本自动切回上一个 release。

如果版本化对象已存在，上传命令只允许“同 SHA 跳过”；同一路径不同 SHA 必须失败，不能静默覆盖。

## 5. COS/CDN 与权限要求

- 腾讯 CAM：仅允许对应 COS bucket/prefix 的对象列举、上传、读取元数据；如脚本确需刷新 CDN，再单独授予最小 CDN 刷新权限。禁止主账号密钥、DNS、CVM、账单权限。
- 阿里云：发布账号仅能写 Tongye release 目录、切换 `current`、执行 Nginx 配置测试/重载；不需要 Docker、数据库或其他站点权限。
- 凭据只在发布主机/CI 的受限 secrets 文件中读取，绝不进入 Git、`dist`、发布清单或日志。
- COS/CDN 必须为 WebM 返回 `Content-Type: video/webm` 并支持 Range；字体/图片必须返回正确 MIME。
- 两个 CDN 域名在边缘响应头固定设置 `Access-Control-Allow-Origin: *`。资源均为公开、无凭据、内容哈希对象；使用通配符可避免 CDN 缓存未按 `Origin` 分片而使 Canvas 资源偶发失去 CORS。

## 6. 上线前检查点

实施事实已经确认：

1. 两个 CDN 通道共用腾讯 COS bucket `tongye-1327162705`，地域为 `ap-shanghai`，以发布前缀和清单分流。
2. 正常发布使用不可变版本路径，不依赖缓存刷新。
3. 网站证书与 CDN SAN 证书独立；三套 Let's Encrypt 证书均由同一台阿里云服务器每日 04:17 的 cron 检查续期。
4. R5 发布资格为 `qualified`，两轮内存证据、站点 bundle 与 CDN 清单均绑定同一 source commit。
5. 凭据位于 root-only secrets 文件；发布结束后应移除临时授予的腾讯 COS/CDN 广泛权限，改回最小权限。

## 7. 验收与回滚

发布通过条件：

- `tongye.me` / `www.tongye.me` 命中阿里云 Nginx，返回该站点自己的有效证书和站点 HTML。
- HTML/JS/CSS 从阿里云 release 提供；图片、字体和 poster 的 Network URL 为 `assets.tongye.me/releases/<release-id>/...`。
- 所有 WebM 的 Network URL 为 `media.tongye.me/releases/<release-id>/...`，且 Range 返回 `206`。
- CDN 证书、CORS、缓存、MIME 与内容长度均正确；没有 COS 直连 URL、默认 CDN 证书、404、混合内容或旧 release URL。
- 回滚仅切回阿里云上一个 `current` 软链接；旧 CDN 对象因版本化而保留，不做删除或覆盖。

## 8. 剩余外部检查点

- 阿里云仍在公网 80 端口返回 `403 Server: Beaver / Non-compliance ICP Filing`；部分公网 TLS 1.2 ClientHello 也会被接入层重置。源站本机已验证 HTTP 301、TLS 1.2、TLS 1.3 和 HTTPS 200 均正常，因此该问题不能通过 Nginx 修复。
- 用户需要在阿里云备案系统为 `tongye.me` 完成当前阿里云服务器/IP 的接入备案或网站信息关联。生效后重新验证 HTTP → HTTPS 301 与公网 TLS 1.2。
- 在此之前 HTTPS 的现代浏览器/TLS 1.3 生产链路已可用，但不能把“全协议上线”标记为完成。
- 保留 `r5-80d55a2` 作为服务器回滚 release；不要删除版本化 CDN 对象。回滚只切换 `current`。
